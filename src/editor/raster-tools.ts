import type { Point } from './types';

export type RetouchTool='smudge'|'blurBrush'|'sharpenBrush'|'dodge'|'burn'|'patternBrush';
const clamp=(value:number,min=0,max=255)=>Math.min(max,Math.max(min,value));
const same=(rgba:Uint8ClampedArray,p:number,target:readonly number[],tolerance:number):boolean=>{
  const i=p*4;
  const distance=Math.sqrt( .299*(rgba[i]-target[0])**2 + .587*(rgba[i+1]-target[1])**2 + .114*(rgba[i+2]-target[2])**2 + .5*(rgba[i+3]-target[3])**2);
  return distance<=tolerance*2.55;
};
/** Contiguous scanline flood-fill; uses 1 byte/pixel rather than an object queue. */
export function floodRegion(data:ImageData,x:number,y:number,tolerance:number,contiguous=true):Uint8Array{
  const {width:w,height:h}=data;const result=new Uint8Array(w*h);
  x=Math.floor(x);y=Math.floor(y);if(x<0||x>=w||y<0||y>=h)return result;
  const src=data.data,index=y*w+x,base=index*4,target=[src[base],src[base+1],src[base+2],src[base+3]];
  const limit=clamp(tolerance,0,100);
  if(!contiguous){for(let i=0;i<w*h;i++)if(same(src,i,target,limit))result[i]=255;return result;}
  const checked=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=1;queue[0]=index;checked[index]=1;
  while(head<tail){const at=queue[head++];if(!same(src,at,target,limit))continue;
    result[at]=255;const px=at%w,py=Math.floor(at/w);
    const add=(next:number)=>{if(!checked[next]){checked[next]=1;queue[tail++]=next;}};
    if(px>0)add(at-1);if(px<w-1)add(at+1);if(py>0)add(at-w);if(py<h-1)add(at+w);
  }return result;
}
export function rasterPolygon(width:number,height:number,points:readonly Point[]):Uint8Array{
  const mask=new Uint8Array(width*height);if(points.length<3)return mask;
  let minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y)))),maxY=Math.min(height-1,Math.ceil(Math.max(...points.map(p=>p.y))));
  for(let y=minY;y<=maxY;y++){
    const hits:number[]=[];for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],level=y+.5;
      if((a.y<=level&&b.y>level)||(b.y<=level&&a.y>level))hits.push(a.x+(level-a.y)*(b.x-a.x)/(b.y-a.y));
    }hits.sort((a,b)=>a-b);
    for(let j=0;j+1<hits.length;j+=2){const start=Math.max(0,Math.ceil(hits[j]-.5)),end=Math.min(width,Math.ceil(hits[j+1]-.5));for(let x=start;x<end;x++)mask[y*width+x]=255;}
  }return mask;
}
/** Sobel gradient map used by magnetic tracing. Sampling is local, bounded. */
export function edgeStrength(data:ImageData,x:number,y:number):number{
  const {width:w,height:h}=data;const src=data.data;
  const lum=(dx:number,dy:number)=>{const px=clamp(Math.round(x+dx),0,w-1),py=clamp(Math.round(y+dy),0,h-1),i=(py*w+px)*4;
    return .2126*src[i]+.7152*src[i+1]+.0722*src[i+2];};
  const gx=-lum(-1,-1)-2*lum(-1,0)-lum(-1,1)+lum(1,-1)+2*lum(1,0)+lum(1,1);
  const gy=-lum(-1,-1)-2*lum(0,-1)-lum(1,-1)+lum(-1,1)+2*lum(0,1)+lum(1,1);
  return Math.hypot(gx,gy);
}
/** Seek nearby image boundaries while tracing a magnetic-lasso gesture. */
export function magneticPoint(data:ImageData,point:Point,radius=8):Point{
  const {width,height}=data;let best={x:clamp(Math.round(point.x),0,width-1),y:clamp(Math.round(point.y),0,height-1)},score=-Infinity;
  const r=Math.max(1,Math.min(16,Math.round(radius)));
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    const x=Math.round(point.x)+dx,y=Math.round(point.y)+dy;if(x<1||y<1||x>=width-1||y>=height-1)continue;
    const distance=Math.hypot(dx,dy);if(distance>r)continue;
    const candidate=edgeStrength(data,x,y)-distance*11;
    if(candidate>score){score=candidate;best={x,y};}
  }return best;
}
export function fillRegion(data:ImageData,mask:Uint8Array,hex:string,opacity=1):void{
  const rgb=/^#[\da-f]{6}$/i.test(hex)?[1,3,5].map(p=>parseInt(hex.slice(p,p+2),16)):[0,0,0];
  const strength=clamp(opacity,0,1);
  for(let i=0;i<mask.length;i++)if(mask[i]){
    const alpha=mask[i]/255*strength,o=i*4;
    for(let channel=0;channel<3;channel++)data.data[o+channel]=Math.round(data.data[o+channel]*(1-alpha)+rgb[channel]*alpha);
    data.data[o+3]=Math.round(data.data[o+3]+(255-data.data[o+3])*alpha);
  }
}
/** Every retouch mode changes its source pixels by a different operation.
 * The painting loop works within a small local patch; not the full canvas. */
export function retouchStamp(ctx:CanvasRenderingContext2D,tool:RetouchTool,point:Point,previous:Point,
  radius:number,strength:number,color:string,phase=0):void{
  radius=Math.max(1,Math.min(1000,radius));strength=clamp(strength,0,1);
  const size=Math.ceil(radius*2+8),x0=Math.max(0,Math.floor(point.x-radius-3)),y0=Math.max(0,Math.floor(point.y-radius-3));
  const w=Math.min(size,ctx.canvas.width-x0),h=Math.min(size,ctx.canvas.height-y0);
  if(w<=0||h<=0)return;
  if(tool==='patternBrush'){
    const rgb=/^#[\da-f]{6}$/i.test(color)?color:'#7c73e8';ctx.save();ctx.globalAlpha=Math.max(.05,strength);
    ctx.fillStyle=rgb;ctx.translate(point.x,point.y);ctx.rotate(phase*.41);
    const sides=6,tip=radius*.72;ctx.beginPath();for(let j=0;j<sides;j++){const angle=j*Math.PI*2/sides;
      const magnitude=j%2?tip*.45:tip;const dx=Math.cos(angle)*magnitude,dy=Math.sin(angle)*magnitude;
      if(j===0)ctx.moveTo(dx,dy);else ctx.lineTo(dx,dy);}ctx.closePath();ctx.fill();ctx.restore();return;
  }
  const pixels=ctx.getImageData(x0,y0,w,h),original=new Uint8ClampedArray(pixels.data);
  const read=(x:number,y:number,c:number)=>original[(clamp(y,0,h-1)*w+clamp(x,0,w-1))*4+c];
  const ddx=point.x-previous.x,ddy=point.y-previous.y;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const distance=Math.hypot(x+x0-point.x,y+y0-point.y);if(distance>radius)continue;
    const alpha=(1-distance/radius)**1.4*strength,offset=(y*w+x)*4;
    for(let c=0;c<3;c++){
      const old=original[offset+c];let target=old;
      if(tool==='dodge')target=old+(255-old)*.38;
      else if(tool==='burn')target=old*.65;
      else if(tool==='smudge')target=read(Math.round(x-ddx),Math.round(y-ddy),c);
      else {
        let average=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)average+=read(x+dx,y+dy,c);average/=9;
        target=tool==='blurBrush'?average:clamp(old+(old-average)*2);
      }
      pixels.data[offset+c]=clamp(Math.round(old+(target-old)*alpha));
    }
  }ctx.putImageData(pixels,x0,y0);
}
