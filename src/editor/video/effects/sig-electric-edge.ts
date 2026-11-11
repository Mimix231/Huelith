import type {Effect} from '../../types';
import {isImmutableEffectSource} from '../../immutable-effect-sources';
import {blurScalar} from './common';
import {canvasWithSource,createSurface,clamp01,hash,hasSignatureSilhouette,hex} from './signature-core';

type EdgeField={
  width:number;height:number;radius:number;core:Float32Array;near:Float32Array;halo:Float32Array;cutout:boolean;
};
const prepared=new WeakMap<HTMLCanvasElement,EdgeField>();
let analysisSurface:HTMLCanvasElement|undefined;
let lightSurface:HTMLCanvasElement|undefined;

function setSize(surface:HTMLCanvasElement,width:number,height:number){
  if(surface.width!==width)surface.width=width;
  if(surface.height!==height)surface.height=height;
}

function edgeField(source:HTMLCanvasElement,radius:number):EdgeField{
  const previous=prepared.get(source);
  if(previous?.radius===radius)return previous;
  // Extract contour geometry separately from the full-resolution color image.
  const scale=Math.min(1,384/Math.max(source.width,source.height));
  const width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
  const analysis=analysisSurface??=createSurface();setSize(analysis,width,height);
  // Keep the downsample on the GPU when the source is a decoded texture;
  // only the small contour field needs to make the trip back to the CPU.
  const context=analysis.getContext('2d',{willReadFrequently:false})!;
  context.clearRect(0,0,width,height);
  context.drawImage(source,0,0,width,height);
  const image=context.getImageData(0,0,width,height),data=image.data,cutout=hasSignatureSilhouette(image);
  const core=new Float32Array(width*height);
  const step=Math.max(1,Math.min(5,Math.round(radius*scale*.24)));
  const reach=Math.max(1,Math.round(radius*scale*.42));
  const wide=Math.min(12,step*3);
  const focus=Float32Array.from({length:width},(_,x)=>1-.73*Math.abs(2*x/width-1)**1.45);
  function contrast(a:number,b:number){
    const red=data[a]-data[b],green=data[a+1]-data[b+1],blue=data[a+2]-data[b+2];
    const light=Math.abs(red*.2126+green*.7152+blue*.0722);
    return Math.max(light,Math.max(Math.abs(red-green),Math.abs(blue-green))*.62);
  }
  for(let y=step;y<height-step;y++)for(let x=step;x<width-step;x++){
    const pixel=y*width+x,i=pixel*4,alpha=data[i+3];
    const left=i-4*step,right=i+4*step,top=i-width*4*step,bottom=i+width*4*step;
    if(cutout){
      const edge=Math.max(Math.abs(data[left+3]-data[right+3]),Math.abs(data[top+3]-data[bottom+3]));
      core[pixel]=clamp01((edge-32)/125)*(.55+.45*alpha/255);
    }else if(alpha>=96){
      const dx=contrast(data[left+3]>=96?left:i,data[right+3]>=96?right:i);
      const dy=contrast(data[top+3]>=96?top:i,data[bottom+3]>=96?bottom:i);
      const broadX=x>=wide&&x+wide<width?contrast(i-wide*4,i+wide*4):dx;
      const broadY=y>=wide&&y+wide<height?contrast(i-wide*width*4,i+wide*width*4):dy;
      const edge=Math.max(Math.min(dx,broadX*1.18),Math.min(dy,broadY*1.18));
      core[pixel]=clamp01((edge-25)/80)*focus[x];
    }
  }
  const near=blurScalar(core,width,height,reach);
  const halo=blurScalar(near,width,height,Math.max(2,Math.round(radius*scale*.82)));
  const result={width,height,radius,core,near,halo,cutout};
  if(isImmutableEffectSource(source))prepared.set(source,result);
  return result;
}

export function renderSigElectricEdge(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement{
  const energy=clamp01(effect.amount/100)*clamp01((effect.parameters?.opacity??85)/100);
  if(!energy)return source;
  const radius=Math.max(.5,effect.parameters?.radius??14),color=effect.color??'#b879ff';
  const [red,green,blue]=hex(color);
  const {width,height,core,near,halo,cutout}=edgeField(source,radius);
  const light=lightSurface??=createSurface();setSize(light,width,height);
  const ctx=light.getContext('2d')!,image=ctx.createImageData(width,height),data=image.data;
  for(let pixel=0;pixel<core.length;pixel++){
    const i=pixel*4,hot=core[pixel]*(.72+.28*core[pixel]);
    const glow=near[pixel]*(cutout?1.45:.78)+halo[pixel]*(cutout?2.2:1.16);
    const white=hot*.67;
    data[i]=red+(255-red)*white;
    data[i+1]=green+(244-green)*white;
    data[i+2]=blue+(255-blue)*white;
    data[i+3]=255*clamp01((hot*.94+glow)*energy*(cutout?1.28:1.16));
  }
  ctx.putImageData(image,0,0);
  ctx.save();
  const branching=clamp01((effect.parameters?.branching??64)/100),seed=effect.parameters?.seed??39;
  const cell=Math.max(13,Math.round(Math.sqrt(width*height/125)));
  ctx.lineCap='round';ctx.lineJoin='round';
  for(let row=0;row<height;row+=cell)for(let col=0;col<width;col+=cell){
    const cellId=row*width+col;
    if(hash(cellId,3,seed)>branching)continue;
    let best=.55,x=-1,y=-1;
    for(let yy=row;yy<Math.min(height,row+cell);yy++)for(let xx=col;xx<Math.min(width,col+cell);xx++){
      const edge=core[yy*width+xx];
      if(edge>best){best=edge;x=xx;y=yy;}
    }
    if(x<0)continue;
    const direction=x<width/2?-1:1;
    const size=cell*(.36+.55*hash(cellId,5,seed));
    const lift=(hash(cellId,8,seed)-.63)*size;
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x+direction*size*.34,y+lift*.73);
    ctx.lineTo(x+direction*size*.64,y+lift*.39);
    ctx.lineTo(x+direction*size,y+lift);
    ctx.moveTo(x+direction*size*.34,y+lift*.73);
    ctx.lineTo(x+direction*size*.49,y+lift*1.22);
    ctx.globalAlpha=energy*.46;ctx.lineWidth=2.7;ctx.strokeStyle=color;ctx.stroke();
    ctx.globalAlpha=energy*.78;ctx.lineWidth=.8;ctx.strokeStyle='#efe3ff';ctx.stroke();
  }
  ctx.restore();
  const output=canvasWithSource(source),composite=output.getContext('2d')!;
  composite.globalCompositeOperation=cutout?'screen':'source-atop';
  composite.drawImage(light,0,0,source.width,source.height);
  composite.globalCompositeOperation='source-over';
  return output;
}
