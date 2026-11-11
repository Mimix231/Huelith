import { createSurface } from '../canvas-surface';
import { isImmutableEffectSource, markImmutableEffectSource } from '../immutable-effect-sources';
import {maskAt,maskPath,rebaseMask} from './clip-layout';
import {keysFromOffset,mapParameterKeys,parameterAt,validParameterLanes,type ParameterKeys} from './parameter-keys';
import {MASK_PARAMETERS,validCrop,type ClipMask} from './studio-types';

type RGB = [number, number, number];
export type GradeWheel = { x: number; y: number; luminance: number };
export type CurvePoint = { x: number; y: number };
export type HslRange = { hue: number; saturation: number; lightness: number };
export type CubeLut = { name: string; dimension: 1 | 3; size: number; min: RGB; max: RGB; values: number[] };
export const BASIC_GRADE=[
  ['temperature','Temperature'],['tint','Tint'],['saturation','Saturation'],['exposure','Exposure'],
  ['contrast','Contrast'],['highlights','Highlights'],['shadows','Shadows'],['whites','Whites'],['blacks','Blacks'],
  ['brilliance','Brilliance'],['sharpen','Sharpen'],['clarity','Clarity'],['grain','Grain'],['fade','Fade'],['vignette','Vignette'],
] as const;
export type BasicGradeParameter=typeof BASIC_GRADE[number][0];
type HslParameter=`hsl.${string}.${keyof HslRange}`;
type WheelParameter=`wheel.${'shadows'|'midtones'|'highlights'}.${keyof GradeWheel}`;
export type GradeParameter=BasicGradeParameter|'lutStrength'|HslParameter|WheelParameter;
export type VideoGrade = {
  basic?:Partial<Record<BasicGradeParameter,number>>;
  keys?:ParameterKeys<GradeParameter>;
  mask?:ClipMask;
  protectSkin?:boolean;
  wheels?: Partial<Record<'shadows' | 'midtones' | 'highlights', GradeWheel>>;
  curves?: Partial<Record<'rgb' | 'red' | 'green' | 'blue', CurvePoint[]>>;
  hsl?: Partial<Record<string, HslRange>>;
  lut?: CubeLut;
  lutStrength?: number;
  match?: { gain: RGB; bias: RGB };
};
export const HUE_BANDS = [
  ['Red', 0], ['Orange', 30], ['Yellow', 60], ['Green', 120],
  ['Cyan', 180], ['Blue', 240], ['Purple', 275], ['Magenta', 320],
] as const;
const gradeNames=[...BASIC_GRADE.map(([name])=>name),'lutStrength',
  ...HUE_BANDS.flatMap(([name])=>['hue','saturation','lightness'].map(channel=>`hsl.${name}.${channel}`)),
  ...['shadows','midtones','highlights'].flatMap(name=>['x','y','luminance'].map(channel=>`wheel.${name}.${channel}`))];
export const identityCurve: CurvePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const inside = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const tuple = (value: unknown, lo: number, hi: number): value is RGB =>
  Array.isArray(value) && value.length === 3 && value.every(n => inside(n, lo, hi));

export function validVideoGrade(value: unknown): value is VideoGrade {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const grade = value as VideoGrade;
  if(grade.basic&&Object.entries(grade.basic).some(([key,amount])=>!BASIC_GRADE.some(([name])=>name===key)||!inside(amount,-1,1)))return false;
  if(grade.keys!==undefined&&!validParameterLanes(grade.keys,gradeNames))return false;
  if(grade.protectSkin!==undefined&&typeof grade.protectSkin!=='boolean')return false;
  if(grade.mask&&(!['rectangle','ellipse'].includes(grade.mask.shape)||!validCrop(grade.mask.region)||!inside(grade.mask.feather,0,.25)
    ||grade.mask.rotation!==undefined&&!inside(grade.mask.rotation,-3600,3600)
    ||grade.mask.keys!==undefined&&!validParameterLanes(grade.mask.keys,MASK_PARAMETERS)))return false;
  if (grade.lutStrength !== undefined && !inside(grade.lutStrength, 0, 1)) return false;
  if (grade.match && (!tuple(grade.match.gain, .25, 4) || !tuple(grade.match.bias, -1, 1))) return false;
  if (grade.wheels && Object.entries(grade.wheels).some(([key, wheel]) => !['shadows', 'midtones', 'highlights'].includes(key)
    || !wheel || ![wheel.x, wheel.y, wheel.luminance].every(n => inside(n, -1, 1)))) return false;
  if (grade.hsl && Object.entries(grade.hsl).some(([key, band]) => !HUE_BANDS.some(([name]) => name === key)
    || !band || ![band.hue, band.saturation, band.lightness].every(n => inside(n, -1, 1)))) return false;
  if (grade.curves && Object.entries(grade.curves).some(([key, points]) => !['rgb', 'red', 'green', 'blue'].includes(key)
    || !Array.isArray(points) || points.length < 2 || points.length > 32 || points[0]?.x !== 0 || points.at(-1)?.x !== 1
    || points.some((point, i) => !point || !inside(point.x, 0, 1) || !inside(point.y, 0, 1) || i > 0 && point.x <= points[i - 1].x))) return false;
  const lut = grade.lut;
  return lut === undefined || !!lut && typeof lut.name === 'string' && lut.name.length <= 160 && (lut.dimension === 1 || lut.dimension === 3)
    && Number.isInteger(lut.size) && lut.size >= 2 && lut.size <= (lut.dimension === 3 ? 65 : 4096)
    && tuple(lut.min, -64, 64) && tuple(lut.max, -64, 64) && lut.min.every((n, i) => n < lut.max[i])
    && Array.isArray(lut.values) && lut.values.length === lut.size ** lut.dimension * 3 && lut.values.every(n => inside(n, -64, 64));
}

export function parseCube(text: string, filename: string): CubeLut {
  let name = filename.slice(0, 160), size = 0, dimension: 1 | 3 = 3;
  let min: RGB = [0, 0, 0], max: RGB = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE ')) {
      name = line.slice(6).trim().replace(/^"|"$/g, '').slice(0, 160);
      continue;
    }
    const [key, ...rest] = line.split(/\s+#/)[0].split(/\s+/);
    if (key === 'LUT_1D_SIZE' || key === 'LUT_3D_SIZE') {
      if (size || rest.length !== 1) throw Error('Choose a .cube file with one 1D or 3D table.');
      dimension = key === 'LUT_1D_SIZE' ? 1 : 3;
      size = Number(rest[0]);
      if (!Number.isInteger(size) || size < 2 || size > (dimension === 3 ? 65 : 4096)) throw Error('Unsupported LUT size.');
      continue;
    }
    if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
      const row = rest.map(Number);
      if (!tuple(row, -64, 64)) throw Error('Invalid LUT domain.');
      if (key === 'DOMAIN_MIN') min = row;
      else max = row;
      continue;
    }
    if (key === 'LUT_3D_INPUT_RANGE' || key === 'LUT_1D_INPUT_RANGE') {
      const [lo, hi] = rest.map(Number);
      if (rest.length !== 2 || !inside(lo, -64, 64) || !inside(hi, -64, 64) || lo >= hi) throw Error('Invalid LUT input range.');
      min = [lo, lo, lo]; max = [hi, hi, hi];
      continue;
    }
    const row = [key, ...rest].map(Number);
    if (!size || !tuple(row, -64, 64) || values.length >= size ** dimension * 3) throw Error('Invalid .cube table row.');
    values.push(...row);
  }
  const lut = { name, size, dimension, min, max, values };
  if (!validVideoGrade({ lut })) throw Error('The .cube table is incomplete.');
  return lut;
}

/** .cube stores red as the fastest-varying axis. */
function sampleCube(values: ArrayLike<number>, size: number, r: number, g: number, b: number, out: RGB) {
  const ri = Math.min(size - 2, Math.floor(r)), gi = Math.min(size - 2, Math.floor(g)), bi = Math.min(size - 2, Math.floor(b));
  const x = r - ri, y = g - gi, z = b - bi;
  const stride = 3 * size, plane = stride * size;
  const i = ri * 3 + gi * stride + bi * plane;
  for (let c = 0; c < 3; c++) {
    const base = i + c;
    const a = values[base] * (1 - x) + values[base + 3] * x;
    const d = values[base + stride] * (1 - x) + values[base + stride + 3] * x;
    const e = values[base + plane] * (1 - x) + values[base + plane + 3] * x;
    const f = values[base + plane + stride] * (1 - x) + values[base + plane + stride + 3] * x;
    out[c] = (a * (1 - y) + d * y) * (1 - z) + (e * (1 - y) + f * y) * z;
  }
}

function curveAt(points: CurvePoint[] | undefined, value: number) {
  if (!points) return value;
  const x = clamp(value), index = Math.max(1, points.findIndex(point => point.x >= x));
  const a = points[index - 1], b = points[index];
  return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
}

function adjustHsl(color: RGB, bands: NonNullable<VideoGrade['hsl']>): RGB {
  const [r, g, b] = color.map(n => clamp(n));
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 1e-6) return color;
  let hue = ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
  let lightness = (max + min) / 2;
  let saturation = d / Math.max(1e-6, 1 - Math.abs(2 * lightness - 1));
  let shift = 0, sat = 0, light = 0;
  for (const [name, center] of HUE_BANDS) {
    const band = bands[name];
    if (!band) continue;
    const distance = Math.abs(((hue - center + 540) % 360) - 180);
    const weight = Math.max(0, 1 - distance / 45);
    shift += band.hue * weight * 60;
    sat += band.saturation * weight;
    light += band.lightness * weight * .35;
  }
  hue = (hue + shift + 360) % 360;
  saturation = clamp(saturation * (1 + sat));
  lightness = clamp(lightness + light * Math.min(1, d * 4));
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const h = hue / 60, x = chroma * (1 - Math.abs(h % 2 - 1));
  const rgb: RGB = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x]
    : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return rgb.map(value => value + lightness - chroma / 2) as RGB;
}

export function gradePixel(rgb: RGB, grade: VideoGrade): RGB {
  let color = rgb.slice() as RGB;
  if (grade.match) color = color.map((value, channel) => value * grade.match!.gain[channel] + grade.match!.bias[channel]) as RGB;
  const l = clamp(color[0] * .2126 + color[1] * .7152 + color[2] * .0722);
  if(grade.basic){
    const b=grade.basic;
    const exposure=2**(2*(b.exposure??0));
    const contrast=1+(b.contrast??0)*.85+(b.clarity??0)*.22;
    const tonal=(b.highlights??0)*l*l*.44+(b.shadows??0)*(1-l)**2*.38
      +(b.whites??0)*l**4*.32+(b.blacks??0)*(1-l)**4*.26+(b.brilliance??0)*4*l*(1-l)*.16;
    const balance=[(b.temperature??0)*.14+(b.tint??0)*.05,-(b.tint??0)*.12,-(b.temperature??0)*.14+(b.tint??0)*.05];
    const saturation=1+(b.saturation??0);
    const fade=(b.fade??0)*.2;
    for(let channel=0;channel<3;channel++){
      const value=(l+(color[channel]-l)*saturation)*exposure;
      color[channel]=((value-.5)*contrast+.5+tonal+balance[channel])*(1-fade)+fade*.6;
    }
  }
  const weights = { shadows: (1 - l) ** 2, midtones: 4 * l * (1 - l), highlights: l * l };
  for (const region of ['shadows','midtones','highlights'] as const) {
    const wheel = grade.wheels?.[region];
    if (!wheel) continue;
    const weight = weights[region];
    color[0] += weight * (wheel.luminance * .35 + wheel.x * .20);
    color[1] += weight * (wheel.luminance * .35 - wheel.x * .09 - wheel.y * .10);
    color[2] += weight * (wheel.luminance * .35 + wheel.y * .22);
  }
  if (grade.hsl) color = adjustHsl(color, grade.hsl);
  if (grade.curves) color = color.map((value, index) => curveAt(grade.curves?.[['red','green','blue'][index] as 'red'|'green'|'blue'], curveAt(grade.curves?.rgb, value))) as RGB;
  if (grade.lut) {
    const lut = grade.lut, strength = grade.lutStrength ?? 1;
    const position = color.map((value, c) => clamp((value - lut.min[c]) / (lut.max[c] - lut.min[c])) * (lut.size - 1));
    const out: RGB = [0, 0, 0];
    if (lut.dimension === 3) sampleCube(lut.values, lut.size, position[0], position[1], position[2], out);
    else for (let c = 0; c < 3; c++) {
      const a = Math.min(lut.size - 2, Math.floor(position[c])), p = position[c] - a;
      out[c] = lut.values[a * 3 + c] * (1 - p) + lut.values[(a + 1) * 3 + c] * p;
    }
    color = color.map((value, c) => value + (out[c] - value) * strength) as RGB;
  }
  if(grade.protectSkin){
    const [red,green,blue]=rgb;
    const warmth=clamp((red-green)*14)*clamp((green-blue)*16)*clamp((.52-red+green)*4)*.72;
    color=color.map((value,index)=>value+(rgb[index]-value)*warmth) as RGB;
  }
  return color.map(value => clamp(value)) as RGB;
}

export function gradeValue(grade:VideoGrade,name:GradeParameter):number {
  if(name==='lutStrength')return grade.lutStrength??1;
  const [group,band,control]=name.split('.');
  if(group==='hsl')return grade.hsl?.[band]?.[control as keyof HslRange]??0;
  if(group==='wheel')return grade.wheels?.[band as keyof NonNullable<VideoGrade['wheels']>]?.[control as keyof GradeWheel]??0;
  return grade.basic?.[name as BasicGradeParameter]??0;
}

export function withGradeValue(grade:VideoGrade,name:GradeParameter,value:number):VideoGrade{
  if(name==='lutStrength')return {...grade,lutStrength:clamp(value)};
  const [group,band,control]=name.split('.');
  const amount=clamp(value,-1,1);
  if(group==='hsl')return {...grade,hsl:{...grade.hsl,[band]:{hue:0,saturation:0,lightness:0,...grade.hsl?.[band],[control]:amount}}};
  if(group==='wheel')return {...grade,wheels:{...grade.wheels,[band]:{x:0,y:0,luminance:0,
    ...grade.wheels?.[band as keyof NonNullable<VideoGrade['wheels']>],[control]:amount}}};
  return {...grade,basic:{...grade.basic,[name]:amount}};
}

export function gradeFromOffset(grade:VideoGrade|undefined,offset:number,stretch=1):VideoGrade|undefined{
  return grade&&{...grade,keys:mapParameterKeys(grade.keys,keys=>keysFromOffset(keys,offset)?.map(key=>({...key,time:key.time*stretch}))),
    mask:rebaseMask(grade.mask,offset,stretch)};
}

const prepared = new WeakMap<VideoGrade, { cube: Float32Array; frames: WeakMap<HTMLCanvasElement, HTMLCanvasElement> }>();

export function applyVideoGrade(source:HTMLCanvasElement,authored?:VideoGrade,time=0,frameIndex=0):HTMLCanvasElement{
  if(!authored)return source;
  let grade=authored;
  const animated=Object.values(authored.keys??{}).some(keys=>!!keys?.length);
  for(const [name,keys] of Object.entries(authored.keys??{}) as [GradeParameter,NonNullable<VideoGrade['keys']>[GradeParameter]][]){
    if(keys?.length)grade=withGradeValue(grade,name,parameterAt(keys,time,gradeValue(grade,name)));
  }
  if(!grade.basic&&!grade.wheels&&!grade.hsl&&!grade.curves&&!grade.lut&&!grade.match)return source;
  const grid=animated?17:33;
  const sharpen=Math.max(0,grade.basic?.sharpen??0),grain=Math.max(0,grade.basic?.grain??0),vignette=Math.max(0,grade.basic?.vignette??0);
  const cacheFrame=!grain&&!grade.mask;
  let entry = animated?undefined:prepared.get(grade);
  if (!entry) {
    const cube = new Float32Array(grid ** 3 * 3);
    let index = 0;
    for (let b = 0; b < grid; b++) for (let g = 0; g < grid; g++) for (let r = 0; r < grid; r++) {
      const [red, green, blue] = gradePixel([r / (grid - 1), g / (grid - 1), b / (grid - 1)], grade);
      cube[index++] = red * 255; cube[index++] = green * 255; cube[index++] = blue * 255;
    }
    entry = { cube, frames: new WeakMap() };
    if(!animated)prepared.set(grade, entry);
  }
  const cached = cacheFrame?entry.frames.get(source):undefined;
  if (cached) return cached;
  const result = createSurface();
  result.width = source.width; result.height = source.height;
  const ctx = result.getContext('2d', { willReadFrequently: true })!;
  const image = source.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, source.width, source.height);
  const width=source.width,height=source.height;
  let maskPixels:Uint8ClampedArray|undefined;
  if(grade.mask){
    const mask=maskAt(grade.mask,time),surface=createSurface();surface.width=width;surface.height=height;
    const maskContext=surface.getContext('2d',{willReadFrequently:true})!;
    maskContext.translate(width/2,height/2);maskPath(maskContext,mask,width,height);
    if(mask.feather)maskContext.filter=`blur(${Math.min(width,height)*mask.feather}px)`;
    maskContext.fill();maskPixels=maskContext.getImageData(0,0,width,height).data;
  }
  const data = image.data, rgb: RGB = [0, 0, 0], scale = (grid - 1) / 255;
  const original=sharpen?data.slice():data;
  const spatial=sharpen||vignette||grain;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const coverage=maskPixels?(grade.mask?.invert?255-maskPixels[i+3]:maskPixels[i+3])/255:1;
    if(!coverage)continue;
    sampleCube(entry.cube, grid, data[i] * scale, data[i + 1] * scale, data[i + 2] * scale, rgb);
    if(spatial){
      const x=(i/4)%width,y=Math.floor(i/4/width);
      const edge=1-vignette*clamp((x/width-.5)**2+(y/height-.5)**2)*1.45;
      const noise=grain?(((Math.imul(i+17,1664525)^Math.imul(frameIndex+1,1013904223))>>>8)%251-125)*grain*.17:0;
      for(let channel=0;channel<3;channel++){
        const at=i+channel;
        const detail=sharpen&&x>0&&x<width-1&&y>0&&y<height-1
          ?sharpen*.44*(original[at]-(original[at-4]+original[at+4]+original[at-width*4]+original[at+width*4])/4):0;
        rgb[channel]=rgb[channel]*edge+noise+detail;
      }
    }
    for(let channel=0;channel<3;channel++)data[i+channel]+=(rgb[channel]-data[i+channel])*coverage;
  }
  ctx.putImageData(image, 0, 0);
  markImmutableEffectSource(result);
  if (cacheFrame&&isImmutableEffectSource(source)) entry.frames.set(source, result);
  return result;
}

export function sampleGradeStats(canvas: HTMLCanvasElement) {
  const surface = createSurface();
  surface.width = 128; surface.height = 72;
  const ctx = surface.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, 128, 72);
  const data = ctx.getImageData(0, 0, 128, 72).data;
  const sums: RGB = [0, 0, 0], histogram = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 192) continue;
    for (let c = 0; c < 3; c++) sums[c] += data[i + c];
    histogram[Math.round(data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722)]++;
    count++;
  }
  if (!count) throw Error('No opaque pixels in this frame to match.');
  function percentile(p: number) {
    let sum = 0;
    for (let i = 0; i < 256; i++) if ((sum += histogram[i]) >= p * count) return i / 255;
    return 1;
  }
  return { average: sums.map(sum => sum / count / 255) as RGB, contrast: Math.max(.04, percentile(.9) - percentile(.1)) };
}

export function matchGrade(source: ReturnType<typeof sampleGradeStats>, target: ReturnType<typeof sampleGradeStats>): NonNullable<VideoGrade['match']> {
  const ratio = clamp(target.contrast / source.contrast, .5, 2);
  return { gain: [ratio, ratio, ratio], bias: target.average.map((value, i) => clamp(value - source.average[i] * ratio, -.45, .45)) as RGB };
}
