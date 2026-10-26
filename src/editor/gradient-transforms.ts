/** Huelith Gradient Designer: independent coordinate/field transforms. No AI or image lookup.
 * Inputs and outputs are normalized document coordinates. This module is deliberately
 * DOM-free so renderer, exporter, animation and browser tests use identical math. */
export const GRADIENT_TRANSFORMS = [
  { id: 'none', name: 'Unmodified', category: 'Core', description: 'The original editable gradient.' },
  { id: 'starburst', name: 'Starburst', category: 'Radial', description: 'Hard alternating rays around a movable center.' },
  { id: 'speedRays', name: 'Speed rays', category: 'Radial', description: 'Thin tapered action streaks.' },
  { id: 'pinwheel', name: 'Pinwheel', category: 'Radial', description: 'Rotating curved wedges.' },
  { id: 'solarRings', name: 'Solar rings', category: 'Radial', description: 'Concentric repeated light bands.' },
  { id: 'twirl', name: 'Twirl', category: 'Distort', description: 'Distance-weighted angular rotation.' },
  { id: 'wave', name: 'Wave', category: 'Distort', description: 'Sine displacement perpendicular to the gradient.' },
  { id: 'zigzag', name: 'Zigzag', category: 'Distort', description: 'Triangle-wave spatial displacement.' },
  { id: 'ripple', name: 'Ripple', category: 'Distort', description: 'Radial oscillating displacement.' },
  { id: 'bulge', name: 'Bulge', category: 'Distort', description: 'Expand the center and squeeze the edges.' },
  { id: 'pinch', name: 'Pinch', category: 'Distort', description: 'Contract the center towards the pivot.' },
  { id: 'whirlpool', name: 'Whirlpool', category: 'Distort', description: 'Inverse-distance logarithmic spiral.' },
  { id: 'turbulence', name: 'Turbulence', category: 'Distort', description: 'Smooth multi-frequency procedural noise warp.' },
  { id: 'kaleidoscope', name: 'Kaleidoscope', category: 'Geometry', description: 'Mirrored angular wedges.' },
  { id: 'mirrorTiles', name: 'Mirror tiles', category: 'Geometry', description: 'Alternating mirror-reflected tiles.' },
  { id: 'diamondGrid', name: 'Diamond grid', category: 'Geometry', description: 'Repeated diamond distance bands.' },
  { id: 'checkerWaves', name: 'Checker waves', category: 'Geometry', description: 'Offset alternating checker cells.' },
  { id: 'hexFlow', name: 'Hex flow', category: 'Geometry', description: 'Hexagonal flow-field bands.' },
  { id: 'interference', name: 'Interference', category: 'Geometry', description: 'Overlapping circular wavefronts.' },
  { id: 'perspectiveBands', name: 'Perspective bands', category: 'Geometry', description: 'Tapering stripes converging toward a vanishing point.' },
  { id: 'lightBeams', name: 'Light beams', category: 'Light', description: 'Wide soft rays with bright centers.' },
  { id: 'neonStreams', name: 'Neon streams', category: 'Light', description: 'Sine-bent luminous ribbons.' },
  { id: 'auroraCurtains', name: 'Aurora curtains', category: 'Light', description: 'Flowing upright folds of light.' },
  { id: 'diffraction', name: 'Diffraction', category: 'Light', description: 'Phase-interfering colored rings.' },
  { id: 'crystalBloom', name: 'Crystal bloom', category: 'Huelith', description: 'Angular crystal facets growing from the pivot.' },
  { id: 'prismaticCurrent', name: 'Prismatic current', category: 'Huelith', description: 'Branching refractive current lines.' },
  { id: 'celestialWeave', name: 'Celestial weave', category: 'Huelith', description: 'Two interlacing ribbon fields.' },
] as const;
export type GradientTransform = typeof GRADIENT_TRANSFORMS[number]['id'];
export const gradientTransformNames = new Set<string>(GRADIENT_TRANSFORMS.map(item => item.id));

export interface TransformSettings {
  amount: number; frequency: number; count: number; phase: number; seed: number;
  centerX: number; centerY: number;
}
const TAU = Math.PI * 2;
const fract = (x: number) => x - Math.floor(x);
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const triangle = (x: number) => 1 - Math.abs(fract(x) * 2 - 1) * 2;
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const noise = (x: number, y: number, seed: number) => {
  const hash = (i: number, j: number) => fract(Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453);
  const a = Math.floor(x), b = Math.floor(y), u = smooth(x-a), v = smooth(y-b);
  const top = hash(a,b)*(1-u)+hash(a+1,b)*u, bottom = hash(a,b+1)*(1-u)+hash(a+1,b+1)*u;
  return top*(1-v)+bottom*v;
};

/** An optional `field` replaces the usual ramp coordinate without recoloring the source.
 * A coordinate warp instead changes the actual gradient geometry. */
export function transformGradient(kind: GradientTransform, x: number, y: number, s: TransformSettings): { x: number; y: number; field?: number } {
  if (kind === 'none' || s.amount <= 0) return { x, y };
  const strength = clamp(s.amount / 100), f = Math.max(.1, s.frequency);
  const count = Math.max(2, Math.min(360, Math.round(s.count)));
  const dx = x-s.centerX, dy = y-s.centerY, r = Math.hypot(dx,dy), angle = Math.atan2(dy,dx);
  const a = angle / TAU + .5, phase = s.phase / 100, seed = s.seed;
  const reorient = (radius: number, theta: number) => ({x: s.centerX + Math.cos(theta)*radius, y:s.centerY + Math.sin(theta)*radius});
  switch (kind) {
    case 'starburst': return { x,y, field: .5 + .5*triangle(a*count+phase*count) };
    case 'speedRays': {
      const sector = Math.floor(a*count), fine = fract(a*count);
      const seedWidth = .10 + .5*noise(sector*0.7,0,seed);
      const streak = Math.pow(1-clamp(Math.abs(fine-.5)/seedWidth), 3);
      return { x,y,field:clamp(streak+Math.pow(1-clamp(r*2),4)*.3) };
    }
    case 'pinwheel': return { x,y,field: .5+.5*triangle((a + r*strength*2)*count + phase) };
    case 'solarRings': return {x,y,field:.5+.5*Math.cos((r*f*count+phase)*TAU)};
    case 'twirl': return reorient(r,angle+(1-smooth(r))**2*strength*TAU*2.5);
    case 'wave': return {x:x+Math.sin((y*f+phase)*TAU)*.22*strength,y};
    case 'zigzag': return {x:x+triangle(y*f+phase)*.26*strength,y};
    case 'ripple': return reorient(r+Math.sin((r*f*5+phase)*TAU)*.055*strength,angle);
    case 'bulge': return reorient(r*(1-.55*strength*Math.exp(-r*r*8)),angle);
    case 'pinch': return reorient(r*(1+.9*strength*Math.exp(-r*r*8)),angle);
    case 'whirlpool': return reorient(r,angle+Math.log1p(1/(r+.035))*strength*1.5);
    case 'turbulence': {
      const warp = (px:number,py:number) => ((noise(px*f*5,py*f*5,seed)-.5)*.75+(noise(px*f*11,py*f*11,seed+1)-.5)*.25)*.28*strength;
      return {x:x+warp(x,y),y:y+warp(y,x)};
    }
    case 'kaleidoscope': {
      const sector=TAU/count, folded=Math.abs((((angle+TAU*2)%sector)/sector)*2-1)*sector/2;
      const mapped=reorient(r,folded+phase*TAU);
      return {x:x+(mapped.x-x)*strength,y:y+(mapped.y-y)*strength};
    }
    case 'mirrorTiles': {
      const mirrored=(t:number) => 1-Math.abs(fract(t*f*count/4)*2-1);
      return {x:x*(1-strength)+mirrored(x)*strength,y:y*(1-strength)+mirrored(y)*strength};
    }
    case 'diamondGrid': return {x,y,field: .5+.5*triangle((Math.abs(fract(x*f)-.5)+Math.abs(fract(y*f)-.5))*count/2)};
    case 'checkerWaves': {
      const offset=Math.sin(y*f*TAU)*.22*strength;
      return {x,y,field:((Math.floor((x+offset)*count/2)+Math.floor(y*count/2))%2+2)%2};
    }
    case 'hexFlow': {
      const q=(x*2/3)*count, rr=(-x/3+Math.sqrt(3)*y/3)*count;
      return {x,y,field:.5+.5*Math.cos((q+rr+Math.sin(rr*TAU)*strength)*TAU/3)};
    }
    case 'interference': return {x,y,field:.5+.25*Math.sin(Math.hypot(dx-.22,dy)*f*count*TAU)+.25*Math.sin(Math.hypot(dx+.22,dy)*f*count*TAU+phase)};
    case 'perspectiveBands': return {x,y,field:.5+.5*triangle((Math.atan2(dx,dy+.065)/(Math.PI)+phase)*count/2)};
    case 'lightBeams': return {x,y,field:Math.pow(Math.max(0,.5+.5*Math.cos((a*count+phase)*TAU)),2.5)};
    case 'neonStreams': return {x,y,field:Math.pow(Math.max(0,.5+.5*Math.cos((x+.16*Math.sin((y*f+phase)*TAU))*count*TAU/3)),8)};
    case 'auroraCurtains': return {x,y,field:clamp(Math.pow(Math.abs(Math.sin((x*f*2+.20*Math.sin(y*TAU*f)+phase)*TAU)),7)*(1-.5*y))};
    case 'diffraction': return {x,y,field:.5+.25*Math.sin((r*f*count+phase)*TAU)+.25*Math.sin((r*f*(count+1)+phase)*TAU)};
    case 'crystalBloom': {
      const facet=fract(a*count), ring=fract(r*f*count*.24);
      return {x,y,field:clamp((1-Math.abs(facet-ring)*2)*(.35+.65*triangle(r*f*2)))};
    }
    case 'prismaticCurrent': {
      const branch=Math.sin((x*f*3+Math.sin(y*f*5+seed)*.25)*TAU)*Math.cos((y*f*3+phase)*TAU);
      return {x,y,field:Math.pow(Math.abs(branch),6)};
    }
    case 'celestialWeave': {
      const crossA=Math.sin((x+Math.sin(y*f*TAU)*.15)*f*TAU*3);
      const crossB=Math.cos((y+Math.sin(x*f*TAU)*.15)*f*TAU*3);
      return {x,y,field:clamp(Math.max(Math.pow(Math.abs(crossA),14),Math.pow(Math.abs(crossB),14)*.8))};
    }
  }
  return { x, y };
}
