/** Huelith document actions: pixel processing and geometry are deliberately kept separate
 * from the dialogs. The same operation is performed on every animation cel. */
import type { Document, Layer, Point, SelectionRect, VectorShape } from './types';
import { scaleShape } from './geometry';
import { decodeImage, exportCanvas, prepareImages } from './render';
import { ensureTrackGradients, syncActiveCel } from './animation';

export type ResampleMode = 'nearest' | 'smooth';
export type DocumentAction =
  | { kind: 'resize-image'; width: number; height: number }
  | { kind: 'resize-canvas'; width: number; height: number; anchorX: number; anchorY: number }
  | { kind: 'crop'; rect: SelectionRect }
  | { kind: 'flip-horizontal' | 'flip-vertical' | 'rotate-cw' | 'rotate-ccw' | 'rotate-180' };
export const ACTION_LIMIT = 16384;
export function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= ACTION_LIMIT && height <= ACTION_LIMIT && width * height <= 100_000_000;
}
export function cropRect(rect: SelectionRect, width: number, height: number): SelectionRect {
  const x = Math.min(width, Math.max(0, Math.floor(rect.x)));
  const y = Math.min(height, Math.max(0, Math.floor(rect.y)));
  const right = Math.min(width, Math.max(0, Math.ceil(rect.x + rect.width)));
  const bottom = Math.min(height, Math.max(0, Math.ceil(rect.y + rect.height)));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function everyCel(doc: Document, visit: (layers: Layer[]) => void): void {
  if (doc.animation) {
    syncActiveCel(doc);
    for (let index = 0; index < doc.animation.frames.length; index++) {
      if (index === doc.animation.currentFrame) continue;
      visit(doc.animation.frames[index].layers);
    }
  }
  visit(doc.layers);
}
function eachLayer(layers: Layer[], fn: (layer: Layer) => void): void {
  for (const layer of layers) {
    fn(layer);
    if (layer.type === 'group') eachLayer(layer.children, fn);
  }
}
function transformCreatives(doc: Document, point: (point: Point) => Point, sx = 1, sy = 1): void {
  for (const object of doc.creative ?? []) {
    Object.assign(object, point(object));
    object.radius *= (Math.abs(sx) + Math.abs(sy)) / 2;
    if (object.points) object.points = object.points.map(point);
    if (object.tracks?.x) object.tracks.x = object.tracks.x.map(k => ({ ...k, value: typeof k.value === 'number' ? point({x:k.value,y:0}).x : k.value }));
    if (object.tracks?.y) object.tracks.y = object.tracks.y.map(k => ({ ...k, value: typeof k.value === 'number' ? point({x:0,y:k.value}).y : k.value }));
  }
}
function scaleShapeGeometry(shape:VectorShape,sx:number,sy:number):void{
 const b={x:shape.x,y:shape.y,width:shape.width,height:shape.height};
 scaleShape(shape,b,{x:shape.x*sx,y:shape.y*sy,width:shape.width*sx,height:shape.height*sy});
}
function scaleLayer(layer: Layer, sx: number, sy: number, skipCanonicalGradient=false): void {
  layer.x *= sx; layer.y *= sy;
  if (layer.mask) layer.mask = {x:layer.mask.x*sx,y:layer.mask.y*sy,width:layer.mask.width*sx,height:layer.mask.height*sy};
  if (layer.type === 'raster') {
    layer.scaleX = (layer.scaleX ?? 1) * sx;
    layer.scaleY = (layer.scaleY ?? 1) * sy;
  } else if (layer.type === 'gradient') {
    if(!skipCanonicalGradient)scaleShapeGeometry(layer.gradient,sx,sy);
  } else if (layer.type === 'vector') {
    layer.shapes.forEach(shape => scaleShapeGeometry(shape,sx,sy));
  } else layer.children.forEach(child => scaleLayer(child,sx,sy,skipCanonicalGradient));
}
function shiftLayer(layer: Layer, dx: number, dy: number): void {
  layer.x += dx; layer.y += dy;
  if (layer.mask) { layer.mask.x += dx; layer.mask.y += dy; }
  if (layer.type === 'group') { // Masks inside groups use absolute document coordinates.
    eachLayer(layer.children, child => { if (child.mask) { child.mask.x += dx;child.mask.y += dy; } });
  }
}
function remapShape(shape: VectorShape, op: DocumentAction, w: number, h: number): void {
  const tr = (p: Point): Point => {
    switch (op.kind) {
      case 'flip-horizontal': return { x: w - p.x, y: p.y };
      case 'flip-vertical': return { x: p.x, y: h - p.y };
      case 'rotate-cw': return { x: h - p.y, y: p.x };
      case 'rotate-ccw': return { x: p.y, y: w - p.x };
      case 'rotate-180': return { x: w - p.x, y: h - p.y };
      default: return p;
    }
  };
  const offset=tr({x:0,y:0});
  const local=(p:Point):Point=>{const q=tr(p);return {x:q.x-offset.x,y:q.y-offset.y};};
  const before={x:shape.x,y:shape.y,width:shape.width,height:shape.height};
  const a=local({x:before.x,y:before.y}),b=local({x:before.x+before.width,y:before.y+before.height});
  if(shape.kind==='line'){
    shape.x=a.x;shape.y=a.y;shape.width=b.x-a.x;shape.height=b.y-a.y;
  }else if(shape.kind==='text'){
    const center=local({x:before.x+before.width/2,y:before.y+before.height/2});
    shape.x=center.x-before.width/2;shape.y=center.y-before.height/2;
    shape.width=before.width;shape.height=before.height;
    if(op.kind==='rotate-cw')shape.rotation=(shape.rotation??0)+90;
    if(op.kind==='rotate-ccw')shape.rotation=(shape.rotation??0)-90;
    if(op.kind==='rotate-180')shape.rotation=(shape.rotation??0)+180;
  }else{
    shape.x=Math.min(a.x,b.x);shape.y=Math.min(a.y,b.y);
    shape.width=Math.abs(b.x-a.x);shape.height=Math.abs(b.y-a.y);
  }
  if (shape.nodes) shape.nodes = shape.nodes.map(n => ({ ...local(n), nodeMode:n.nodeMode, in:n.in?local(n.in):undefined, out:n.out?local(n.out):undefined }));
  if (shape.points) shape.points=shape.points.map(local);
  if (shape.controls) shape.controls=shape.controls.map(local) as typeof shape.controls;
  // Geometry itself has been rotated; adding another shape.rotation would
  // double-rotate non-text vector paths and geometric primitives.
  if(shape.kind==='gradient'){
    const uv=(x:number,y:number):Point=>{
      switch(op.kind){
        case 'flip-horizontal':return{x:1-x,y};
        case 'flip-vertical':return{x,y:1-y};
        case 'rotate-cw':return{x:1-y,y:x};
        case 'rotate-ccw':return{x:y,y:1-x};
        case 'rotate-180':return{x:1-x,y:1-y};
        default:return{x,y};
      }
    };
    if(shape.gradientStartX!==undefined || shape.gradientEndX!==undefined){
      const start=uv(shape.gradientStartX??0,shape.gradientStartY??.5);
      const end=uv(shape.gradientEndX??1,shape.gradientEndY??.5);
      shape.gradientStartX=start.x;shape.gradientStartY=start.y;shape.gradientEndX=end.x;shape.gradientEndY=end.y;
    }
    if(shape.gradientPoints)shape.gradientPoints=shape.gradientPoints.map(p=>({...p,...uv(p.x,p.y)}));
    if(shape.gradientCenterX!==undefined||shape.gradientCenterY!==undefined){
      const center=uv(shape.gradientCenterX??.5,shape.gradientCenterY??.5);
      shape.gradientCenterX=center.x;shape.gradientCenterY=center.y;
    }
    if(shape.gradientTransformStack)shape.gradientTransformStack=shape.gradientTransformStack.map(step=>({...step,
      centerX:uv(step.centerX,step.centerY).x,centerY:uv(step.centerX,step.centerY).y}));
    if(op.kind==='flip-horizontal'||op.kind==='flip-vertical')shape.gradientRotation=-(shape.gradientRotation??0);
  }
  if (op.kind==='flip-horizontal' || op.kind==='flip-vertical') shape.rotation=-(shape.rotation??0);
}
/** Apply one atomic geometry command; `doc` is a store-owned working clone. */
export function applyDocumentAction(doc: Document, action: DocumentAction): void {
  const w=doc.width,h=doc.height;
  if (action.kind==='resize-image' || action.kind==='resize-canvas') {
    if (!validDimensions(action.width,action.height)) throw new Error('Image dimensions must be 1–16384 px (maximum 100 megapixels).');
  }
  if (action.kind==='resize-image') {
    const sx=action.width/w,sy=action.height/h;
    everyCel(doc,layers => layers.forEach(layer=>scaleLayer(layer,sx,sy,Boolean(doc.animation))));
    if (doc.animation) for (const gradient of Object.values(ensureTrackGradients(doc)))
      scaleShapeGeometry(gradient,sx,sy);
    transformCreatives(doc,p=>({x:p.x*sx,y:p.y*sy}),sx,sy);
    doc.width=action.width;doc.height=action.height;
    return;
  }
  if (action.kind==='resize-canvas' || action.kind==='crop') {
    const rect = action.kind==='crop' ? cropRect(action.rect,w,h) : null;
    const nw=action.kind==='crop'?rect!.width:action.width, nh=action.kind==='crop'?rect!.height:action.height;
    if (!validDimensions(nw,nh)) throw new Error('Crop or canvas bounds are empty or out of range.');
    const dx=rect ? -rect.x : (nw-w)*Math.min(1,Math.max(0,action.kind==='resize-canvas'?action.anchorX:.5));
    const dy=rect ? -rect.y : (nh-h)*Math.min(1,Math.max(0,action.kind==='resize-canvas'?action.anchorY:.5));
    everyCel(doc,layers=>layers.forEach(layer=>shiftLayer(layer,dx,dy)));
    transformCreatives(doc,p=>({x:p.x+dx,y:p.y+dy}));
    doc.width=nw; doc.height=nh;
    return;
  }
  const swap=action.kind==='rotate-cw'||action.kind==='rotate-ccw';
  const transform=(point:Point):Point=>{
    switch(action.kind){
      case 'flip-horizontal':return {x:w-point.x,y:point.y};
      case 'flip-vertical':return {x:point.x,y:h-point.y};
      case 'rotate-cw':return {x:h-point.y,y:point.x};
      case 'rotate-ccw':return {x:point.y,y:w-point.x};
      case 'rotate-180':return {x:w-point.x,y:h-point.y};
    }
  };
  const update=(layers:Layer[])=>{
    // Group layer coordinates are parent-relative: transform the outer origin,
    // then transform child offsets locally so group composition remains intact.
    const base=transform({x:0,y:0});
    const coordinate=(point:Point,nested:boolean)=>{const q=transform(point);return nested?{x:q.x-base.x,y:q.y-base.y}:q;};
    const edit=(layer:Layer,nested=false)=>{
      const oldX=layer.x,oldY=layer.y;
      if(layer.type==='raster'){
        const rw=(layer.imageWidth??w)*(layer.scaleX??1),rh=(layer.imageHeight??h)*(layer.scaleY??1);
        const a=coordinate({x:oldX,y:oldY},nested),b=coordinate({x:oldX+rw,y:oldY+rh},nested);
        layer.x=Math.min(a.x,b.x);layer.y=Math.min(a.y,b.y);
        if(swap) {const scale=layer.scaleX;layer.scaleX=layer.scaleY;layer.scaleY=scale;}
      } else {
        const pos=coordinate({x:oldX,y:oldY},nested);layer.x=pos.x;layer.y=pos.y;
        if(layer.type==='gradient'&&!doc.animation) remapShape(layer.gradient,action,w,h);
        if(layer.type==='vector') layer.shapes.forEach(shape=>remapShape(shape,action,w,h));
        if(layer.type==='group') layer.children.forEach(child=>edit(child,true));
      }
      if(layer.mask){const a=transform({x:layer.mask.x,y:layer.mask.y});const b=transform({x:layer.mask.x+layer.mask.width,y:layer.mask.y+layer.mask.height}); layer.mask={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};}
    };
    layers.forEach(layer=>edit(layer));
  };
  everyCel(doc,update);
  if(doc.animation) for(const gradient of Object.values(ensureTrackGradients(doc))) remapShape(gradient,action,w,h);
  transformCreatives(doc,transform);
  if(swap){doc.width=h;doc.height=w;}
}

/** Binary-correct pixel transformation: rotations and flips operate on RGB and alpha,
 * and both image pixels and cutout masks use the identical transform. */
export async function prepareRasterAction(doc: Document, action: DocumentAction,
  resampling: ResampleMode = 'smooth'): Promise<Map<string,{data:string;width:number;height:number}>> {
  if (action.kind==='resize-canvas' || action.kind==='crop') return new Map();
  const isResize=action.kind==='resize-image';
  const sx=isResize?action.width/doc.width:1,sy=isResize?action.height/doc.height:1;
  const sources=new Map<string,{width:number;height:number}>();
  const scan=(layers:Layer[])=>eachLayer(layers,layer=>{
    if(layer.type!=='raster')return;
    if(layer.image) sources.set(layer.image,{width:layer.imageWidth??0,height:layer.imageHeight??0});
    if(layer.cutoutMask?.data) sources.set(layer.cutoutMask.data,{width:layer.cutoutMask.width,height:layer.cutoutMask.height});
  });
  scan(doc.layers);
  for(const frame of doc.animation?.frames??[])scan(frame.layers);
  const replacements=new Map<string,{data:string;width:number;height:number}>();
  for(const [source] of sources) {
    const image=await decodeImage(source);
    if(!image) throw new Error('Could not read a raster layer. No changes were applied.');
    const oldW=image.naturalWidth,oldH=image.naturalHeight;
    const rotate=action.kind==='rotate-cw'||action.kind==='rotate-ccw';
    const nw=isResize?Math.max(1,Math.round(oldW*sx)):rotate?oldH:oldW;
    const nh=isResize?Math.max(1,Math.round(oldH*sy)):rotate?oldW:oldH;
    if(!validDimensions(nw,nh)) throw new Error('Resampled layer exceeds the image dimension limits.');
    const canvas=document.createElement('canvas');canvas.width=nw;canvas.height=nh;
    const ctx=canvas.getContext('2d',{willReadFrequently:false});if(!ctx)throw new Error('Canvas processing is unavailable.');
    ctx.imageSmoothingEnabled=resampling!=='nearest';ctx.imageSmoothingQuality='high';
    if (action.kind==='rotate-cw') {ctx.translate(nw,0);ctx.rotate(Math.PI/2);}
    if (action.kind==='rotate-ccw') {ctx.translate(0,nh);ctx.rotate(-Math.PI/2);}
    if (action.kind==='rotate-180') {ctx.translate(nw,nh);ctx.rotate(Math.PI);}
    if (action.kind==='flip-horizontal') {ctx.translate(nw,0);ctx.scale(-1,1);}
    if (action.kind==='flip-vertical') {ctx.translate(0,nh);ctx.scale(1,-1);}
    ctx.drawImage(image,0,0,isResize?nw:oldW,isResize?nh:oldH);
    replacements.set(source,{data:canvas.toDataURL('image/png'),width:nw,height:nh});
  }
  return replacements;
}
export function swapRasterSources(doc:Document, replacements:ReadonlyMap<string,{data:string;width:number;height:number}>, action?:DocumentAction, oldWidth?:number, oldHeight?:number):void{
  const edit=(layers:Layer[])=>eachLayer(layers,layer=>{
    if(layer.type!=='raster')return;
    const image=replacements.get(layer.image);
    if(image){layer.image=image.data;layer.imageWidth=image.width;layer.imageHeight=image.height;
      if(action?.kind==='resize-image' && oldWidth && oldHeight){layer.scaleX=(layer.scaleX??1)*oldWidth/action.width;layer.scaleY=(layer.scaleY??1)*oldHeight/action.height;}
    }
    const mask=layer.cutoutMask&&replacements.get(layer.cutoutMask.data);
    if(mask&&layer.cutoutMask)layer.cutoutMask={...layer.cutoutMask,data:mask.data,width:mask.width,height:mask.height};
  });
  edit(doc.layers);
  doc.animation?.frames.forEach(frame=>edit(frame.layers));
}
/** Crop the visible composite to nontransparent alpha, or return null when opaque/empty. */
export async function transparentTrimBounds(doc:Document):Promise<SelectionRect|null>{
  if(doc.background!=='transparent') throw new Error('Trim Transparent Pixels requires a transparent document background.');
  await prepareImages(doc);
  const canvas=exportCanvas(doc),ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Cannot inspect canvas transparency.');
  const {data,width,height}=ctx.getImageData(0,0,canvas.width,canvas.height);
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(right<left||bottom<top)return null;
  return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
