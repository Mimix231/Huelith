import {crossDissolve} from './effects/cross-dissolve';
import {slideTransition} from './effects/slide';
import {wipeTransition} from './effects/wipe';
import type {VideoEffect,VideoFrameContext,VideoTransition} from './effects/types';
import {processVideoEffects} from './process-effects';
import {transitionStack} from './transitions';
import {AUTHORED_TRANSITION_LOOKUP} from './transition-recipes';
import {renderAuthoredTransition} from './render-authored-transition';

export function renderVideoTransition(
  from:HTMLCanvasElement,to:HTMLCanvasElement,progress:number,transition:VideoTransition,context:VideoFrameContext,
  process:(source:HTMLCanvasElement,effects:readonly VideoEffect[],context:VideoFrameContext)=>Promise<HTMLCanvasElement>=processVideoEffects,
):HTMLCanvasElement|Promise<HTMLCanvasElement>{
  const recipe=transition.kind==='effect'?AUTHORED_TRANSITION_LOOKUP.get(transition.preset??''):undefined;
  if(recipe)return renderAuthoredTransition(from,to,progress,recipe,context,process);
  if(transition.kind==='wipe')return wipeTransition(from,to,progress,transition.direction);
  if(transition.kind==='slide')return slideTransition(from,to,progress,transition.direction);
  const blended=crossDissolve(from,to,progress);
  return transition.kind==='effect'&&progress>0&&progress<1
    ?process(blended,transitionStack(transition.preset??'',progress),context):blended;
}
