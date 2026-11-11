import {createVideoEffect} from './effects/catalog';
import type {VideoEffect} from './effects/types';
export const FEATURED_VIDEO_EFFECTS=['sig_11','video-motion-trail','chromatic','sig_3','inkwash','video-temporal-echo'] as const;
export const VIDEO_LIBRARY_EFFECT_NAMES:Partial<Record<VideoEffect['kind'],string>>={chromatic:'Chromatic Split',inkwash:'Paper Ink'};
/** Card settings are also applied on click, so the illustrated look is real. */
export const VIDEO_PREVIEW_ALPHA_KINDS=new Set(['outline','glow','shadow','backdrop','radiance','miasma','foil','chromaticsilk','sig_2','sig_6','sig_11']);
export const VIDEO_PREVIEW_BRIGHT_KINDS=new Set(['highlights','whites','atelier_0_2','atelier_0_7','atelier_0_9','atelier_1_10']);
export const VIDEO_EFFECT_DESIGN_WIDTH=960;
export function createLibraryVideoEffect(kind:VideoEffect['kind']):VideoEffect{
 const effect=createVideoEffect(kind);
 effect.referenceWidth=VIDEO_EFFECT_DESIGN_WIDTH;
 const amounts:Record<string,number>={brightness:125,contrast:145,saturate:155,hue:70,exposure:35,temperature:45,tint:35,
  whites:82,blacks:35,shadows:40,highlights:70,gamma:135,unsharp:92,denoise:84,chromatic:15,
  shadow:68,sig_2:83,sig_3:92,sig_7:88,sig_11:75,inkwash:96,atelier_0_2:88,atelier_0_7:88,atelier_0_9:84,atelier_1_10:100,atelier_4_7:95,
  'video-motion-trail':86,'video-temporal-echo':82};
 if(amounts[kind]!==undefined)effect.amount=amounts[kind];
 if(kind==='video-color-grade')effect.parameters={lift:4,gamma:92,gain:108,temperature:15,saturation:115};
 if(kind==='video-motion-trail')effect.parameters={...effect.parameters,history:.26,decay:82,threshold:7};
 if(kind==='video-temporal-echo')effect.parameters={...effect.parameters,history:.34,decay:78};
 if(kind==='unsharp')effect.parameters={...effect.parameters,radius:3.6,threshold:2};
 if(kind==='denoise')effect.parameters={...effect.parameters,radius:5,detail:78};
 if(kind==='atelier_0_7')effect.parameters={...effect.parameters,colorMix:32};
 if(kind==='atelier_0_9')effect.parameters={...effect.parameters,colorMix:65};
 if(kind==='atelier_0_12')effect.parameters={...effect.parameters,colorMix:83};
 if(kind==='shadow')effect.parameters={...effect.parameters,shadows:[
  {id:'night-drop',style:'drop',enabled:true,offsetX:34,offsetY:26,radius:20,spread:8,opacity:.87,color:'#7653bb'},
  {id:'night-inner',style:'inner',enabled:true,offsetX:-29,offsetY:21,radius:27,spread:0,opacity:.42,color:'#2c163f'},
 ]};
 if(kind==='sig_2')effect.color='#17112c';
 if(kind==='sig_3')effect.parameters={...effect.parameters,threshold:62,radius:40,opacity:90,colorMix:52};
 if(kind==='sig_6')effect.color='#a0ebff';
 if(kind==='sig_7')effect.color='#ff762d';
 if(kind==='sig_11'){
  effect.color='#b879ff';
  effect.parameters={...effect.parameters,opacity:60};
 }
 if(kind==='inkwash')effect.parameters={...effect.parameters,colorMix:85,paper:70};
 if(kind==='atelier_1_4')effect.parameters={...effect.parameters,threshold:64,centerX:91,centerY:15};
 if(kind==='atelier_1_10')effect.parameters={...effect.parameters,threshold:92,frequency:92};
 if(kind==='atelier_4_7')effect.parameters={...effect.parameters,centerX:59.5,centerY:24.4,frequency:104,angle:22};
 if(kind==='atelier_7_2')effect.parameters={...effect.parameters,threshold:122,frequency:68,colorMix:85};
 return effect;
}
