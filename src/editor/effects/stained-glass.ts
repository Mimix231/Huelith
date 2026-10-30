import {clamp,hash,luminance,mix,type EffectFactory} from './common';
/** Seeded 2D Voronoi tessellation with piecewise mean pane colors and dark
 * leading. Unlike a tint filter, adjacent panes have polygonal boundaries.
 * Source alpha is retained; transparent regions never turn into glass.
 */
export const stainedGlass:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const size=Math.max(3,Math.round(3+Math.min(w,h)*(.03+.2*(1-clamp((p.frequency??50)/150)))));
  const cols=Math.ceil(w/size)+2,rows=Math.ceil(h/size)+2;
  const seed=Math.round(p.seed??0),cells=cols*rows;
  const pointsX=new Float32Array(cells),pointsY=new Float32Array(cells),count=new Float64Array(cells);
  const red=new Float64Array(cells),green=new Float64Array(cells),blue=new Float64Array(cells);
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const k=gy*cols+gx;
    pointsX[k]=(gx-.5+hash(gx,gy,seed)*.65+.175)*size;
    pointsY[k]=(gy-.5+hash(gx,gy,seed+301)*.65+.175)*size;
  }
  function nearest(x:number,y:number):{first:number;firstDistance:number;secondDistance:number}{
    const gx=Math.floor(x/size)+1,gy=Math.floor(y/size)+1;
    let first=-1,nearestDistance=Infinity,nextDistance=Infinity;
    for(let yy=Math.max(0,gy-2);yy<=Math.min(rows-1,gy+1);yy++)
      for(let xx=Math.max(0,gx-2);xx<=Math.min(cols-1,gx+1);xx++){
        const k=yy*cols+xx,dx=x-pointsX[k],dy=y-pointsY[k],d=dx*dx+dy*dy;
        if(d<nearestDistance){nextDistance=nearestDistance;nearestDistance=d;first=k;}
        else if(d<nextDistance)nextDistance=d;
      }
    return {first,firstDistance:Math.sqrt(nearestDistance),secondDistance:Math.sqrt(nextDistance)};
  }
  // Partition and aggregate colors once per edit, not inside every output row.
  const cellForPixel=new Int32Array(w*h),edge=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const k=y*w+x,i=k*4;
    const pair=nearest(x,y);cellForPixel[k]=pair.first;
    edge[k]=pair.secondDistance-pair.firstDistance;
    const alpha=source[i+3]/255;if(alpha===0)continue;
    red[pair.first]+=source[i]*alpha;green[pair.first]+=source[i+1]*alpha;
    blue[pair.first]+=source[i+2]*alpha;count[pair.first]+=alpha;
  }
  const richness=clamp((p.colorMix??50)/100)*.5+.8;
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const k=y*w+x,i=k*4,a=source[i+3];
    if(!a){out.set(source.subarray(i,i+4),i);continue;}
    const cell=cellForPixel[k],n=count[cell]||1;
    const rr=red[cell]/n,gg=green[cell]/n,bb=blue[cell]/n;
    const gray=luminance(rr,gg,bb),border=clamp((size*.15-edge[k])/(size*.12));
    const r=mix(gray,rr,richness),g=mix(gray,gg,richness),b=mix(gray,bb,richness);
    const lead=.10+.14*hash(cell%cols,Math.floor(cell/cols),seed+937);
    const shade=(1-border*(1-lead));
    out[i]=mix(source[i],r*shade,amount);out[i+1]=mix(source[i+1],g*shade,amount);
    out[i+2]=mix(source[i+2],b*shade,amount);out[i+3]=a;
  }}};
};
