/** Huelith Meme Creator: non-destructive, editable native document objects.
 * The original imported image is never modified, flattened or resized. */
import { makeVector, makeRaster, uid, type Document, type Layer, type VectorLayer, type VectorShape } from './types';
import { ensureTrackEffects, syncActiveCel } from './animation';

export type MemeLayout = 'classic' | 'reaction' | 'demotivational' | 'comic' | 'speech' | 'caption' | 'split' | 'beforeAfter' | 'custom';
export const MEME_LAYOUTS: ReadonlyArray<{id:MemeLayout;name:string;description:string;icon:string}> = [
  {id:'classic',name:'Classic Impact',description:'Top and bottom captions',icon:'Aa'},
  {id:'reaction',name:'Reaction',description:'One big reaction caption',icon:'!!'},
  {id:'demotivational',name:'Demotivational',description:'Black border, title and quote',icon:'▣'},
  {id:'comic',name:'Comic Panel',description:'Comic-strip caption blocks',icon:'▥'},
  {id:'speech',name:'Speech Bubble',description:'A speech balloon over the art',icon:'◌'},
  {id:'caption',name:'Caption Card',description:'Bottom caption with a backing card',icon:'▤'},
  {id:'split',name:'Split Reaction',description:'Two framed side-by-side images',icon:'◧'},
  {id:'beforeAfter',name:'Before / After',description:'Two labeled comparison panels',icon:'⇆'},
  {id:'custom',name:'Freeform',description:'Two freely styled text objects',icon:'✦'},
];
export interface MemeSettings {
  layout:MemeLayout;
  top:string;
  bottom:string;
  fontFamily:string;
  fontSize:number; // percentage relative to canvas width
  textColor:string;
  outlineColor:string;
  outlineWidth:number;
  captionBackground:string;
  backgroundOpacity:number;
  padding:number;
  uppercase:boolean;
  includeSecondImage:boolean;
  topOffsetX:number;topOffsetY:number;bottomOffsetX:number;bottomOffsetY:number;
}
export const MEME_DEFAULTS:MemeSettings = {
  layout:'classic',top:'WHEN THE CODE FINALLY RUNS',bottom:'WITHOUT A SINGLE ERROR',
  fontFamily:'Impact, Arial Black, sans-serif',fontSize:6.8,textColor:'#ffffff',outlineColor:'#000000',
  outlineWidth:1.1,captionBackground:'#101019',backgroundOpacity:0.90,
  padding:4,uppercase:true,includeSecondImage:false,topOffsetX:0,topOffsetY:0,bottomOffsetX:0,bottomOffsetY:0,
};
function bounded(value:number,low:number,high:number):number{return Math.min(high,Math.max(low,value));}
function withinColor(value:string):string {return /^#[\da-f]{6}$/i.test(value)?value:'#ffffff';}
function makeRect(x:number,y:number,width:number,height:number,color:string):VectorShape {
  return {id:uid(),kind:'rect',x,y,width,height,fill:color,stroke:'none',strokeWidth:0};
}
/** Approximation for layout only; the generated text is fully editable after Apply.
 * A real Canvas2D context is supplied by the editor for measured glyph widths. */
export function wrapMemeCaption(text:string,maxWidth:number,font:string,fontSize:number,
  measure?:(text:string,font:string,size:number)=>number):string {
  const safe=text.trim().replace(/\r/g,'').slice(0,600);
  if(!safe)return '';
  const width=(line:string)=>measure?measure(line,font,fontSize):line.length*fontSize*.56;
  const lines:string[]=[];
  for(const paragraph of safe.split('\n')) {
    if(!paragraph.trim()){lines.push('');continue;}
    let row='';
    for(const word of paragraph.trim().split(/\s+/)) {
      const tryLine=row?`${row} ${word}`:word;
      if(width(tryLine)<=maxWidth){row=tryLine;continue;}
      if(row)lines.push(row);
      row='';
      for(const c of word){
        if(row && width(row+c)>maxWidth){lines.push(row);row='';}
        row+=c;
      }
    }
    if(row)lines.push(row);
  }
  return lines.slice(0,18).join('\n');
}
function makeText(value:string,x:number,y:number,width:number,height:number,size:number,
  options:MemeSettings,align:'center'|'left'='center',measure?:(text:string,font:string,size:number)=>number):VectorShape {
  const text=(options.uppercase?value.toUpperCase():value).slice(0,600);
  return { id:uid(),kind:'text',x,y,width,height,fill:withinColor(options.textColor),
    stroke:withinColor(options.outlineColor),strokeWidth:bounded(size*options.outlineWidth/30,0,100),
    fontSize:size,fontFamily:options.fontFamily||'Impact, Arial Black, sans-serif',
    fontWeight:'900',textAlign:align,letterSpacing:Math.max(.1,size*.012),lineHeight:1.12,
    text:wrapMemeCaption(text,Math.max(10,width-size*.13),options.fontFamily,size,measure),
  };
}
/** The generated background is a distinct editable vector layer. No operation mutates
 * the source image. Layout-specific positions deliberately stay inside the document. */
export function composeMemeArtwork(doc:Pick<Document,'width'|'height'>,settings:MemeSettings,
  measure?:(text:string,font:string,size:number)=>number):{backdrops:VectorShape[];captions:VectorShape[]} {
  const {width:w,height:h}=doc;
  const pad=w*bounded(settings.padding,0,15)/100;
  const fontSize=bounded(w*settings.fontSize/100,10,Math.min(240,w*.2));
  const lineBox=fontSize*2.55;
  const backdrops:VectorShape[]=[];const captions:VectorShape[]=[];
  const insert=(value:string,x:number,y:number,width:number,height:number,scale=1,align:'center'|'left'='center')=>{
    if(!value.trim())return;
    const size=fontSize*scale;
    const t=makeText(value,x,y,width,height,size,settings,align,measure);
    // Fit the generated lines in the specified safe area. This remains editable text.
    const rows=(t.text??'').split('\n').length;
    if(rows*size*1.12>height){const smaller=bounded(height/Math.max(1,rows)/1.12,9,size);t.fontSize=smaller; t.strokeWidth=smaller*settings.outlineWidth/30;}
    captions.push(t);
  };
  const textW=w-2*pad;
  switch(settings.layout){
    case 'classic':
      insert(settings.top,pad,pad*.7,textW,lineBox);
      insert(settings.bottom,pad,h-lineBox-pad*.6,textW,lineBox);break;
    case 'reaction':
      insert(settings.top||settings.bottom,pad,h-lineBox-pad,textW,lineBox);break;
    case 'demotivational': {
      const bar=Math.min(h*.30,lineBox*1.9);backdrops.push(makeRect(0,h-bar,w,bar,'#08080c'));
      // A stroked border must NOT cover the source image with an opaque panel.
      backdrops.push({id:uid(),kind:'rect',x:pad/2,y:pad/2,width:w-pad,height:h-bar-pad,
        fill:'none',stroke:'#ffffff',strokeWidth:Math.max(3,w*.008)});
      insert(settings.top,pad,h-bar+bar*.03,textW,bar*.43,.84);
      insert(settings.bottom,pad,h-bar+bar*.52,textW,bar*.38,.54);
      break;
    }
    case 'comic':
      backdrops.push(makeRect(pad,pad,w*.43,h*.115,'#ffffff'));
      backdrops.push(makeRect(w*.55,h*.74,w*.42,h*.18,'#ffffff'));
      insert(settings.top,pad*1.5,pad*1.1,w*.42,h*.12,.56,'left');
      insert(settings.bottom,w*.58,h*.75,w*.38,h*.17,.63,'left');break;
    case 'speech':
      backdrops.push({id:uid(),kind:'speechBubble',x:pad,y:pad,width:w*.65,height:h*.32,
        fill:'#ffffff',stroke:'#1c1a26',strokeWidth:Math.max(2,w*.003)});
      insert(settings.top,pad*1.7,pad*1.5,w*.6,h*.24,.69);
      if(settings.bottom.trim())insert(settings.bottom,pad,h-lineBox-pad,textW,lineBox,.72);break;
    case 'caption':
      backdrops.push(makeRect(0,h-h*.25,w,h*.25,withinColor(settings.captionBackground)));
      insert(settings.top,pad,h*.77,textW,h*.20,.85);break;
    case 'split': case 'beforeAfter':
      backdrops.push(makeRect(w/2-Math.max(2,w*.005),0,Math.max(4,w*.01),h,'#ffffff'));
      backdrops.push(makeRect(0,0,w,Math.max(3,h*.008),'#ffffff'));
      insert(settings.top,pad,pad,w*.5-pad*2,lineBox,.64);
      insert(settings.bottom,w*.5+pad,pad,w*.5-pad*2,lineBox,.64);
      break;
    case 'custom':
      insert(settings.top,pad,h*.1,textW,h*.30,1);
      insert(settings.bottom,pad,h*.63,textW,h*.28,.82);break;
  }
  for(const [index,shape] of captions.entries()) {
    shape.x+=w*(index===0?settings.topOffsetX:settings.bottomOffsetX)/100;
    shape.y+=h*(index===0?settings.topOffsetY:settings.bottomOffsetY)/100;
  }
  return {backdrops,captions};
}
export interface MemeCommit { settings:MemeSettings; secondImage?:{data:string;width:number;height:number}|null }
/** A single store history mutation creates the complete editable Meme design. */
export function applyMemeToDocument(doc:Document,request:MemeCommit):string[] {
  const {settings,secondImage}=request;
  // The same Canvas2D font measurement is used by preview and committed
  // artwork. A non-DOM fallback keeps document geometry testable in Node.
  const measure=typeof document!=='undefined' ? (()=>{
    const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');
    return ctx ? (text:string,family:string,fontSize:number)=>{
      ctx.font=`900 ${fontSize}px ${family}`;
      return ctx.measureText(text).width;
    } : undefined;
  })() : undefined;
  const {backdrops,captions}=composeMemeArtwork(doc,settings,measure);
  const additions:Layer[]=[];
  if(secondImage && ['split','beforeAfter'].includes(settings.layout) && settings.includeSecondImage){
    const w=doc.width/2,h=doc.height;
    const scale=Math.min(w/secondImage.width,h/secondImage.height);
    additions.push({...makeRaster('Meme • Comparison image'),x:w,y:(h-secondImage.height*scale)/2,
      image:secondImage.data,imageWidth:secondImage.width,imageHeight:secondImage.height,
      scaleX:scale,scaleY:scale});
  }
  if(backdrops.length){const layer:VectorLayer=makeVector('Meme • Layout');layer.shapes=backdrops;
    layer.opacity=bounded(settings.backgroundOpacity,0,1);additions.push(layer);}
  if(captions.length){const layer:VectorLayer=makeVector('Meme • Editable captions');layer.shapes=captions;additions.push(layer);}
  const insertAt=doc.layers.findIndex(layer=>layer.id===doc.activeLayerId)+1;
  doc.layers.splice(insertAt>=1?insertAt:doc.layers.length,0,...additions);
  if(additions.length)doc.activeLayerId=additions[additions.length-1].id;
  if(doc.animation){
    // Captions belong to editable layers shared by frame ID, and are initially
    // available on all animation frames; further edits can be made per cel.
    for(let i=0;i<doc.animation.frames.length;i++){
      if(i===doc.animation.currentFrame)continue;
      doc.animation.frames[i].layers.push(...additions.map(layer=>structuredClone(layer)));
    }
    const canonical=ensureTrackEffects(doc);
    for(const layer of additions)canonical[layer.id]=[];
    syncActiveCel(doc);
  }
  return additions.map(layer=>layer.id);
}
