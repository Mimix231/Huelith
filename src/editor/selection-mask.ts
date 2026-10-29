import type { SelectionRect } from './types';

/** In-memory precise selection masks, isolated by document ID. The published
 * rectangular selection remains the broad bounds for existing editor actions. */
export interface PixelSelection { width:number; height:number; alpha:Uint8Array; bounds:SelectionRect; revision:number }
const selections=new Map<string,PixelSelection>();
let revision=0;
export function pixelSelection(docId:string):PixelSelection|undefined{return selections.get(docId);}
export function clearPixelSelection(docId:string):void{selections.delete(docId);}
export function setPixelSelection(docId:string,width:number,height:number,alpha:Uint8Array):PixelSelection{
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height!==alpha.length)throw Error('Invalid selection mask dimensions.');
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(alpha[y*width+x]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  const bounds={x:right<0?0:left,y:bottom<0?0:top,width:right<0?0:right-left+1,height:bottom<0?0:bottom-top+1};
  const selection={width,height,alpha,bounds,revision:++revision};
  selections.set(docId,selection);return selection;
}
export function selectionPreview(selection:PixelSelection):HTMLCanvasElement{
  const canvas=document.createElement('canvas');canvas.width=selection.width;canvas.height=selection.height;
  const ctx=canvas.getContext('2d');if(!ctx)return canvas;
  const data=ctx.createImageData(canvas.width,canvas.height);
  for(let i=0;i<selection.alpha.length;i++){
    const n=i*4;data.data[n]=61;data.data[n+1]=217;data.data[n+2]=250;
    data.data[n+3]=Math.round(selection.alpha[i]*.24);
  }
  ctx.putImageData(data,0,0);return canvas;
}
/** Restore source pixels outside an irregular selection (including antialias). */
export function constrainPixels(before:ImageData,after:ImageData,selection:PixelSelection,offsetX=0,offsetY=0):void{
  if(before.width!==after.width||before.height!==after.height)throw Error('Selection buffer mismatch');
  for(let y=0;y<after.height;y++)for(let x=0;x<after.width;x++){
    const sx=x+offsetX,sy=y+offsetY;
    const alpha=sx>=0&&sy>=0&&sx<selection.width&&sy<selection.height?selection.alpha[sy*selection.width+sx]/255:0;
    const o=(y*after.width+x)*4;
    for(let c=0;c<4;c++)after.data[o+c]=Math.round(before.data[o+c]*(1-alpha)+after.data[o+c]*alpha);
  }
}
