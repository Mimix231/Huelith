import {clamp,hash,type EffectFactory} from './common';
import {geometryKernel} from './geometry-common';
/** Seeded Voronoi crystal fragments with per-cell rigid translations and
 * rotations. Geometry is inversely mapped; colors/alpha aren't fabricated. */
export const crystalShatter:EffectFactory=input=>{
  const {width:w,height:h,parameters:p}=input;
  const size=Math.max(8,Math.min(w,h)*(.065+.17*(1-clamp((p.frequency??50)/150))));
  const cols=Math.ceil(w/size)+2,rows=Math.ceil(h/size)+2,seed=Math.round(p.seed??0);
  const pointsX=new Float32Array(cols*rows),pointsY=new Float32Array(cols*rows);
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const k=j*cols+i;
    pointsX[k]=(i-.5+.2+.6*hash(i,j,seed))*size;
    pointsY[k]=(j-.5+.2+.6*hash(i,j,seed+19))*size;
  }
  const drift=Math.min(w,h)*(.02+.06*clamp((p.colorMix??50)/100));
  return geometryKernel(input,(x,y)=>{
    const gx=Math.floor(x/size)+1,gy=Math.floor(y/size)+1;
    let nearest=-1,best=Infinity;
    for(let yy=Math.max(0,gy-2);yy<=Math.min(rows-1,gy+1);yy++)
      for(let xx=Math.max(0,gx-2);xx<=Math.min(cols-1,gx+1);xx++){
        const k=yy*cols+xx,dx=x-pointsX[k],dy=y-pointsY[k],d=dx*dx+dy*dy;
        if(d<best){best=d;nearest=k;}
      }
    if(nearest<0)return [x,y];
    const offsetX=(hash(nearest,seed,3)-.5)*drift;
    const offsetY=(hash(nearest,seed,7)-.5)*drift;
    const turn=(hash(nearest,seed,11)-.5)*.34;
    const cx=pointsX[nearest],cy=pointsY[nearest],dx=x-cx-offsetX,dy=y-cy-offsetY;
    return [cx+dx*Math.cos(turn)-dy*Math.sin(turn),
      cy+dx*Math.sin(turn)+dy*Math.cos(turn)];
  },'crystal-shatter');
};
