import {clamp,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Compresses and folds coordinates periodically across a chosen axis;
 * unlike Wave, it mirrors within alternating folded segments. */
export const sineFold:EffectFactory=input=>{
  const [cx,cy,rx,ry]=pivot(input),p=input.parameters;
  const theta=(p.angle??15)*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
  const repeats=1+Math.round(2+8*clamp((p.frequency??50)/150));
  const fold=(u:number)=>Math.asin(Math.sin(u*repeats*Math.PI))/(Math.PI*.5*repeats);
  return geometryKernel(input,(x,y)=>{
    const dx=(x-cx)/rx,dy=(y-cy)/ry;
    const u=dx*c+dy*s,v=-dx*s+dy*c;
    const nu=fold(u);
    return [cx+rx*(nu*c-v*s),cy+ry*(nu*s+v*c)];
  },'sine-fold');
};
