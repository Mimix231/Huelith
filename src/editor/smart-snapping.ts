import type { Document, Layer, Point, SelectionRect } from './types';
import { shapeBounds } from './geometry';

export interface SnapGuide { axis:'x'|'y'; at:number; source:'canvas'|'layer'|'center'|'grid'; }
export interface SnapResult { dx:number; dy:number; guides:SnapGuide[]; }
/** Pixel-precision snapping: boundaries, centers, and nearby objects are stronger
 * candidates than the optional grid. Drag offsets are adjusted rather than moving
 * the pointer itself, so handles remain attached under the cursor. */
export function snapBounds(bounds:SelectionRect, doc: Pick<Document,'width'|'height'|'layers'>,
  movement:Point, exceptLayerId:string|null, zoom:number, grid=true):SnapResult{
  const threshold=7/Math.max(.05,zoom);
  const candidatesX:{at:number;source:SnapGuide['source']}[]=[
    {at:0,source:'canvas'},{at:doc.width/2,source:'center'},{at:doc.width,source:'canvas'}];
  const candidatesY:{at:number;source:SnapGuide['source']}[]=[
    {at:0,source:'canvas'},{at:doc.height/2,source:'center'},{at:doc.height,source:'canvas'}];
  const gather=(layers:readonly Layer[],offset:Point={x:0,y:0})=>{
    for(const layer of layers){
      if(!layer.visible||layer.id===exceptLayerId)continue;
      const x=offset.x+layer.x,y=offset.y+layer.y;
      let rect:SelectionRect;
      if(layer.type==='raster') rect={x,y,width:(layer.imageWidth??doc.width)*(layer.scaleX??1),height:(layer.imageHeight??doc.height)*(layer.scaleY??1)};
      else if(layer.type==='gradient') rect=shapeBounds(layer.gradient,{x,y});
      else if(layer.type==='vector' && layer.shapes.length){
        const boxes=layer.shapes.map(shape=>shapeBounds(shape,{x,y}));
        const left=Math.min(...boxes.map(b=>b.x)),top=Math.min(...boxes.map(b=>b.y));
        rect={x:left,y:top,width:Math.max(...boxes.map(b=>b.x+b.width))-left,height:Math.max(...boxes.map(b=>b.y+b.height))-top};
      } else {if(layer.type==='group')gather(layer.children,{x,y});continue;}
      candidatesX.push({at:rect.x,source:'layer'},{at:rect.x+rect.width/2,source:'layer'},{at:rect.x+rect.width,source:'layer'});
      candidatesY.push({at:rect.y,source:'layer'},{at:rect.y+rect.height/2,source:'layer'},{at:rect.y+rect.height,source:'layer'});
    }
  };gather(doc.layers);
  const seek=(axis:'x'|'y')=>{
    const pos=axis==='x'?bounds.x+movement.x:bounds.y+movement.y;
    const length=axis==='x'?bounds.width:bounds.height;
    const candidates=axis==='x'?candidatesX:candidatesY;
    let best:{delta:number;at:number;source:SnapGuide['source']}|null=null;
    for(const target of candidates)for(const edge of [pos,pos+length/2,pos+length]){
      const delta=target.at-edge;
      if(Math.abs(delta)<=threshold && (!best||Math.abs(delta)<Math.abs(best.delta)))best={delta,at:target.at,source:target.source};
    }
    if(!best&&grid){const target=Math.round(pos/10)*10,delta=target-pos;
      if(Math.abs(delta)<=Math.min(threshold,3))best={delta,at:target,source:'grid'};}
    return best;
  };
  const x=seek('x'),y=seek('y');
  return {dx:movement.x+(x?.delta??0),dy:movement.y+(y?.delta??0),guides:[...(x?[{axis:'x' as const,at:x.at,source:x.source}]:[]),...(y?[{axis:'y' as const,at:y.at,source:y.source}]:[])]};
}
/** Handle snapping for left/right/top/bottom plus canvas center anchors. */
export function snapHandle(point:Point,doc:Pick<Document,'width'|'height'>,zoom:number):{point:Point;guides:SnapGuide[]}{
  const threshold=7/Math.max(.05,zoom),guides:SnapGuide[]=[];let x=point.x,y=point.y;
  for(const target of [0,doc.width/2,doc.width])if(Math.abs(x-target)<=threshold){x=target;guides.push({axis:'x',at:x,source:target===doc.width/2?'center':'canvas'});break;}
  for(const target of [0,doc.height/2,doc.height])if(Math.abs(y-target)<=threshold){y=target;guides.push({axis:'y',at:y,source:target===doc.height/2?'center':'canvas'});break;}
  return {point:{x,y},guides};
}
