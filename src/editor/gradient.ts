import type { GradientStop, VectorShape } from './types';
import { transformGradient } from './gradient-transforms';
import { paletteSample, radialRayCoordinate, rayCoverage } from './gradient-patterns';

export const GRADIENT_MODES = ['linear', 'radial', 'angular', 'reflected', 'diamond', 'spiral', 'freeform', 'mesh'] as const;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const hexRGB = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
const defaultStops: GradientStop[] = [
  { id: 'start', position: 0, color: '#8e83ff', opacity: 1 },
  { id: 'end', position: 1, color: '#ffffff', opacity: 1 },
];
const normalizeStops = (shape: VectorShape) => (shape.gradientStops?.length ? shape.gradientStops : defaultStops)
  .slice().sort((a, b) => a.position - b.position);

type RGBA = [number, number, number, number];
/** Compile all static parameters once per retained buffer; never parse colors inside the pixel loop. */
function compileGradient(shape: VectorShape): (x: number, y: number) => RGBA {
  const mode = shape.gradientMode ?? 'linear';
  const cx = shape.gradientCenterX ?? .5, cy = shape.gradientCenterY ?? .5;
  const rotation = (shape.gradientRotation ?? 0) * Math.PI / 180;
  const sine = Math.sin(rotation), cosine = Math.cos(rotation);
  const repeat = Math.max(1, shape.gradientRepeats ?? 1);
  const twist = shape.gradientTwist ?? (shape.gradientColorMode ? 0 : 2);
  const scale = Math.max(.1, shape.gradientScale ?? 1);
  const skewX = (shape.gradientSkewX ?? 0) / 100;
  const skewY = (shape.gradientSkewY ?? 0) / 100;
  const wave = (shape.gradientWave ?? 0) / 100;
  const frequency = Math.max(.1, shape.gradientFrequency ?? 3);
  const offset = shape.gradientOffset ?? 0;
  const pattern = shape.gradientPattern ?? 'smooth';
  const colorMode = shape.gradientColorMode ?? 'smooth';
  const bandCount = shape.gradientBandCount ?? 8;
  const stack = shape.gradientTransformStack?.filter(node => node.enabled && node.kind !== 'none') ?? [];
  const transform = stack.length ? 'none' : shape.gradientTransform ?? 'none';
  const settings = {
    amount: shape.gradientTransformAmount ?? 100,
    frequency: shape.gradientTransformFrequency ?? 2,
    count: shape.gradientTransformCount ?? 14,
    phase: shape.gradientTransformPhase ?? 0,
    seed: shape.gradientTransformSeed ?? 12,
    centerX: cx, centerY: cy,
  };
  const baselineSample = (transform !== 'none' && settings.amount < 100) || stack.some(node => node.amount < 100)
    ? compileGradient({...shape,gradientTransform:'none',gradientTransformStack:[]}) : null;
  const hasGuide = shape.gradientStartX !== undefined && shape.gradientEndX !== undefined;
  const guideStartX = shape.gradientStartX ?? 0, guideStartY = shape.gradientStartY ?? .5;
  const guideDeltaX = (shape.gradientEndX ?? 1) - guideStartX;
  const guideDeltaY = (shape.gradientEndY ?? .5) - guideStartY;
  const guideLengthSq = Math.max(.0000005, guideDeltaX**2 + guideDeltaY**2);
  const rayCount = Math.max(2, Math.round(shape.gradientRayCount ?? 20));
  const rayWidth = clamp(shape.gradientRayWidth ?? .55);
  const raySoftness = clamp(shape.gradientRaySoftness ?? (shape.gradientColorMode ? 0 : .04));
  const rayTaper = clamp(shape.gradientRayTaper ?? 0);
  const rayGlow = clamp(shape.gradientRayGlow ?? 0);
  const seed = Math.round(shape.gradientRaySeed ?? 12);
  const hash = (n:number) => { const a=Math.sin(n*127.1+seed*68.17)*43758.545;return a-Math.floor(a); };
  const stops = normalizeStops(shape).map(stop => ({position: stop.position, color: hexRGB(stop.color), alpha: stop.opacity * 255}));
  const points = (shape.gradientPoints?.length ? shape.gradientPoints : [
    {x:0,y:0,color:'#8e83ff'}, {x:1,y:1,color:'#ffffff'},
  ]).map(point => ({...point,rgb:hexRGB(point.color)}));
  const cornerColor = (x: number, y: number) => points.find(point => point.x === x && point.y === y)?.rgb ?? hexRGB(x===y?'#8e83ff':'#ffffff');
  const corner = [cornerColor(0,0),cornerColor(1,0),cornerColor(0,1),cornerColor(1,1)];
  const mix = (a: number, b: number, t: number) => a + (b-a)*t;
  return (originalX: number, originalY: number): RGBA => {
    // Ordered stack: coordinate warps compose spatially, while field generators
    // blend onto the palette field. Disabled nodes do not affect the result.
    let warped = transformGradient(transform, originalX, originalY, settings);
    let fieldWeight = transform === 'none' ? 0 : clamp(settings.amount / 100);
    for (const step of stack) {
      const mapped = transformGradient(step.kind, warped.x, warped.y, step);
      const contribution = Math.max(0, Math.min(1, step.amount / 100));
      if (mapped.field !== undefined) fieldWeight = fieldWeight + contribution * (1 - fieldWeight);
      warped = { x: mapped.x, y: mapped.y, field: mapped.field === undefined ? warped.field
        : warped.field === undefined ? mapped.field
          : warped.field * (1 - contribution) + mapped.field * contribution };
    }
    const x = warped.x, y = warped.y;
    const px=x-cx, py=y-cy;
    // AM2: procedural *field* recipes have priority over a preset radial pattern.
    // Previously the pattern branch returned before this evaluation: adding
    // Diamond Grid, Starburst, Pinwheel, Solar Rings, etc. changed the saved
    // stack but NEVER altered pixels when a Burst pattern was active.
    if (warped.field !== undefined) {
      const t=clamp(warped.field+offset);
      const mapped=paletteSample(stops,shape.gradientReverse?1-t:t,colorMode,bandCount);
      if (!baselineSample || fieldWeight >= .99999) return mapped;
      const original=baselineSample(originalX,originalY);
      return [mix(original[0],mapped[0],fieldWeight),mix(original[1],mapped[1],fieldWeight),
        mix(original[2],mapped[2],fieldWeight),mix(original[3],mapped[3],fieldWeight)];
    }
    if (pattern !== 'smooth') {
      // New discrete patterns are true geometric color fields, not a smooth ramp
      // with renamed colors. Warp the coordinates first so Twirl and Wave can
      // reshape the rays without flattening the Gradient layer.
      if (shape.gradientColorMode) {
        const rays = radialRayCoordinate(x,y,{centerX:cx,centerY:cy,width:shape.width,height:shape.height,
          rayPairs:rayCount,rotation:shape.gradientRotation ?? 0,twist,scale});
        const span = Math.max(.02,Math.min(.98,rayWidth * (1-rayTaper*Math.min(1,rays.radius)*.65)));
        const coverage = rayCoverage(rays.fraction,span,raySoftness);
        if (colorMode === 'pattern') {
          // Each ray can carry its own solid user-edited palette entry.
          const sector = rays.index*2 + (rays.fraction < span ? 0 : 1);
          const index = (sector%stops.length + stops.length)%stops.length;
          const selectedIndex=shape.gradientReverse ? stops.length-1-index : index;
          const stop=stops[selectedIndex];
          return [stop.color[0],stop.color[1],stop.color[2],stop.alpha];
        }
        const first=stops[shape.gradientReverse?stops.length-1:0];
        const last=stops[shape.gradientReverse?0:stops.length-1];
        if (colorMode === 'alternating' || colorMode === 'hardStops') {
          return [mix(last.color[0],first.color[0],coverage),mix(last.color[1],first.color[1],coverage),
            mix(last.color[2],first.color[2],coverage),mix(last.alpha,first.alpha,coverage)];
        }
        // Smooth/banded/stepped modes follow the full angular ray waveform.
        // This is distinct from the two-color hard wedge used by Alternating.
        const angleRamp = rays.fraction < span ? rays.fraction/span : (1-rays.fraction)/Math.max(.000001,1-span);
        return paletteSample(stops,shape.gradientReverse?1-angleRamp:angleRamp,colorMode,bandCount);
      }
      const rx = (px*cosine+py*sine)/scale;
      const ry = (py*cosine-px*sine)/scale;
      const radius = Math.hypot(rx,ry) * 1.41421356237;
      const theta = Math.atan2(ry,rx)/(Math.PI*2);
      // Angle and radius are separately meaningful: radial spokes can spiral, while
      // pure sunbursts keep their edges perfectly straight.
      const bend = twist * radius * (pattern === 'sunburst' ? .15 : .075);
      const coordinate = (theta+bend+offset) * rayCount;
      const sector = Math.floor(coordinate), fraction = coordinate-sector;
      const jitter = pattern === 'speedlines' ? .65+.55*hash(sector) : 1;
      const span = clamp(rayWidth * jitter * (1 - rayTaper * Math.min(1,radius) * .65));
      const feather = Math.max(.0001,raySoftness * .5);
      const smooth = (a:number,b:number,value:number) => { const t=clamp((value-a)/Math.max(.000001,b-a));return t*t*(3-2*t); };
      const segment = smooth(0,feather,fraction) * (1-smooth(span-feather,span+feather,fraction));
      // Sharp alternating bands for posters; tapering fine streaks and luminous
      // fibers for anime-action / radial-energy backgrounds.
      const filament = pattern === 'speedlines'
        ? Math.pow(Math.max(0,Math.sin(fraction*120 + hash(sector+23)*6)),14) * rayGlow
        : 0;
      const core = pattern === 'speedlines' ? (1-smooth(.015,.28,Math.min(radius,1)))*.5 : 0;
      const brightness = clamp(segment + filament * (1-segment) + core * (1-segment));
      // The ray mask samples the entire user-edited ramp, not just first/last colors.
      let left=stops[0],right=stops[stops.length-1];
      if (brightness <= left.position) right=left;
      else if (brightness >= right.position) left=right;
      else for(let k=1;k<stops.length;k++) if(brightness<=stops[k].position){left=stops[k-1];right=stops[k];break;}
      const u=left===right?0:clamp((brightness-left.position)/Math.max(.000001,right.position-left.position));
      const source=[0,1,2].map(i=>mix(left.color[i],right.color[i],u));
      const alpha=mix(left.alpha,right.alpha,u);
      const falloff = 1;
      const shine = rayGlow * (1-brightness) * (pattern === 'speedlines' ? 0.27 : .04);
      return [Math.min(255,source[0]+255*shine),Math.min(255,source[1]+255*shine),Math.min(255,source[2]+255*shine),alpha*falloff];
    }
    const xr=(px*cosine+py*sine)/scale, yr=(py*cosine-px*sine)/scale;
    const tx=cx + xr + skewX*yr + wave*Math.sin((yr+.5)*Math.PI*2*frequency);
    const ty=cy + yr + skewY*xr + wave*Math.cos((xr+.5)*Math.PI*2*frequency);
    if (mode === 'freeform') {
      let total=0,r=0,g=0,b=0;
      for (const point of points) {
        const distance=(tx-point.x)**2+(ty-point.y)**2;
        if (distance < 1e-8) return [point.rgb[0],point.rgb[1],point.rgb[2],255];
        const weight=1/(distance+.001);total+=weight;
        r+=point.rgb[0]*weight;g+=point.rgb[1]*weight;b+=point.rgb[2]*weight;
      }
      return [r/total,g/total,b/total,255];
    }
    if (mode === 'mesh') {
      const u=clamp(tx),v=clamp(ty);
      const values=[0,1,2].map(i=>mix(mix(corner[0][i],corner[1][i],u),mix(corner[2][i],corner[3][i],u),v));
      return [values[0],values[1],values[2],255];
    }
    // Geometric transform applies to all modes, including freeform/mesh below.
    const dx = x-cx, dy = y-cy;
    const rx = (dx*cosine+dy*sine)/scale;
    const ry = (dy*cosine-dx*sine)/scale;
    const sx = rx + skewX*ry + wave*Math.sin((ry+.5)*Math.PI*2*frequency);
    const sy = ry + skewY*rx + wave*Math.cos((rx+.5)*Math.PI*2*frequency);
    const xx = sx, yy = sy;
    let t=0;
    switch(mode){
      case 'linear':t=hasGuide ? ((x-guideStartX)*guideDeltaX+(y-guideStartY)*guideDeltaY)/guideLengthSq : xx+.5;break;
      case 'radial':t=hasGuide ? Math.hypot(x-guideStartX,y-guideStartY)/Math.sqrt(guideLengthSq) : Math.hypot(xx,yy)*1.41421356237;break;
      case 'angular':t=Math.atan2(yy,xx)/(2*Math.PI)+.5;break;
      case 'reflected':t=hasGuide ? 1-Math.abs(((x-guideStartX)*guideDeltaX+(y-guideStartY)*guideDeltaY)/guideLengthSq*2-1) : 1-Math.abs(xx*2);break;
      case 'diamond':t=Math.abs(xx)+Math.abs(yy);break;
      case 'spiral':t=Math.atan2(yy,xx)/(2*Math.PI)+.5+Math.hypot(xx,yy)*1.41421356237*twist;break;
    }
    if (warped.field !== undefined) t = warped.field;
    t += offset;
    if (shape.gradientMirror) t=1-Math.abs(((t % 2)+2)%2 - 1);
    if (shape.gradientReverse) t=1-t;
    if (mode === 'spiral' || mode === 'angular') t=((t*repeat)%1+1)%1;
    t=clamp(t);
    return paletteSample(stops,t,colorMode,bandCount);
  };
}

export function gradientSample(shape: VectorShape, x: number, y: number): RGBA {
  return compileGradient(shape)(x,y);
}

const cache = new Map<string, HTMLCanvasElement>();
/** Full-resolution retained gradient buffer, invalidated on geometry or parameter changes. */
export function gradientShapeCanvas(shape: VectorShape): HTMLCanvasElement | null {
  const w = Math.round(Math.abs(shape.width)), h = Math.round(Math.abs(shape.height));
  if (w < 1 || h < 1 || w * h > 64_000_000) return null;
  const key = JSON.stringify([w, h, shape.gradientMode, shape.gradientStops, shape.gradientPoints,
    shape.gradientTwist, shape.gradientRotation, shape.gradientRepeats, shape.gradientReverse,
    shape.gradientCenterX, shape.gradientCenterY, shape.gradientScale, shape.gradientSkewX,
    shape.gradientSkewY, shape.gradientWave, shape.gradientFrequency, shape.gradientOffset, shape.gradientMirror,
    shape.gradientPattern, shape.gradientColorMode, shape.gradientBandCount, shape.gradientRayCount, shape.gradientRayWidth, shape.gradientRaySoftness,
    shape.gradientRayTaper, shape.gradientRayGlow, shape.gradientRaySeed,
    shape.gradientStartX, shape.gradientStartY, shape.gradientEndX, shape.gradientEndY,
    shape.gradientTransform, shape.gradientTransformAmount, shape.gradientTransformFrequency,
    shape.gradientTransformCount, shape.gradientTransformPhase, shape.gradientTransformSeed,shape.gradientTransformStack]);
  const stored = cache.get(key);
  if (stored) { cache.delete(key); cache.set(key, stored); return stored; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const data = ctx.createImageData(w, h);
  // Compile palette/geometry once, then evaluate full-resolution pixels without reducing quality.
  const sample = compileGradient(shape);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = sample((x + .5) / w, (y + .5) / h);
      const i = (y * w + x) * 4;
      data.data[i] = color[0]; data.data[i + 1] = color[1]; data.data[i + 2] = color[2]; data.data[i + 3] = color[3];
    }
  }
  ctx.putImageData(data, 0, 0);
  cache.set(key, canvas);
  while (cache.size > 5) cache.delete(cache.keys().next().value!);
  return canvas;
}

export function drawGradientShape(ctx: CanvasRenderingContext2D, shape: VectorShape): void {
  const image = gradientShapeCanvas(shape);
  if (image) ctx.drawImage(image, shape.x, shape.y, shape.width, shape.height);
}

/** Fast workspace preview: same compiled algorithm, limited pixel budget, never a committed export. */
export function paintGradientPreview(ctx: CanvasRenderingContext2D, shape: VectorShape, width: number, height: number): void {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const image = ctx.createImageData(w, h);
  const sample = compileGradient(shape);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const color = sample((x + .5) / w, (y + .5) / h), offset = (y * w + x) * 4;
    image.data[offset] = color[0]; image.data[offset + 1] = color[1];
    image.data[offset + 2] = color[2]; image.data[offset + 3] = color[3];
  }
  ctx.putImageData(image, 0, 0);
}
