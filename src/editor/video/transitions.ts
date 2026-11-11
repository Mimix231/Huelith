import type {VideoEffect,VideoTransition} from './effects/types';
import type {EffectKind} from '../types';
import {createVideoEffect} from './effects/catalog';
import {AUTHORED_TRANSITION_LOOKUP} from './transition-recipes';
export interface TransitionPreset {id:string;name:string;category:string;effects:Array<{kind:EffectKind;peak:number}>}
export const TRANSITION_PRESETS:readonly TransitionPreset[]=[
 {id:'light-flash',name:'Light flash',category:'Light',effects:[{kind:'exposure',peak:190},{kind:'glow',peak:22}]},
 {id:'dream-bloom',name:'Dream bloom',category:'Light',effects:[{kind:'sig_3',peak:90},{kind:'blur',peak:24}]},
 {id:'golden-flare',name:'Golden flare',category:'Light',effects:[{kind:'sig_9',peak:100},{kind:'exposure',peak:95}]},
 {id:'prism-flash',name:'Prism flash',category:'Light',effects:[{kind:'sig_8',peak:100},{kind:'exposure',peak:100}]},
 {id:'soft-defocus',name:'Soft defocus',category:'Blur',effects:[{kind:'blur',peak:40}]},
 {id:'racing-blur',name:'Racing blur',category:'Blur',effects:[{kind:'motionblur',peak:45}]},
 {id:'radial-rush',name:'Radial rush',category:'Blur',effects:[{kind:'radialblur',peak:45},{kind:'zoomblur',peak:38}]},
 {id:'lens-dream',name:'Lens dream',category:'Blur',effects:[{kind:'lensblur',peak:36},{kind:'sig_3',peak:55}]},
 {id:'swirl-through',name:'Swirl through',category:'Distort',effects:[{kind:'swirl',peak:80}]},
 {id:'water-ripple',name:'Water ripple',category:'Distort',effects:[{kind:'ripple',peak:85},{kind:'blur',peak:9}]},
 {id:'wave-crossing',name:'Wave crossing',category:'Distort',effects:[{kind:'wave',peak:90}]},
 {id:'glass-shift',name:'Glass shift',category:'Distort',effects:[{kind:'glass',peak:85},{kind:'chromatic',peak:60}]},
 {id:'vhs-cut',name:'VHS cut',category:'Digital',effects:[{kind:'vhs',peak:90}]},
 {id:'signal-break',name:'Signal break',category:'Digital',effects:[{kind:'glitch',peak:90},{kind:'chromatic',peak:65}]},
 {id:'matrix-cross',name:'Matrix crossing',category:'Digital',effects:[{kind:'sig_4',peak:95}]},
 {id:'pixel-resolve',name:'Pixel resolve',category:'Digital',effects:[{kind:'pixelate',peak:28}]},
 {id:'comic-cut',name:'Comic cut',category:'Art',effects:[{kind:'graphicnovel',peak:100}]},
 {id:'ink-passage',name:'Ink passage',category:'Art',effects:[{kind:'ink',peak:100},{kind:'contrast',peak:240}]},
 {id:'manga-flip',name:'Manga flip',category:'Art',effects:[{kind:'atelier_4_0',peak:100}]},
 {id:'watercolor-wash',name:'Watercolor wash',category:'Art',effects:[{kind:'watercolor',peak:100}]},
 {id:'neon-cross',name:'Neon crossing',category:'Color',effects:[{kind:'neonedge',peak:100},{kind:'sig_1',peak:80}]},
 {id:'hologram-pass',name:'Hologram pass',category:'Color',effects:[{kind:'sig_12',peak:100}]},
 {id:'sepia-memory',name:'Sepia memory',category:'Color',effects:[{kind:'sepia',peak:100},{kind:'blur',peak:10}]},
 {id:'negative-flash',name:'Negative flash',category:'Color',effects:[{kind:'invert',peak:100},{kind:'exposure',peak:80}]},
];
export const TRANSITION_LOOKUP=new Map(TRANSITION_PRESETS.map(t=>[t.id,t]));
export function transitionStack(presetId:string,progress:number):VideoEffect[]{
  const preset=TRANSITION_LOOKUP.get(presetId);if(!preset)throw Error(`Transition is unavailable: ${presetId}`);
  const envelope=Math.sin(Math.max(0,Math.min(1,progress))*Math.PI);
  return preset.effects.map((entry,index)=>{
    const effect=createVideoEffect(entry.kind);effect.id=`transition:${presetId}:${index}`;
    const neutral=entry.kind==='contrast'?100:entry.kind==='pixelate'?1:0;
    return {...effect,amount:neutral+(entry.peak-neutral)*envelope};
  });
}
export function createEffectTransition(id:string,duration=.5):VideoTransition{
  if(!TRANSITION_LOOKUP.has(id)&&!AUTHORED_TRANSITION_LOOKUP.has(id))throw Error('Unknown transition');
  return {version:1,kind:'effect',preset:id,duration,direction:'left'};
}
export const transitionName=(transition:VideoTransition)=>transition.kind==='effect'
  ?AUTHORED_TRANSITION_LOOKUP.get(transition.preset??'')?.name??TRANSITION_LOOKUP.get(transition.preset??'')?.name??'Effect transition'
  :transition.kind.replace('-',' ');

