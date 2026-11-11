import {clamp,type EffectFactory} from './common';
import {colorKernel,toLinear,fromLinear} from './color-science-common';
/** Inverts optical density per channel and compensates an orange-base film
 * mask. Very bright positive regions become dense dark negatives. */
export const filmNegative:EffectFactory=input=>{
 const compensation=clamp((input.parameters.colorMix??50)/100);
 const inv=(v:number,gain:number)=>fromLinear(clamp(Math.pow(1-toLinear(v),.72)*gain));
 const red=Uint8Array.from({length:256},(_,i)=>inv(i,1-.27*compensation));
 const green=Uint8Array.from({length:256},(_,i)=>inv(i,1-.09*compensation));
 const blue=Uint8Array.from({length:256},(_,i)=>inv(i,1+.11*compensation));
 return colorKernel(input,(r,g,b)=>[red[r],green[g],blue[b]]);
};
