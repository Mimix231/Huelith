import type { VideoAsset, VideoClip } from './timeline';
import {MASK_PARAMETERS,type ClipMask,type CropRegion,type MaskParameter} from './studio-types';
import {keysFromOffset,mapParameterKeys,parameterAt} from './parameter-keys';
import {motionAt,type MotionSample,type SmartFootage} from './smart-footage';
import {createSurface} from '../canvas-surface';

const whole: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

export function clipCrop(asset: VideoAsset | undefined, clip: VideoClip): CropRegion {
  const base = asset?.crop ?? whole, crop = clip.crop ?? whole;
  return {
    x: base.x + crop.x * base.width, y: base.y + crop.y * base.height,
    width: base.width * crop.width, height: base.height * crop.height,
  };
}

export function fittedSize(sourceWidth: number, sourceHeight: number, width: number, height: number, fit: VideoClip['fit']) {
  if (fit === 'stretch') return { width, height };
  const scale = fit === 'fill' ? Math.max(width / sourceWidth, height / sourceHeight)
    : Math.min(width / sourceWidth, height / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}

export function maskPath(ctx: CanvasRenderingContext2D, mask: NonNullable<VideoClip['mask']>, width: number, height: number) {
  const box = mask.region;
  const x=-box.width*width/2,y=-box.height*height/2;
  ctx.save();
  ctx.translate((box.x+box.width/2-.5)*width,(box.y+box.height/2-.5)*height);
  ctx.rotate((mask.rotation??0)*Math.PI/180);
  ctx.beginPath();
  if (mask.shape === 'ellipse') ctx.ellipse(0,0,-x,-y,0,0,2*Math.PI);
  else if(mask.shape==='polygon'&&mask.vertices?.length){
    mask.vertices.forEach(([u,v],index)=>{
      const xx=x+u*box.width*width,yy=y+v*box.height*height;
      if(index)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy);
    });
    ctx.closePath();
  }
  else ctx.rect(x, y, box.width * width, box.height * height);
  ctx.restore();
}

const constrain=(n:number,limit:number)=>Math.max(-limit,Math.min(limit,n));
export function motionCovers(points:readonly {time:number}[],time:number) {
  return points.length>0&&time>=points[0].time-.12&&time<=points.at(-1)!.time+.12;
}

export function footagePlacement(smart:SmartFootage|undefined,time:number,outputWidth:number,outputHeight:number,width:number,height:number,
  crop:CropRegion,flipX:boolean,flipY:boolean) {
  const stabilized=smart?.stabilization&&motionCovers(smart.stabilization.points,time)?smart.stabilization:undefined;
  const scale=stabilized?.zoom??1;
  const shift=stabilized?motionAt(stabilized.points,time):undefined;
  const tracked:MotionSample|undefined=smart?.track&&motionCovers(smart.track.points,time)?motionAt(smart.track.points,time):undefined;
  let x=(shift?.x??0)*width*scale*(flipX?-1:1),y=(shift?.y??0)*height*scale*(flipY?-1:1);
  if(smart?.reframe&&tracked){
    const centerX=((tracked.x-crop.x)/crop.width-.5)*(flipX?-1:1),centerY=((tracked.y-crop.y)/crop.height-.5)*(flipY?-1:1);
    x=constrain(x-centerX*width*scale,Math.max(0,(width*scale-outputWidth)/2));
    y=constrain(y-centerY*height*scale,Math.max(0,(height*scale-outputHeight)/2));
  }
  return {x,y,scale,tracked};
}
export function maskFeatherAt(mask:ClipMask,time:number):number{
  return parameterAt(mask.keys?.feather??mask.featherKeys,time,mask.feather);
}

export function maskValue(mask:ClipMask,name:MaskParameter):number{
  if(name==='feather')return mask.feather;
  if(name==='rotation')return mask.rotation??0;
  return mask.region[name];
}

export function maskAt(mask:ClipMask,time:number):ClipMask{
  if(!mask.keys&&!mask.featherKeys?.length)return mask;
  const values=Object.fromEntries(MASK_PARAMETERS.map(name=>[name,name==='feather'?maskFeatherAt(mask,time):
    parameterAt(mask.keys?.[name],time,maskValue(mask,name))])) as Record<MaskParameter,number>;
  const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
  const x=clamp(values.x,0,.999),y=clamp(values.y,0,.999);
  return {...mask,region:{x,y,width:clamp(values.width,.001,1-x),height:clamp(values.height,.001,1-y)},
    rotation:values.rotation,feather:clamp(values.feather,0,.25)};
}

export function rebaseMask(mask:ClipMask|undefined,offset:number,stretch=1):ClipMask|undefined{
  if(!mask)return undefined;
  const edit=(keys:ClipMask['featherKeys'])=>keysFromOffset(keys,offset)?.map(key=>({...key,time:key.time*stretch}));
  return {...mask,featherKeys:edit(mask.featherKeys),keys:mapParameterKeys(mask.keys,edit)};
}

export function maskCoverage(authored:ClipMask,time:number,width:number,height:number){
  const mask=maskAt(authored,time),surface=createSurface();surface.width=width;surface.height=height;
  const ctx=surface.getContext('2d')!;
  ctx.translate(width/2,height/2);maskPath(ctx,mask,width,height);
  if(mask.feather)ctx.filter=`blur(${Math.min(width,height)*mask.feather}px)`;
  ctx.fill();
  return surface;
}

export function compositeThroughMask(before:HTMLCanvasElement,after:HTMLCanvasElement,mask:ClipMask,time:number){
  const width=before.width,height=before.height,coverage=maskCoverage(mask,time,width,height);
  const output=createSurface(),selection=createSurface();
  output.width=selection.width=width;output.height=selection.height=height;
  const ctx=output.getContext('2d')!,selected=selection.getContext('2d')!;
  selected.drawImage(after,0,0);selected.globalCompositeOperation=mask.invert?'destination-out':'destination-in';selected.drawImage(coverage,0,0);
  ctx.drawImage(before,0,0);ctx.globalCompositeOperation=mask.invert?'destination-in':'destination-out';ctx.drawImage(coverage,0,0);
  ctx.globalCompositeOperation='lighter';ctx.drawImage(selection,0,0);return output;
}

