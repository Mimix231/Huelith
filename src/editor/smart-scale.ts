/** Huelith magnetic scale snapping. Align the *transformed layer boundary*,
 * not the mouse cursor. A proportional resize must be solved through the
 * actual resize geometry before showing a guide. */
import { rotate } from './geometry';
import { resizedTransform, type DragOperation } from './operations';
import { snapBounds, type SnapGuide } from './smart-snapping';
import type { Document, Point, SelectionRect } from './types';

type ScaleDrag = Extract<DragOperation, {kind:'transform'}>;
const abs = Math.abs;
const midpoint=(rect:SelectionRect):Point=>({x:rect.x+rect.width/2,y:rect.y+rect.height/2});
const axisEdges=(rect:SelectionRect,axis:'x'|'y')=>axis==='x'
  ? [rect.x,rect.x+rect.width/2,rect.x+rect.width]
  : [rect.y,rect.y+rect.height/2,rect.y+rect.height];
export function visualScaleBounds(rect:SelectionRect, angle=0):SelectionRect{
  if(!angle) return rect;
  const center=midpoint(rect);
  const vertices=[{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y},
    {x:rect.x+rect.width,y:rect.y+rect.height},{x:rect.x,y:rect.y+rect.height}]
    .map(point=>rotate(point,center,angle));
  const minX=Math.min(...vertices.map(p=>p.x)),maxX=Math.max(...vertices.map(p=>p.x));
  const minY=Math.min(...vertices.map(p=>p.y)),maxY=Math.max(...vertices.map(p=>p.y));
  return {x:minX,y:minY,width:maxX-minX,height:maxY-minY};
}
function worldPoint(local:Point, drag:ScaleDrag):Point{
  return drag.rotation ? rotate(local,midpoint(drag.bounds),drag.rotation):local;
}
function localPoint(world:Point,drag:ScaleDrag):Point{
  return drag.rotation ? rotate(world,midpoint(drag.bounds),-drag.rotation):world;
}
/** Change a scale dimension by native document pixels. The other corner is
 * anchored; corner aspect lock keeps the original width/height ratio. */
function resizeBy(drag:ScaleDrag,dimension:'x'|'y',delta:number):Point{
  const local={...localPoint(drag.last,drag)};
  const handle=drag.handle;
  const base=drag.bounds;
  const proportional=Boolean(drag.keepAspect && /^(nw|ne|sw|se)$/.test(handle));
  if(!proportional){
    if(dimension==='x'&&(handle.includes('w')||handle.includes('e')))
      local.x+=(handle.includes('w')?-1:1)*delta;
    if(dimension==='y'&&(handle.includes('n')||handle.includes('s')))
      local.y+=(handle.includes('n')?-1:1)*delta;
    return worldPoint(local,drag);
  }
  const current=resizedTransform(drag);
  const ratio=base.width/Math.max(.00001,base.height);
  const newW=Math.max(2,dimension==='x'?current.width+delta:current.width+delta*ratio);
  const newH=newW/ratio;
  const anchor={x:handle.includes('w')?base.x+base.width:base.x,
    y:handle.includes('n')?base.y+base.height:base.y};
  return worldPoint({x:anchor.x+(handle.includes('w')?-1:1)*newW,
    y:anchor.y+(handle.includes('n')?-1:1)*newH},drag);
}
function targetNear(at:number, axis:'x'|'y', doc:Pick<Document,'width'|'height'|'layers'>,
  exceptId:string|null, zoom:number):SnapGuide|null{
  const result=snapBounds({x:axis==='x'?at:doc.width+999999,
    y:axis==='y'?at:doc.height+999999,width:0,height:0},doc,{x:0,y:0},exceptId,zoom,false);
  return result.guides.find(guide=>guide.axis===axis)??null;
}
export interface ScaleSnapResult { point:Point; guides:SnapGuide[]; bounds:SelectionRect; }
export function snapScale(drag:ScaleDrag,doc:Pick<Document,'width'|'height'|'layers'>,
  exceptLayerId:string|null,zoom:number):ScaleSnapResult{
  const baseline=visualScaleBounds(resizedTransform(drag),drag.rotation??0);
  const threshold=8/Math.max(.05,zoom);
  type Choice={point:Point;distance:number;delta:number};
  let best:Choice|null=null;
  // First calculate where the *actual visible image* is, then solve a resize
  // that makes its resulting boundary coincide with a magnetic target.
  for(const axis of ['x','y'] as const){
    const handleMovesAxis=axis==='x'?/[we]/.test(drag.handle):/[ns]/.test(drag.handle);
    if(!handleMovesAxis && !drag.rotation)continue;
    for(const edge of axisEdges(baseline,axis)){
      const target=targetNear(edge,axis,doc,exceptLayerId,zoom);
      if(!target)continue;
      const diff=target.at-edge;
      if(abs(diff)>threshold)continue;
      for(const dimension of ['x','y'] as const){
        if(!drag.rotation && dimension!==axis)continue;
        if(dimension==='x'&&!/[we]/.test(drag.handle))continue;
        if(dimension==='y'&&!/[ns]/.test(drag.handle))continue;
        const probePoint=resizeBy(drag,dimension,1);
        const trial=visualScaleBounds(resizedTransform({...drag,last:probePoint}),drag.rotation??0);
        const before=axisEdges(baseline,axis),after=axisEdges(trial,axis);
        const index=before.indexOf(edge);
        const derivative=after[index]-edge;
        if(abs(derivative)<.01)continue;
        const change=diff/derivative;
        if(abs(change)>Math.max(32/Math.max(.05,zoom),32))continue;
        // The resize strategy can change at the aspect-lock branch boundary;
        // refine against the same real geometry used for rendering.
        let point=resizeBy(drag,dimension,change);
        let rect=visualScaleBounds(resizedTransform({...drag,last:point}),drag.rotation??0);
        let error=target.at-axisEdges(rect,axis)[index];
        if(abs(error)>.06 && abs(derivative)>.01){
          point=resizeBy(drag,dimension,change+error/derivative);
          rect=visualScaleBounds(resizedTransform({...drag,last:point}),drag.rotation??0);
          error=target.at-axisEdges(rect,axis)[index];
        }
        if(abs(error)>Math.max(.7/Math.max(zoom,.1),.7))continue;
        const score=abs(diff)+Math.hypot(point.x-drag.last.x,point.y-drag.last.y)*.01;
        if(!best||score<best.distance)best={point,distance:score,delta:diff};
      }
    }
  }
  if(!best)return{point:drag.last,guides:[],bounds:baseline};
  let resolvedPoint=best.point;
  // A freely resized corner can lock to both white-canvas edges together.
  // Do not try to force two independent constraints onto an aspect-locked
  // corner; that would break its width/height ratio.
  if(!drag.rotation&&!drag.keepAspect&&/^(nw|ne|sw|se)$/.test(drag.handle)){
    for(const axis of ['x','y'] as const){
      const stage={...drag,last:resolvedPoint};
      const rect=resizedTransform(stage);
      const edge=axis==='x'
        ? drag.handle.includes('w')?rect.x:rect.x+rect.width
        : drag.handle.includes('n')?rect.y:rect.y+rect.height;
      const target=targetNear(edge,axis,doc,exceptLayerId,zoom);
      if(target&&abs(target.at-edge)<=threshold){
        const diff=target.at-edge;
        const dimensionChange=(axis==='x'&&drag.handle.includes('w')||axis==='y'&&drag.handle.includes('n'))?-diff:diff;
        resolvedPoint=resizeBy(stage,axis,dimensionChange);
      }
    }
  }
  const final=visualScaleBounds(resizedTransform({...drag,last:resolvedPoint}),drag.rotation??0);
  const guides:SnapGuide[]=[];
  for(const axis of ['x','y'] as const)for(const edge of axisEdges(final,axis)){
    const nearest=targetNear(edge,axis,doc,exceptLayerId,zoom);
    if(nearest&&abs(nearest.at-edge)<Math.max(.7/Math.max(zoom,.1),.7)
      && !guides.some(item=>item.axis===axis&&item.at===nearest.at))guides.push(nearest);
  }
  return{point:resolvedPoint,guides,bounds:final};
}
