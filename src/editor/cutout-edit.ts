export type CutoutPoint={x:number;y:number};
export type CutoutPaintTool='keep'|'remove'|'eraser'|'line'|'lasso'|'polygon'|'rectangle'|'ellipse';
export interface CutoutShape { id:string;tool:CutoutPaintTool;operation:'keep'|'remove';size:number;points:CutoutPoint[]; }
export type CutoutHistoryEntry={kind:'add';shape:CutoutShape}|{kind:'update';id:string;shape:CutoutShape}|{kind:'delete';id:string}|{kind:'clear'};
export function resolveCutoutHistory(history:readonly CutoutHistoryEntry[]):CutoutShape[]{
 const order:string[]=[];const values=new Map<string,CutoutShape>();
 for(const entry of history){
  if(entry.kind==='clear'){order.length=0;values.clear();}
  else if(entry.kind==='add'){if(!values.has(entry.shape.id))order.push(entry.shape.id);values.set(entry.shape.id,entry.shape);}
  else if(entry.kind==='update'){if(values.has(entry.id))values.set(entry.id,entry.shape);}
  else if(entry.kind==='delete'){values.delete(entry.id);const i=order.indexOf(entry.id);if(i>=0)order.splice(i,1);}
 }return order.map(id=>values.get(id)!).filter(Boolean);
}
export function cutoutBounds(shape:CutoutShape):{x:number;y:number;width:number;height:number}{
 const x=Math.min(...shape.points.map(p=>p.x)),y=Math.min(...shape.points.map(p=>p.y));
 return{x,y,width:Math.max(...shape.points.map(p=>p.x))-x,height:Math.max(...shape.points.map(p=>p.y))-y};
}
export function cutoutHandles(shape:CutoutShape):CutoutPoint[]{
 if(!shape.points.length)return [];
 const bounds=cutoutBounds(shape);
 const corners=[{x:bounds.x,y:bounds.y},{x:bounds.x+bounds.width,y:bounds.y},
  {x:bounds.x+bounds.width,y:bounds.y+bounds.height},{x:bounds.x,y:bounds.y+bounds.height}];
 return ['rectangle','ellipse'].includes(shape.tool)?corners:
  shape.points.length<250?shape.points:corners;
}
export function translateCutout(shape:CutoutShape,dx:number,dy:number):CutoutShape{
 return{...shape,points:shape.points.map(p=>({x:p.x+dx,y:p.y+dy}))};
}
export function resizeCutout(shape:CutoutShape,handle:number,point:CutoutPoint):CutoutShape{
 if(shape.tool==='line')return{...shape,points:shape.points.map((p,i)=>i===handle?{...point}:p)};
 if(!['rectangle','ellipse'].includes(shape.tool) && shape.points.length<250)
  return{...shape,points:shape.points.map((p,i)=>i===handle?{...point}:p)};
 const corners=cutoutHandles(shape),opposite=corners[(handle+2)%4];
 const start=corners[handle];
 const sx=(point.x-opposite.x)/((start.x-opposite.x)||1),sy=(point.y-opposite.y)/((start.y-opposite.y)||1);
 return{...shape,points:shape.points.map(p=>({x:opposite.x+(p.x-opposite.x)*sx,y:opposite.y+(p.y-opposite.y)*sy}))};
}
export function cutoutShapeHit(shape:CutoutShape,point:CutoutPoint,tolerance=8):boolean{
 const bounds=cutoutBounds(shape),pad=Math.max(tolerance,shape.size/2);
 if(point.x<bounds.x-pad||point.x>bounds.x+bounds.width+pad||point.y<bounds.y-pad||point.y>bounds.y+bounds.height+pad)return false;
 if(shape.tool==='line'&&shape.points.length===4){
   const [a,b,c,d]=shape.points;let before=a;
   for(let i=1;i<=36;i++){const t=i/36,u=1-t;
     const after={x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
       y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};
     const vx=after.x-before.x,vy=after.y-before.y,length=vx*vx+vy*vy||1;
     const f=Math.max(0,Math.min(1,((point.x-before.x)*vx+(point.y-before.y)*vy)/length));
     if(Math.hypot(point.x-before.x-f*vx,point.y-before.y-f*vy)<pad)return true;
     before=after;
   }return false;
 }
 if(shape.tool==='rectangle')return true;
 if(shape.tool==='ellipse'){
   const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
   return ((point.x-cx)/Math.max(.5,bounds.width/2))**2+((point.y-cy)/Math.max(.5,bounds.height/2))**2<=1.06;
 }
 if(shape.tool==='polygon'||shape.tool==='lasso'){
   let inside=false;for(let a=0,b=shape.points.length-1;a<shape.points.length;b=a++){
     const start=shape.points[a],end=shape.points[b];
     if(((start.y>point.y)!==(end.y>point.y))&&point.x<(end.x-start.x)*(point.y-start.y)/(end.y-start.y)+start.x)inside=!inside;
   }return inside;
 }
 return shape.points.some(p=>Math.hypot(p.x-point.x,p.y-point.y)<pad)||shape.points.some((a,i)=>{
  if(i===0)return false;const b=shape.points[i-1],dx=a.x-b.x,dy=a.y-b.y,denom=dx*dx+dy*dy||1;
  const t=Math.max(0,Math.min(1,((point.x-b.x)*dx+(point.y-b.y)*dy)/denom));
  return Math.hypot(point.x-b.x-t*dx,point.y-b.y-t*dy)<pad;
 });
}
export function insertCutoutNode(shape:CutoutShape,at:number,point:CutoutPoint):CutoutShape{
 const points=[...shape.points];points.splice(Math.max(1,Math.min(points.length,at)),0,point);
 return{...shape,points};
}

/** Crisp, zoom-invariant editing grips for the Cutout canvas. The first and last
 * Bezier line points are anchors; the two middle points are tangent controls.
 * Input coordinates are native-image pixels; sx/sy convert to preview pixels. */
export function drawCutoutEditHandles(ctx:CanvasRenderingContext2D,shape:CutoutShape,
 sx:number,sy:number,zoom:number,selectedNode:number|null=null):void {
 const handles=cutoutHandles(shape);if(!handles.length)return;
 const bounds=cutoutBounds(shape);
 const radius=Math.max(.5,6/Math.max(.1,zoom));
 ctx.save();
 ctx.lineWidth=Math.max(.4,1.4/Math.max(.1,zoom));
 ctx.strokeStyle='#54f1dd';ctx.setLineDash([4/Math.max(.1,zoom),3/Math.max(.1,zoom)]);
 ctx.strokeRect(bounds.x*sx,bounds.y*sy,bounds.width*sx,bounds.height*sy);
 if(shape.tool==='line'&&handles.length===4){
   const [start,firstControl,secondControl,end]=handles;
   ctx.beginPath();ctx.moveTo(start.x*sx,start.y*sy);ctx.lineTo(firstControl.x*sx,firstControl.y*sy);
   ctx.moveTo(secondControl.x*sx,secondControl.y*sy);ctx.lineTo(end.x*sx,end.y*sy);
   ctx.stroke();
 }
 ctx.setLineDash([]);
 // Limit visual handles for highly sampled freehand strokes, matching the
 // existing editing cap without adding extra geometry to the saved mask.
 for (const [index,p] of handles.entries()) {
   if(index>=800)break;
   const x=p.x*sx,y=p.y*sy,selected=index===selectedNode;
   const control=shape.tool==='line'&&(index===1||index===2);
   const r=selected?radius*1.35:radius;
   ctx.beginPath();
   if(control){ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();}
   else ctx.arc(x,y,r,0,Math.PI*2);
   ctx.fillStyle=selected?'#53f1df':control?'#bffdf6':'#ffffff';
   ctx.fill();ctx.strokeStyle=selected?'#1c4d63':'#318fa5';ctx.stroke();
 }
 ctx.restore();
}
