import {materialColor,microNormal} from './material-common';
import type {EffectFactory} from './common';
/** Glossy ceramic coat: broad color-preserving diffuse response under
 * narrow white clearcoat specular highlights. */
export const ceramicGlaze:EffectFactory=input=>{
 const {parameters:p}=input,rough=.045+.17*(p.frequency??50)/150;
 const height=(x:number,y:number)=>Math.sin(x*.037)*.35+Math.sin(y*.057)*.4;
 return materialColor(input,(x,y,r,g,b)=>{
  const n=microNormal(height,x,y,.7),spec=Math.exp(-(((n-.75)/rough)**2)*.5)*.24;
  return [r*.88+255*spec,g*.88+252*spec,b*.9+245*spec];
 },'ceramic-glaze');
};
