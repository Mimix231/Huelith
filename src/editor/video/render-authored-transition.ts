import {createSurface} from '../canvas-surface';
import {createVideoEffect} from './effects/catalog';
import type {VideoEffect,VideoFrameContext} from './effects/types';
import {crossDissolve} from './effects/cross-dissolve';
import type {AuthoredTransition,Reveal,RevealMask} from './transition-recipes';

const cap=(value:number)=>Math.max(0,Math.min(1,value));
const smooth=(value:number)=>value*value*(3-2*value);
function canvas(width:number,height:number){const result=createSurface();result.width=width;result.height=height;return result;}

function maskThreshold(mask:RevealMask,x:number,y:number,luma:number):number{
  const dx=x-.5,dy=y-.5;
  switch(mask){
    case 'luma':return .06+.88*(1-luma);
    case 'inverse-luma':return .06+.88*luma;
    case 'dither':return ((Math.imul(Math.floor(x*44)+13,1103515245)^Math.imul(Math.floor(y*30)+7,19349663))>>>8)%1000/1000;
    case 'horizontal':return x;
    case 'vertical':return y;
    case 'diagonal':return (x+y)/2;
    case 'split':return Math.abs(dx)*2;
    case 'corner':return Math.max(x,y)*.65+Math.hypot(x,y)*.25;
    case 'clock':return (Math.atan2(dx,-dy)+Math.PI*2)%(Math.PI*2)/(Math.PI*2);
    case 'iris':return Math.hypot(dx,dy)/.7072;
    case 'diamond':return Math.abs(dx)+Math.abs(dy);
    case 'ring':return Math.abs(Math.hypot(dx,dy)-.28)/.428;
    case 'blinds':return (y*9)%1*.75+x*.25;
    case 'tiles':return ((Math.floor(x*9)+Math.floor(y*6))%5)/7+((x*9)%1+(y*6)%1)/5;
    case 'star':return cap(Math.hypot(dx,dy)/(.52+.16*Math.cos(Math.atan2(dy,dx)*5)));
    case 'paper':return cap(x*.76+y*.18+.045*Math.sin(y*97)+.035*Math.cos(y*37));
  }
}

function revealMask(source:HTMLCanvasElement,kind:RevealMask,progress:number){
  const scale=Math.min(1,192/Math.max(source.width,source.height));
  const width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
  const mask=canvas(width,height),ctx=mask.getContext('2d',{willReadFrequently:true})!;
  const usesLuma=kind==='luma'||kind==='inverse-luma';
  if(usesLuma)ctx.drawImage(source,0,0,width,height);
  const pixels=usesLuma?ctx.getImageData(0,0,width,height):ctx.createImageData(width,height);
  const data=pixels.data;
  const feather=kind==='luma'||kind==='inverse-luma'?.16:kind==='paper'?.046:.035;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,luma=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
    const threshold=maskThreshold(kind,(x+.5)/width,(y+.5)/height,luma);
    data[i]=data[i+1]=data[i+2]=255;
    data[i+3]=255*cap((progress-threshold)/feather+.5);
  }
  ctx.putImageData(pixels,0,0);
  return mask;
}

type Process=(source:HTMLCanvasElement,effects:readonly VideoEffect[],context:VideoFrameContext)=>Promise<HTMLCanvasElement>;
async function treatment(source:HTMLCanvasElement,reveal:Reveal,visibility:number,exit:boolean,context:VideoFrameContext,process:Process){
  if(!reveal.motion&&!reveal.tint&&!reveal.fx)return source;
  const w=source.width,h=source.height,distance=1-visibility,phase=Math.sin(Math.PI*visibility);
  let input=source;
  if(reveal.fx&&distance>.001){
    const effect=createVideoEffect(reveal.fx.kind);
    const neutral=reveal.fx.kind==='pixelate'?1:0;
    input=await process(source,[{...effect,id:`transition:${reveal.id}`,amount:neutral+(reveal.fx.amount-neutral)*distance,
      referenceWidth:960}],context);
  }
  const layer=canvas(w,h),ctx=layer.getContext('2d')!,motion=reveal.motion;
  if(motion){
    const direction=exit?-1:1,zoom=1+(motion.zoom??0)*distance+(motion.bounce??0)*Math.sin(2*Math.PI*visibility);
    const fold=Math.max(.02,Math.sin(Math.PI*visibility/2));
    ctx.translate(w*(.5+(motion.x??0)*distance*direction),h*(.5+(motion.y??0)*distance*direction));
    ctx.rotate((motion.rotation??0)*distance*direction*Math.PI/180);
    ctx.scale(zoom*(motion.foldX?fold:1),zoom*(motion.foldY?fold:1));
    if(motion.blur)ctx.filter=`blur(${Math.max(0,motion.blur*distance*w/960)}px)`;
    ctx.drawImage(input,-w/2,-h/2);
    ctx.resetTransform();ctx.filter='none';
  }else ctx.drawImage(input,0,0);
  if(reveal.tint){
    ctx.globalCompositeOperation='source-atop';
    ctx.globalAlpha=cap((reveal.flash??.6)*phase*(reveal.pulse?Math.abs(Math.sin(visibility*Math.PI*reveal.pulse)):1));
    ctx.fillStyle=reveal.tint;ctx.fillRect(0,0,w,h);
  }
  return layer;
}

function masked(source:HTMLCanvasElement,mask:HTMLCanvasElement,invert=false){
  const layer=canvas(source.width,source.height),ctx=layer.getContext('2d')!;
  ctx.drawImage(source,0,0);ctx.globalCompositeOperation=invert?'destination-out':'destination-in';
  ctx.drawImage(mask,0,0,layer.width,layer.height);
  return layer;
}

export async function renderAuthoredTransition(from:HTMLCanvasElement,to:HTMLCanvasElement,progress:number,recipe:AuthoredTransition,
  context:VideoFrameContext,process:Process):Promise<HTMLCanvasElement>{
  const raw=cap(progress);
  if(raw<=0)return from;
  if(raw>=1)return to;
  const p=recipe.reveal.linear?raw:smooth(raw);
  const source=recipe.group==='Fade Out'?from:to;
  const exit=recipe.group==='Fade Out',visibility=exit?1-p:p;
  const incoming=await treatment(source,recipe.reveal,visibility,exit,context,process);
  const mask=recipe.reveal.mask?revealMask(source,recipe.reveal.mask,visibility):undefined;
  if(recipe.group!=='Combo'){
    if(mask)return masked(incoming,mask);
    return exit?crossDissolve(incoming,to,p):crossDissolve(from,incoming,p);
  }
  const outgoing=recipe.leave?await treatment(from,recipe.leave,1-p,true,context,process):from;
  if(!mask)return crossDissolve(outgoing,incoming,p);
  const output=masked(outgoing,mask,true),ctx=output.getContext('2d')!;
  ctx.globalCompositeOperation='lighter';ctx.drawImage(masked(incoming,mask),0,0);
  return output;
}
