import {painting,frac,clamp} from './paint-common';
import type {EffectFactory} from './common';
/** Carved linoleum/woodcut process: white grooves are incised into solid ink
 * according to tone, with directional irregular relief. */
export const woodcutEngraving:EffectFactory=input=>{
 const pitch=3+clamp((input.parameters.frequency??50)/150)*9;
 return painting(input,(x,y,_r,_g,_b,l)=>{
   const grain=Math.sin(y*.036+Math.sin(x*.021)*2)*pitch*.23;
   const line=frac((x+grain)/pitch),white=line<.14+l*.5;
   return white?[250,244,228]:[20,18,18];
 },'woodcut-engraving');
};
