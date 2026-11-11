import {clamp,type EffectFactory} from './common';
import {geometryKernel,pivot} from './geometry-common';
/** Convex sheet-glass refraction: radial Snell-like displacement fades at
 * edge, while the center retains a mild transparent magnification. */
export const curvedGlass:EffectFactory=input=>{
  const [cx,cy,rx,ry]=pivot(input);
  const lens=.25+.65*clamp((input.parameters.frequency??50)/150);
  return geometryKernel(input,(x,y)=>{
    const dx=(x-cx)/rx,dy=(y-cy)/ry,r2=dx*dx+dy*dy;
    const radial=Math.max(0,1-r2);
    const displaced=1-lens*radial*.65;
    return [cx+dx*rx*displaced,cy+dy*ry*displaced];
  },'curved-glass');
};
