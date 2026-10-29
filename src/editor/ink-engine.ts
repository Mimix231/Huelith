import type { Point } from './types';

/** A single tablet or pointer sample in artwork (not screen) coordinates. */
export interface InkPoint extends Point { pressure: number }
export type StrokeEngine = 'paint' | 'ink';
export interface InkSettings {
  size: number;
  opacity: number;
  flow: number;
  spacing: number;
  taper: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  color: string;
}
export const INK_PRESETS: ReadonlyArray<{id:string; label:string; engine:StrokeEngine; settings:Partial<InkSettings>; hardness:number; smoothing:number}> = [
  {id:'smooth-ink',label:'Smooth Ink',engine:'ink',settings:{size:10,opacity:1,flow:1,spacing:.12,taper:.12,pressureSize:true},hardness:1,smoothing:.55},
  {id:'comic-line',label:'Comic Line',engine:'ink',settings:{size:18,opacity:1,flow:1,spacing:.08,taper:.18,pressureSize:true},hardness:1,smoothing:.68},
  {id:'fine-liner',label:'Fine Liner',engine:'ink',settings:{size:4,opacity:1,flow:1,spacing:.1,taper:0,pressureSize:false},hardness:1,smoothing:.4},
  {id:'soft-paint',label:'Soft Paint',engine:'paint',settings:{size:48,opacity:.85,flow:.35,spacing:.12,taper:0},hardness:.32,smoothing:.5},
  {id:'round-brush',label:'Round Brush',engine:'paint',settings:{size:22,opacity:1,flow:.9,spacing:.15,taper:0},hardness:.88,smoothing:.55},
  {id:'marker',label:'Marker',engine:'paint',settings:{size:35,opacity:.65,flow:.42,spacing:.09,taper:0},hardness:1,smoothing:.34},
];
export const clip01 = (n:number):number => Math.max(0,Math.min(1,n));
export function inkWidth(index:number, count:number, pressure:number, config:InkSettings):number {
  const width=Math.max(.5,config.size)*(config.pressureSize?(.12+.88*clip01(pressure)):1);
  // Taper fades the first/last portion. It never changes the source image or pressure samples.
  const fraction=count <= 1 ? .5 : index/(count-1);
  const taper=clip01(config.taper);
  const shape=taper>0 ? Math.min(1, fraction/Math.max(.0001,taper), (1-fraction)/Math.max(.0001,taper)) : 1;
  return Math.max(.35,width*(.10+.90*Math.max(0,shape)));
}
/** Smooth the path without moving its start or end, so cursor and ink remain aligned. */
export function smoothInkPoints(input:readonly InkPoint[], iterations=1):InkPoint[] {
  if(input.length<3||iterations<=0)return input.map(p=>({...p}));
  let data=input.map(p=>({...p}));
  for(let iteration=0;iteration<Math.min(3,iterations);iteration++){
    const next:InkPoint[]=[data[0]];
    for(let i=0;i<data.length-1;i++){
      const a=data[i],b=data[i+1];
      next.push({x:a.x*.75+b.x*.25,y:a.y*.75+b.y*.25,pressure:a.pressure*.75+b.pressure*.25},
        {x:a.x*.25+b.x*.75,y:a.y*.25+b.y*.75,pressure:a.pressure*.25+b.pressure*.75});
    }
    next.push(data[data.length-1]);data=next;
  }
  return data;
}
/** Ink uses a *filled variable-width contour*, never a trail of circles. This
 * produces continuous anticorrelated clean edges even on a mouse at low FPS. */
export function drawInkContour(ctx:CanvasRenderingContext2D, points:readonly InkPoint[], config:InkSettings, offset:Point={x:0,y:0}):void {
  if(!points.length)return;
  const smooth=smoothInkPoints(points,points.length<=3?0:1);
  const n=smooth.length;
  const normals:Point[]=smooth.map((_,index)=>{
    const before=smooth[Math.max(0,index-1)],after=smooth[Math.min(n-1,index+1)];
    const dx=after.x-before.x,dy=after.y-before.y,len=Math.hypot(dx,dy)||1;
    return {x:-dy/len,y:dx/len};
  });
  ctx.save();ctx.fillStyle=config.color;
  ctx.globalAlpha=clip01(config.opacity)*clip01(config.flow)*(config.pressureOpacity?clip01(points.reduce((sum,p)=>sum+p.pressure,0)/points.length):1);
  ctx.beginPath();
  if(n===1){const radius=inkWidth(0,n,smooth[0].pressure,config)/2;ctx.arc(smooth[0].x+offset.x,smooth[0].y+offset.y,radius,0,Math.PI*2);}
  else {
    for(let i=0;i<n;i++){
      const point=smooth[i],radius=inkWidth(i,n,point.pressure,config)/2,normal=normals[i];
      const x=point.x+offset.x+normal.x*radius,y=point.y+offset.y+normal.y*radius;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    for(let i=n-1;i>=0;i--){const point=smooth[i],radius=inkWidth(i,n,point.pressure,config)/2,normal=normals[i];
      ctx.lineTo(point.x+offset.x-normal.x*radius,point.y+offset.y-normal.y*radius);
    }
    ctx.closePath();
  }
  // For pen pressure-opacity, draw a continuous series of contour quads.
  // Unlike averaging the whole gesture, each segment responds to its own
  // pressure samples. The default path remains one solid anti-aliased fill.
  if(config.pressureOpacity && n>1){
    ctx.beginPath();
    for(let i=0;i<n-1;i++){
      const a=smooth[i],b=smooth[i+1],na=normals[i],nb=normals[i+1];
      const ra=inkWidth(i,n,a.pressure,config)/2,rb=inkWidth(i+1,n,b.pressure,config)/2;
      ctx.globalAlpha=clip01(config.opacity)*clip01(config.flow)*clip01((a.pressure+b.pressure)/2);
      ctx.beginPath();ctx.moveTo(a.x+offset.x+na.x*ra,a.y+offset.y+na.y*ra);
      ctx.lineTo(b.x+offset.x+nb.x*rb,b.y+offset.y+nb.y*rb);
      ctx.lineTo(b.x+offset.x-nb.x*rb,b.y+offset.y-nb.y*rb);
      ctx.lineTo(a.x+offset.x-na.x*ra,a.y+offset.y-na.y*ra);ctx.closePath();ctx.fill();
    }
  }else ctx.fill();
  ctx.restore();
}
export function strokeLength(points:readonly Point[]):number{
  let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return length;
}
/** A raw mouse stroke can have huge movement gaps. Densify each segment to
 * maintain pressure sampling while never adding points outside its endpoints. */
export function interpolateInkSamples(a:InkPoint,b:InkPoint,step:number):InkPoint[]{
  const distance=Math.hypot(a.x-b.x,a.y-b.y),count=Math.max(1,Math.ceil(distance/Math.max(.5,step)));
  const result:InkPoint[]=[];
  for(let i=1;i<=count;i++){const t=i/count;result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,pressure:clip01(a.pressure+(b.pressure-a.pressure)*t)});}
  return result;
}
