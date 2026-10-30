import { createSurface } from './canvas-surface';
import type { Effect } from './types';
import { DEDICATED_EFFECTS } from './effects/index';
import { isImmutableEffectSource } from './immutable-effect-sources';

/** Curated non-destructive additions: each key owns one specific math/geometry
 * path. They share low-level sampling utilities, not other named filter recipes. */
const sections = [
  ['Color Science', ['Chromatic Adaptation','Shadow Chromaticity','Highlight Chromaticity','Three-Way Grade','Cross Process','Bleach Bypass','Teal & Amber','Channel Compression','Luma-Chroma Separation','Filmic Shoulder','Filmic Toe','Logarithmic Grade','Selective Chromaticity','Gamut Soft Clip','Palette Quantizer','Split Tone Spectrum']],
  ['Lighting & Atmosphere', ['Directional Light Shafts','Specular Glints','Light Scattering','Silhouette Rimlight','Sunburst Rays','Atmospheric Fog','Cinematic Haze','Underwater Caustics','Lightning Flash','Ambient Wrap Lighting','Sparkling Highlights','Sunrise Illumination','Moonlight Casting','Shadowed Mist']],
  ['Artistic Painting', ['Charcoal Drawing','Sidewalk Chalk','Soft Pastel','Opaque Gouache','Woodcut Engraving','Copper Etching','Charcoal Hatching','Ink Stippling','Colored Pencils','Oil Impasto','Watercolor Bleeding','Lithographic Press','Felt-Tip Drawing','Wax Crayon','Airbrush Spray','Stained Glass','Graphite Shading','Dry Brush Painting']],
  ['Distortion & Geometry', ['Polar Warp','Pinch Lens','Barrel Distortion','Pincushion Distortion','Oblique Shear','Noise Displacement','Sine Fold','Quadrant Kaleidoscope','Warped Waves','Spiral Vortex','Crystal Shatter','Mirror Slices','Pixel Sorting','Curved Glass']],
  ['Anime & Comics', ['Manga Screentones','Diagonal Screentone','Crosshatch Ink','Impact Speedlines','Black Ink Shadows','Cel Highlight Bands','Color Registration','Energy Eyes','Manga Shadow Bands','Sharp Contour Ink','Two-Tone Comic Ink','Panel Perspective','Anime Energy Lines','Flat Anime Colors','Scratch Ink','Retro Comic Misprint']],
  ['Materials & Surfaces', ['Brushed Aluminum','Gold Foil','Reflective Chrome','Ceramic Glaze','Frosted Acrylic','Woven Linen','Aged Parchment','Sandstone Grain','Leather Texture','Carbon Fiber','Iridescent Film','Concrete Pores','Gemstone Facets','Polished Wood']],
  ['Digital & Experimental', ['Databent Stripes','Bitplane Crush','Chromatic Ghost','Damaged Data Blocks','Tracking Roll','Codec Mosaic','Pixel Rearrangement','Broken LCD','Signal Static','Green Phosphor','RGB Subpixel Mask','Color Data Tears','Corrupted Sectors','Dot Matrix Display']],
  ['Cinematic & Optical', ['Film Halation','Anamorphic Streak','Lens Ghost','Edge Focus Vignette','Prismatic Lens','Star Filter','Cinematic Contrast Curve','Film Negative','Silver Retention','Lens Curvature','Rolling Shutter','Split Diopter','Optical Color Fringe','Golden Lens Flare']],
] as const;
export type ExpandedEffect = { kind:`atelier_${number}_${number}`;label:string;group:string;initial:number;min:number;max:number;unit:'%';step:1;section:number;variant:number };
export const EXPANSION_120: readonly ExpandedEffect[] = sections.flatMap(([group,names],section) =>
  names.map((label,variant)=>({kind:`atelier_${section}_${variant}` as `atelier_${number}_${number}`,label,group,initial:70,min:0,max:100,unit:'%' as const,step:1 as const,section,variant}))) ;
export const EXPANSION_LOOKUP: ReadonlyMap<string,ExpandedEffect> = new Map(EXPANSION_120.map(item=>[item.kind,item]));
if(EXPANSION_120.length!==120||new Set(EXPANSION_120.map(i=>i.kind)).size!==120) throw Error('Expected 120 independent operations');

/** Only immutable worker-owned source canvases retain readback bytes.
 * Export and mutable user canvases always reread their latest artwork. */
const retainedPixels = new WeakMap<HTMLCanvasElement,{width:number;height:number;data:Uint8ClampedArray}>();
function sourceBytes(source:HTMLCanvasElement):Uint8ClampedArray {
  const {width,height}=source;
  if(isImmutableEffectSource(source)){
    const cached=retainedPixels.get(source);
    if(cached?.width===width && cached.height===height)return cached.data;
  }
  const ctx=source.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('No 2D context for Huelith effect source');
  const data=ctx.getImageData(0,0,width,height).data;
  if(isImmutableEffectSource(source))retainedPixels.set(source,{width,height,data});
  return data;
}
export interface Expansion120Job {
  runRows(rows:number):boolean;
  output():HTMLCanvasElement;
}
/** All 120 catalog effects MUST have dedicated processors. The old
 * monolithic placeholder switch has been removed; unknown effects cannot
 * silently display a vaguely similar image. This path serves BOTH worker
 * preview and exact final rendering. */
export function createExpansion120Job(source:HTMLCanvasElement,effect:Effect):Expansion120Job {
  if(!EXPANSION_LOOKUP.has(effect.kind))return {runRows:()=>true,output:()=>source};
  if(!Number.isFinite(effect.amount)||effect.amount<=0)return {runRows:()=>true,output:()=>source};
  const kernelFactory=DEDICATED_EFFECTS.get(effect.kind);
  if(!kernelFactory)throw Error(`Missing dedicated Huelith effect processor: ${effect.kind}`);
  const {width,height}=source;
  const input=sourceBytes(source);
  const output=createSurface();output.width=width;output.height=height;
  const context=output.getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('No canvas context for Huelith effect output');
  const result=context.createImageData(width,height);
  const kernel=kernelFactory({source:input,width,height,amount:Math.max(0,Math.min(1,effect.amount/100)),parameters:effect.parameters??{}});
  let row=0;
  return {runRows(lines:number){
    if(row>=height)return true;
    const next=Math.min(height,row+Math.max(1,Math.floor(lines)));
    kernel.renderRows(row,next,result.data);row=next;
    if(row===height)context.putImageData(result,0,0);
    return row===height;
  },output:()=>output};
}
export function renderExpansion120(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
  const job=createExpansion120Job(source,effect);
  job.runRows(Number.MAX_SAFE_INTEGER);
  return job.output();
}
