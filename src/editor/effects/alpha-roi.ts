/**
 * Alpha-aware region-of-interest processing for spatial effects.
 * The optimized region is not a low-resolution preview: the effect is
 * evaluated at native pixel dimensions, including an analytically bounded
 * point-spread halo, then restored to the original canvas coordinates.
 * For opaque/full-frame artwork it deliberately uses the normal full canvas.
 */
import {createSurface} from '../canvas-surface';
import {isImmutableEffectSource} from '../immutable-effect-sources';
import type {Effect} from '../types';
import type {SpatialMode} from './spatial-gpu';
interface Rect{x:number;y:number;right:number;bottom:number}
const cached=new WeakMap<HTMLCanvasElement,Rect|null>();
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
function visible(source:HTMLCanvasElement):Rect|null{
  if(isImmutableEffectSource(source)&&cached.has(source))return cached.get(source)??null;
  const {width:w,height:h}=source;
  const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)return {x:0,y:0,right:w,bottom:h};
  const data=ctx.getImageData(0,0,w,h).data;
  let left=w,top=h,right=0,bottom=0;
  // alpha-only scanning. Canvas2D returns zero RGB for fully transparent pixels.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(data[(y*w+x)*4+3]===0)continue;
    if(x<left)left=x;if(y<top)top=y;if(x+1>right)right=x+1;if(y+1>bottom)bottom=y+1;
  }
  const found=right>left?{x:left,y:top,right,bottom}:null;
  if(isImmutableEffectSource(source))cached.set(source,found);
  return found;
}

export function renderSpatialRoi(
  source:HTMLCanvasElement,effect:Effect,mode:SpatialMode,
  processor:(image:HTMLCanvasElement,adjusted:Effect)=>HTMLCanvasElement,
):HTMLCanvasElement|null {
  const w=source.width,h=source.height;
  if(w*h<512*512)return null;
  // Don't read back an entire opaque photograph just to discover it's opaque.
  // Checking one corner is not a proof of full opacity, so this only rejects
  // ROI for the common fully-opaque case when ALL four corners are opaque.
  const ctx=source.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
  const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
  if(corners.every(([x,y])=>ctx.getImageData(x,y,1,1).data[3]===255))return null;
  const box=visible(source);
  if(!box){const empty=createSurface();empty.width=w;empty.height=h;return empty;}
  const radius=clamp(effect.amount,0,70)*.35;
  const cx=w*(effect.parameters?.centerX??50)/100;
  const cy=h*(effect.parameters?.centerY??50)/100;
  let minX=box.x,minY=box.y,maxX=box.right,maxY=box.bottom;
  if(mode==='radial'){
    // A rotating source can extend into every output position on the rotated
    // swept rectangle. Bound the sweep at both angular endpoints and at zero.
    const angle=radius*Math.PI/180;
    for(const [x,y] of [[box.x,box.y],[box.right,box.y],[box.x,box.bottom],[box.right,box.bottom]]){
      for(const a of [-angle,0,angle]){
        const dx=x-cx,dy=y-cy;
        const rx=cx+dx*Math.cos(a)-dy*Math.sin(a);
        const ry=cy+dx*Math.sin(a)+dy*Math.cos(a);
        minX=Math.min(minX,rx);minY=Math.min(minY,ry);
        maxX=Math.max(maxX,rx);maxY=Math.max(maxY,ry);
      }
    }
  }
  const halo=(mode==='motion'?radius*2.2:mode==='lens'?radius:2)+3;
  const x0=clamp(Math.floor(minX-halo),0,w),y0=clamp(Math.floor(minY-halo),0,h);
  const x1=clamp(Math.ceil(maxX+halo),0,w),y1=clamp(Math.ceil(maxY+halo),0,h);
  const cw=x1-x0,ch=y1-y0;
  // Reject when the source is largely filled or cropping gains little.
  if(cw<=0||ch<=0||cw*ch>w*h*.78)return null;
  const cropped=createSurface();cropped.width=cw;cropped.height=ch;
  const painter=cropped.getContext('2d');if(!painter)return null;
  painter.drawImage(source,-x0,-y0);
  const parameters={...effect.parameters,
    centerX:(cx-x0)/cw*100,
    centerY:(cy-y0)/ch*100,
    // Focus circle is specified relative to the full document's shorter edge.
    focusRadius:(effect.parameters?.focusRadius??38)*Math.min(w,h)/Math.min(cw,ch),
  };
  const processed=processor(cropped,{...effect,parameters});
  const output=createSurface();output.width=w;output.height=h;
  const target=output.getContext('2d');if(!target)return null;
  target.drawImage(processed,x0,y0);
  return output;
}
