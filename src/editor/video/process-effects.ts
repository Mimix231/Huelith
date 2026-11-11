import type { Effect } from '../types';
import { applyVideoFrameEffect } from './frame-effects';
import { VIDEO_EFFECT_LOOKUP,VIDEO_TEMPORAL_KINDS,VIDEO_TIME_VARYING_KINDS } from './effects/catalog';
import { renderVideoColorGrade } from './effects/color-grade';
import { renderTemporalEcho } from './effects/temporal-echo';
import { renderMotionTrail } from './effects/motion-trail';
import {renderRollingShutter} from './effects/video-rolling-shutter';
import {renderFocusRack} from './effects/focus-rack';
import {renderFilmGateWeave} from './effects/film-gate-weave';
import {renderWhipPanSmear} from './effects/whip-pan-smear';
import {renderDeflicker} from './effects/deflicker';
import { evaluateVideoEffect, type VideoEffect, type VideoFrameContext } from './effects/types';
import {videoFrameIdentity,cachedVideoPrefix,rememberVideoPrefix,identifyProcessedVideoFrame} from './frame-cache';
import {renderVideoFilter} from './filters/render';
import {applyVideoGrade} from './color-tools';
import {sourceTimeAt} from './clip-timing';
import {compositeThroughMask} from './clip-layout';

function atResolution(effect:VideoEffect,width:number,referenceWidth:number|undefined):VideoEffect{
  const reference=effect.referenceWidth??referenceWidth;
  if(!reference||reference===width)return effect;
  const scale=width/reference,descriptor=VIDEO_EFFECT_LOOKUP.get(effect.kind);
  if(!descriptor)return effect;
  if(effect.kind==='shadow'){
    const p=effect.parameters;
    return {...effect,parameters:{...p,
      offsetX:(p?.offsetX??10)*scale,offsetY:(p?.offsetY??10)*scale,blur:(p?.blur??20)*scale,
      shadows:p?.shadows?.map(layer=>({...layer,offsetX:layer.offsetX*scale,offsetY:layer.offsetY*scale,
        radius:layer.radius*scale,spread:layer.spread*scale})),
    }};
  }
  const pixelControls=descriptor.controls.filter(control=>control.unit==='px');
  if(descriptor.unit!=='px'&&!pixelControls.length)return effect;
  const parameters={...effect.parameters} as Record<string,unknown>;
  for(const control of pixelControls){
    const value=parameters[control.key];
    if(typeof value==='number')parameters[control.key]=value*scale;
  }
  return {...effect,amount:descriptor.unit==='px'?effect.amount*scale:effect.amount,parameters};
}

/** The same ordered stack is used for playback, seeking and encoded frames. */
export async function processVideoEffects(source: HTMLCanvasElement, effects: readonly VideoEffect[], context: VideoFrameContext): Promise<HTMLCanvasElement> {
  let output=source;
  for(let index=0;index<effects.length;index++){
    context.signal?.throwIfAborted();
    const effect=atResolution(evaluateVideoEffect(effects[index],context.timestamp),source.width,context.referenceWidth);
    if(!effect.enabled)continue;
    if(!VIDEO_EFFECT_LOOKUP.has(effect.kind)&&effect.kind!=='video-filter')throw Error(`Video effect is unavailable: ${effect.kind}`);
    const temporal=VIDEO_TEMPORAL_KINDS.has(effect.kind);
    const input=output;
    const identity=videoFrameIdentity(output),animated=VIDEO_TIME_VARYING_KINDS.has(effect.kind)||!!effect.mask?.keys;
    const temporalKey=temporal&&context.historyKey?`${context.historyKey}:${context.timestamp}:${context.sourceTime}:${JSON.stringify(effects.slice(0,index))}`:null;
    const operationKey=identity&&(!temporal||temporalKey)?`operation:${identity}:${temporalKey??(animated?`${context.sourceTime}:${context.timestamp}`:'')}:${JSON.stringify(effect)}`:null;
    const cachedOperation=operationKey?cachedVideoPrefix(operationKey):undefined;
    if(cachedOperation){output=cachedOperation;continue;}
    if(effect.kind==='video-filter')output=renderVideoFilter(output,effect.parameters?.lookId??'',effect.amount);
    else if(effect.kind==='video-color-grade')output=renderVideoColorGrade(output,effect);
    else if(effect.kind==='video-rolling-shutter')output=renderRollingShutter(output,effect,context);
    else if(effect.kind==='video-focus-rack')output=renderFocusRack(output,effect,context);
    else if(effect.kind==='video-film-gate-weave')output=renderFilmGateWeave(output,effect,context);
    else if(effect.kind==='video-whip-pan-smear')output=renderWhipPanSmear(output,effect,context);
    else if(temporal){
      // Evaluate preceding spatial effects on historical source frames. Temporal
      // results are not recursively fed back, so memory is bounded on long clips.
      const history=context.previousFrame;
      const temporalContext={...context,previousFrame:history?async(age:number)=>{
        const frame=await history(age);if(!frame)return null;
        const preceding=effects.slice(0,index).filter(e=>!VIDEO_TEMPORAL_KINDS.has(e.kind));
        const clock=Math.max(0,context.timestamp-age),sourceTime=context.timing?sourceTimeAt(context.timing,clock):Math.max(0,context.sourceTime-age),identity=videoFrameIdentity(frame);
        const timeDependent=preceding.some(e=>VIDEO_TIME_VARYING_KINDS.has(e.kind)||e.mask?.keys);
        const key=identity?`${identity}:${timeDependent?Math.floor(sourceTime*context.fps):''}:${JSON.stringify(preceding.map(e=>evaluateVideoEffect(e,clock)))}`:null;
        const cached=key?cachedVideoPrefix(key):undefined;if(cached)return cached;
        const result=await processVideoEffects(frame,preceding,
          {...context,timestamp:clock,sourceTime,frameIndex:Math.floor(sourceTime*context.fps),previousFrame:undefined,grade:undefined});
        if(key)rememberVideoPrefix(key,result);return result;
      }:undefined};
      const render=effect.kind==='video-temporal-echo'?renderTemporalEcho:effect.kind==='video-deflicker'?renderDeflicker:renderMotionTrail;
      output=await render(output,effect,temporalContext);
    }else{
      const tick=Math.floor(context.sourceTime*context.fps);
      const animated=['grain','noise','vhs','glitch'].includes(effect.kind);
      const settings=animated?{...effect,parameters:{...effect.parameters,seed:(effect.parameters?.seed??17)+tick*131}}:effect;
      output=applyVideoFrameEffect(output,settings as Effect);
    }
    if(effect.mask&&output!==input)output=compositeThroughMask(input,output,effect.mask,context.timestamp);
    if(operationKey){identifyProcessedVideoFrame(output);rememberVideoPrefix(operationKey,output);}
  }
  return applyVideoGrade(output,context.grade,context.timestamp,context.frameIndex);
}
