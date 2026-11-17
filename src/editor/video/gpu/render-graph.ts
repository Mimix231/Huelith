/** Round 8: common, deterministic scene description for WebGPU and native wgpu.
 * React owns authoring. Neither renderer invents its own layer order/timing.
 * This first GPU milestone handles ordinary images/video and animated affine
 * transforms. Other authored operations are deliberately not misrepresented
 * as GPU supported; migration happens as individual WGSL passes are completed.
 */
import {opacityAt,type VideoAsset,type VideoClip} from '../timeline';
import {transformAt} from '../motion';
import {sourceTimeAt,playbackRateAt} from '../clip-timing';
import {visibleVideoOperations,type VideoRenderContract} from '../preview-render-contract';
import {authoredTransitions} from '../transition-placement';
import {clipCrop,maskAt} from '../clip-layout';
import {VIDEO_TEMPORAL_KINDS,VIDEO_TIME_VARYING_KINDS} from '../effects/catalog';

export function gpuColorFilter(clip:VideoClip){
  const effects=clip.effects?.filter(e=>e.enabled)??[];
  return effects.length===1&&effects[0].kind==='video-filter'&&!effects[0].mask&&!clip.grade&&
    !effects[0].keyframes?.some(key=>key.parameter!=='amount')?effects[0]:undefined;
}
function staticOverlayTreatment(clip:VideoClip){
  return !clip.effects?.some(e=>e.enabled&&(e.keyframes?.length||e.mask?.keys||
      VIDEO_TIME_VARYING_KINDS.has(e.kind)||VIDEO_TEMPORAL_KINDS.has(e.kind)))&&
    !clip.grade?.keys&&!clip.grade?.mask?.keys&&!clip.grade?.basic?.grain;
}

export const GPU_RENDER_GRAPH_VERSION=1 as const;
export type GpuLayerGeometry={
  /** Output-centre translation in fractions of the scene dimensions. */
  positionScale:[number,number,number,number];
  /** Cosine, sine, opacity, output aspect ratio for pixel-correct rotation. */
  rotationOpacity:[number,number,number,number];
  /** UV region into the original source (crop is applied before fitting). */
  sourceRect:[number,number,number,number];
  /** Mask coordinates measured in the untransformed project canvas. */
  maskRect:[number,number,number,number];
  /** 0 = no mask; 1 = rectangle; 2 = ellipse; second component = invert. */
  maskFlags:[number,number,number,number];
};
export type GpuSourceLayer={
  id:string;asset:VideoAsset|null;clip:VideoClip;identity:string;
  kind:'media'|'text'|'shape';
  sourceTime:number;playbackRate:number;
  opacity:number;localTime:number;
};
export type GpuFrameGraph={
  version:typeof GPU_RENDER_GRAPH_VERSION;width:number;height:number;fps:number;
  background:[number,number,number,number];transparent:boolean;
  layers:GpuSourceLayer[];
};
export type GpuPreparedLayer=GpuSourceLayer&{geometry:GpuLayerGeometry;
  image:HTMLCanvasElement|HTMLVideoElement|HTMLImageElement;stableTexture:boolean};
export type GpuPreparedScene={graph:GpuFrameGraph;layers:GpuPreparedLayer[]};

const finite=(value:number)=>Number.isFinite(value);
export function hexBackground(hex:string|undefined,transparent:boolean):[number,number,number,number]{
  if(transparent)return [0,0,0,0];
  if(!hex||!/^#[\da-f]{6}$/i.test(hex))return [0,0,0,1];
  return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,
    parseInt(hex.slice(5,7),16)/255,1];
}

/** A GPU operation is eligible only if its authored semantics can be reproduced.
 * Unsupported spatial effects and temporal transitions keep the reference compositor. */
function gpuHardMask(clip:VideoClip):boolean{
  const mask=clip.mask;
  if(!mask)return true;
  if(mask.shape!=='rectangle'&&mask.shape!=='ellipse')return false;
  // Animated mask keys are fine: we evaluate them at the current frame.
  return mask.feather===0&&!mask.featherKeys?.length&&!mask.keys?.feather?.length&&
    (mask.rotation??0)===0&&!mask.keys?.rotation?.length;
}
export function gpuSimpleClip(clip:VideoClip,asset:VideoAsset|undefined):asset is VideoAsset{
  return !!asset&&!asset.missing&&(asset.kind==='video'||asset.kind==='image')&&
    (!clip.blendMode||clip.blendMode==='source-over')&&
    gpuHardMask(clip)&&!clip.chromaKey&&!clip.smart&&!clip.adjustment&&
    !clip.compound&&!clip.shape&&!clip.caption&&!clip.grade&&
    (!clip.effects?.some(effect=>effect.enabled)||!!gpuColorFilter(clip))&&!clip.transitionIn&&!clip.transitionOut;
}
function gpuOverlayClip(clip:VideoClip):boolean{
  return (!clip.blendMode||clip.blendMode==='source-over')&&gpuHardMask(clip)&&
    !clip.chromaKey&&!clip.smart&&!clip.adjustment&&!clip.compound&&staticOverlayTreatment(clip)&&
    !clip.transitionIn&&!clip.transitionOut&&
    !clip.caption&&!clip.textStyle?.reveal;
}

export function gpuFrameGraph(contract:VideoRenderContract,time:number):GpuFrameGraph|null{
  if(contract.version!==1||!finite(time)||time<0)return null;
  if(authoredTransitions(contract.timeline,contract.fps).some(span=>time>=span.start&&time<span.end))return null;
  const visible=visibleVideoOperations(contract,time);
  const assets=new Map(contract.timeline.assets.map(asset=>[asset.id,asset]));
  const tracks=new Map(contract.timeline.tracks.map(track=>[track.id,track]));
  const layers:GpuSourceLayer[]=[];
  for(const {clip} of visible){
    const opacity=opacityAt(clip,time);
    if(!finite(opacity))return null;
    if(opacity<=0)continue;
    const asset=assets.get(clip.assetId??'');
    const title=tracks.get(clip.trackId)?.kind==='title'||!asset;
    const kind:GpuSourceLayer['kind']=clip.shape?'shape':title?'text':'media';
    if(kind==='media'?!gpuSimpleClip(clip,asset):!gpuOverlayClip(clip))return null;
    if(kind==='text'&&!clip.title)return null;
    if(kind==='media'&&title)return null;
    const localTime=time-clip.start;
    if(kind==='media'&&gpuColorFilter(clip)){
      // Filtering the intermediate project frame precedes clip transforms.
      // Fractional resampling after a nonlinear LUT requires that intermediate
      // texture, so keep the reference path for these transformed filter clips.
      const t=transformAt(clip,localTime);
      if(t.scale!==1||t.scaleY!==1||t.rotation!==0||
        Math.abs(t.x*contract.width-Math.round(t.x*contract.width))>1e-6||
        Math.abs(t.y*contract.height-Math.round(t.y*contract.height))>1e-6)return null;
    }
    layers.push({id:clip.id,clip,asset:kind==='media'?asset??null:null,kind,
      identity:clip.id,localTime,opacity,
      sourceTime:Math.max(0,sourceTimeAt(clip,localTime)),
      playbackRate:playbackRateAt(clip,localTime)});
  }
  return {version:GPU_RENDER_GRAPH_VERSION,width:contract.width,height:contract.height,fps:contract.fps,
    background:hexBackground(contract.timeline.background,contract.transparent),
    transparent:contract.transparent,layers};
}

/** Uses the original canvas transform semantics including non-square footage,
 * centre-fitting, negative flip axes and keyframed rotation. */
export function gpuLayerGeometry(layer:GpuSourceLayer,width:number,height:number,
  sourceWidth:number,sourceHeight:number):GpuLayerGeometry{
  if(![width,height,sourceWidth,sourceHeight].every(value=>finite(value)&&value>0))
    throw Error('GPU layer requires nonempty source and output dimensions.');
  const crop=layer.kind==='media'?clipCrop(layer.asset??undefined,layer.clip):{x:0,y:0,width:1,height:1};
  const contentWidth=sourceWidth*crop.width,contentHeight=sourceHeight*crop.height;
  const fit=layer.kind==='media'?layer.clip.fit??'fit':'stretch';
  const ratio=fit==='fill'?Math.max(width/contentWidth,height/contentHeight):
    Math.min(width/contentWidth,height/contentHeight);
  const fittedX=fit==='stretch'?1:ratio*contentWidth/width;
  const fittedY=fit==='stretch'?1:ratio*contentHeight/height;
  const transform=transformAt(layer.clip,layer.localTime);
  const theta=transform.rotation*Math.PI/180;
  const positionScale:[number,number,number,number]=[
    transform.x,transform.y,
    fittedX*transform.scale*(layer.clip.flipX?-1:1),
    fittedY*transform.scaleY*(layer.clip.flipY?-1:1),
  ];
  const rotationOpacity:[number,number,number,number]=[
    Math.cos(theta),-Math.sin(theta),Math.max(0,Math.min(1,layer.opacity)),width/height,
  ];
  const sourceRect:[number,number,number,number]=[crop.x,crop.y,crop.width,crop.height];
  const mask=layer.clip.mask?maskAt(layer.clip.mask,layer.localTime):undefined;
  const maskRect:[number,number,number,number]=mask?
    [mask.region.x,mask.region.y,mask.region.width,mask.region.height]:[0,0,1,1];
  const maskFlags:[number,number,number,number]=mask?
    [mask.shape==='ellipse'?2:1,mask.invert?1:0,fittedX,fittedY]:[0,0,fittedX,fittedY];
  if(![...positionScale,...rotationOpacity,...sourceRect,...maskRect,...maskFlags].every(finite))throw Error('Invalid GPU scene transform.');
  return {positionScale,rotationOpacity,sourceRect,maskRect,maskFlags};
}

export function gpuUniformBytes(geometry:GpuLayerGeometry):Float32Array{
  return new Float32Array([...geometry.positionScale,...geometry.rotationOpacity,
    ...geometry.sourceRect,...geometry.maskRect,...geometry.maskFlags]);
}

