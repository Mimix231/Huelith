import {clamp,type EffectFactory} from './common';
import {lights,emit} from './lighting-common';
/** Sparse diffraction crosses around local highlight peaks, not random noise. */
export const specularGlints:EffectFactory=({source,width:w,height:h,amount,parameters:p})=>{
  const field=lights(source,w,h,p.threshold??175);
  const radius=Math.max(3,Math.min(55,Math.round(3+Math.min(w,h)*.018*(p.frequency??50)/50)));
  // Non-maximum suppression prevents an entirely bright region from spawning
  // thousands of identical glints and turning into white fog.
  const emitters:Array<[number,number,number]>=[];const cell=Math.max(5,radius*2);
  for(let cy=0;cy<h;cy+=cell)for(let cx=0;cx<w;cx+=cell){
    let best=0,bx=0,by=0;
    for(let y=cy;y<Math.min(h,cy+cell);y++)for(let x=cx;x<Math.min(w,cx+cell);x++){
      const v=field[y*w+x];if(v>best){best=v;bx=x;by=y;}
    }
    if(best>.4)emitters.push([bx,by,best]);
  }
  const density=Math.max(1,Math.round(1+clamp((p.colorMix??50)/100)*3));
  const light=new Float32Array(w*h);
  for(const [x,y,strength] of emitters){
    for(let d=-radius;d<=radius;d++){
      const a=Math.exp(-Math.abs(d)/(radius*.32));
      for(let offset=-density;offset<=density;offset++){
        const yy=y+offset,xx=x+d;
        if(xx>=0&&xx<w&&yy>=0&&yy<h)light[yy*w+xx]+=strength*a*(1-Math.abs(offset)/(density+1));
        const vx=x+offset,vy=y+d;
        if(vx>=0&&vx<w&&vy>=0&&vy<h)light[vy*w+vx]+=strength*a*(1-Math.abs(offset)/(density+1));
      }
    }
  }
  return {renderRows(y0,y1,out){for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;emit(source,out,i,clamp(light[y*w+x]*amount*.8),235,235,205);
  }}};
};
