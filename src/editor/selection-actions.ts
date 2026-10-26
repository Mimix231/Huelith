/** Editable raster selection operations; native Canvas2D, original layer FX retained.
 * The selection lives in document coordinates, even on a scaled or rotated image. */
import type { RasterLayer, SelectionRect } from './types';
import { decodeImage } from './render';
import { cropRect, validDimensions } from './document-actions';

export type SelectionAction='fill'|'stroke'|'clear';
export interface RasterSelectionResult {image:string;width:number;height:number;}
function pixelPoint(layer:RasterLayer,p:{x:number;y:number},width:number,height:number):{x:number;y:number}{
  const sx=(layer.imageWidth??width)*(layer.scaleX??1)/width,sy=(layer.imageHeight??height)*(layer.scaleY??1)/height;
  const dw=width*sx,dh=height*sy,theta=-(layer.rotation??0)*Math.PI/180;
  const cx=layer.x+dw/2,cy=layer.y+dh/2;
  const dx=p.x-cx,dy=p.y-cy;
  const rx=dx*Math.cos(theta)-dy*Math.sin(theta),ry=dx*Math.sin(theta)+dy*Math.cos(theta);
  return {x:(rx+dw/2)/Math.max(.0001,sx),y:(ry+dh/2)/Math.max(.0001,sy)};
}
export async function prepareSelectionEdit(layer:RasterLayer,selection:SelectionRect,action:SelectionAction,
  color:string,strokeWidth:number,documentWidth:number,documentHeight:number):Promise<RasterSelectionResult>{
  if(layer.locked)throw Error('Unlock the raster layer before editing its contents.');
  if(!/^#[\da-f]{6}$/i.test(color))throw Error('Select a valid foreground color.');
  const bounded=cropRect(selection,documentWidth,documentHeight);
  if(bounded.width<1||bounded.height<1)throw Error('Make a non-empty selection first.');
  const decoded=layer.image?await decodeImage(layer.image):null;
  if(layer.image&&!decoded)throw Error('Image could not be decoded.');
  const width=decoded?.naturalWidth??layer.imageWidth??documentWidth;
  const height=decoded?.naturalHeight??layer.imageHeight??documentHeight;
  if(!validDimensions(width,height))throw Error('Layer image is outside native-resolution limits.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D is unavailable.');
  if(decoded)ctx.drawImage(decoded,0,0);
  const points=[{x:bounded.x,y:bounded.y},{x:bounded.x+bounded.width,y:bounded.y},
    {x:bounded.x+bounded.width,y:bounded.y+bounded.height},{x:bounded.x,y:bounded.y+bounded.height}]
    .map(p=>pixelPoint(layer,p,width,height));
  ctx.save();ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(const point of points.slice(1))ctx.lineTo(point.x,point.y);
  ctx.closePath();
  if(action==='clear'){ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#ffffff';ctx.fill();}
  else if(action==='fill'){ctx.globalCompositeOperation='source-over';ctx.fillStyle=color;ctx.fill();}
  else {ctx.lineJoin='miter';ctx.lineWidth=Math.max(.25,Math.min(1000,strokeWidth))/Math.max(.0001,(Math.abs(layer.scaleX??1)+Math.abs(layer.scaleY??1))/2);ctx.strokeStyle=color;ctx.stroke();}
  ctx.restore();
  return {image:canvas.toDataURL('image/png'),width,height};
}
