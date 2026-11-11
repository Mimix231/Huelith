import {materialColor,hash,clamp,luminance} from './material-common';
import type {EffectFactory} from './common';
/** Hard polygonal cuts reflect differently by facet orientation. Cell nearest
 * seed supplies distinct planes; no smooth noise/tint substitution. */
export const gemstoneFacets:EffectFactory=input=>{
 const {parameters:p}=input,seed=p.seed??0,size=9+Math.round((p.frequency??50)/3);
 return materialColor(input,(x,y,r,g,b)=>{
  const cx=Math.floor(x/size),cy=Math.floor(y/size);let near=1e12,id=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const bx=cx+dx,by=cy+dy,px=(bx+hash(bx,by,seed)) * size,py=(by+hash(bx,by,seed+1))*size;
   const d=(px-x)**2+(py-y)**2;if(d<near){near=d;id=hash(bx,by,seed+18);}
  }
  const facet=clamp(.18+.86*Math.pow(id,1.35)),l=luminance(r,g,b)/255;
  return [(l*.38+facet*.58)*145,(l*.38+facet*.58)*210,(l*.38+facet*.58)*255];
 },'gemstone-facets');
};
