/** Composable everyday layer actions, without rasterizing unrelated layers. */
import type { Document, Layer, VectorShape } from './types';
import { shapeBounds, scaleShape } from './geometry';
import { drawShape } from './render';
import { ensureTrackGradients, ensureTrackEffects, syncActiveCel } from './animation';

export type LayerAlignment = 'center-horizontal' | 'center-vertical' | 'fit-to-canvas';
function layerShapeBounds(shapes:VectorShape[],layer:Layer):{x:number;y:number;width:number;height:number}|null{
  if(!shapes.length)return null;
  const list=shapes.map(shape=>shapeBounds(shape,{x:layer.x,y:layer.y}));
  const x=Math.min(...list.map(b=>b.x)),y=Math.min(...list.map(b=>b.y));
  return{x,y,width:Math.max(...list.map(b=>b.x+b.width))-x,height:Math.max(...list.map(b=>b.y+b.height))-y};
}
export function alignLayer(doc:Document,layerId:string,alignment:LayerAlignment):void{
  const layer=doc.layers.find(item=>item.id===layerId);
  if(!layer||layer.locked||layer.type==='group')return;
  const bounds=layer.type==='raster'?{x:layer.x,y:layer.y,width:(layer.imageWidth??doc.width)*(layer.scaleX??1),height:(layer.imageHeight??doc.height)*(layer.scaleY??1)}:
    layer.type==='gradient'?shapeBounds(layer.gradient,{x:layer.x,y:layer.y}):layerShapeBounds(layer.shapes,layer);
  if(!bounds)return;
  if(alignment==='fit-to-canvas'){
    if(layer.type==='raster'){
      layer.x=0;layer.y=0;layer.scaleX=doc.width/Math.max(1,layer.imageWidth??doc.width);layer.scaleY=doc.height/Math.max(1,layer.imageHeight??doc.height);
    }else{
      const sx=doc.width/Math.max(.01,bounds.width),sy=doc.height/Math.max(.01,bounds.height);
      const shapes=layer.type==='gradient'?[layer.gradient]:layer.shapes;
      for(const shape of shapes){
        const before={x:shape.x,y:shape.y,width:shape.width,height:shape.height};
        scaleShape(shape,before,{x:(layer.x+shape.x-bounds.x)*sx,y:(layer.y+shape.y-bounds.y)*sy,width:shape.width*sx,height:shape.height*sy});
      }
      layer.x=0;layer.y=0;
      if(layer.type==='gradient'&&doc.animation){ensureTrackGradients(doc)[layer.id]=structuredClone(layer.gradient);}
    }
  } else {
    if(alignment==='center-horizontal')layer.x+=doc.width/2-(bounds.x+bounds.width/2);
    else layer.y+=doc.height/2-(bounds.y+bounds.height/2);
  }
}

/** Prepare per-cel raster assets first. The render is RAW content only:
 * existing layer FX, blend mode, opacity and masks are retained and applied
 * once by the normal document compositor after converting the layer type. */
export function rasterAssets(doc:Document,layerId:string):Map<number,string>{
  const result=new Map<number,string>();
  const make=(layers:Layer[],index:number)=>{
    const layer=layers.find(item=>item.id===layerId);
    if(!layer||layer.locked||layer.type==='raster'||layer.type==='group')throw new Error('Choose an unlocked Vector or Gradient layer to rasterize.');
    const canvas=document.createElement('canvas');canvas.width=doc.width;canvas.height=doc.height;
    const context=canvas.getContext('2d');if(!context)throw Error('Canvas 2D is unavailable.');
    const shapes=layer.type==='vector'?layer.shapes:[doc.animation?.trackGradients?.[layer.id]??layer.gradient];
    for(const shape of shapes)drawShape(context,shape,layer.x,layer.y);
    result.set(index,canvas.toDataURL('image/png'));
  };
  if(!doc.animation){make(doc.layers,0);return result;}
  // The active working cel is more recent than its frame mirror before sync.
  for(let i=0;i<doc.animation.frames.length;i++){
    make(i===doc.animation.currentFrame?doc.layers:doc.animation.frames[i].layers,i);
  }
  return result;
}
export function commitRasterize(doc:Document,layerId:string,prepared:ReadonlyMap<number,string>):void{
  const convert=(layers:Layer[],index:number)=>{
    const at=layers.findIndex(item=>item.id===layerId);if(at<0)return;
    const old=layers[at];const image=prepared.get(index);
    if(!image)return;
    layers[at]={id:old.id,name:old.name,type:'raster',visible:old.visible,locked:old.locked,opacity:old.opacity,
      blend:old.blend,x:0,y:0,image,imageWidth:doc.width,imageHeight:doc.height,
      ...(old.mask?{mask:old.mask}:{}),...(old.effects?{effects:old.effects}:{}),
      ...(old.clipToBelow?{clipToBelow:true}:{})};
  };
  if(doc.animation){
    // Avoid canonical Gradient-layer revival by removing its recipe when converting.
    delete ensureTrackGradients(doc)[layerId];
    const current=doc.animation.currentFrame;
    doc.animation.frames.forEach((frame,i)=>{if(i!==current)convert(frame.layers,i);});
    convert(doc.layers,current);
    syncActiveCel(doc);
    ensureTrackEffects(doc);
  }else convert(doc.layers,0);
}
