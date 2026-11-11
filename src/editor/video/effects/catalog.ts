import { FILTER_CATALOG, LEGACY_CUTOUT, effectAmountLabel } from '../../effect-catalog';
import { defaultParameters, EFFECT_PARAMETER_SCHEMA, type ScalarControl } from '../../effect-schema';
import type { EffectKind } from '../../types';
import type { VideoEffect } from './types';
import {VIDEO_FILTER_LOOKUP} from '../filters';

export type VideoEffectDescriptor = {
  kind: VideoEffect['kind']; label: string; group: string; initial: number;
  min: number; max: number; step: number; unit: string; temporal?: boolean;
  controls: readonly ScalarControl[];
  amountLabel?:string;
};
const control = (key: string, label: string, min: number, max: number, initial: number, unit = '', step = 1): ScalarControl =>
  ({key,label,min,max,initial,unit,step});
const native: VideoEffectDescriptor[] = [
  {kind:'video-color-grade',label:'Video Color Grade',group:'Video & Temporal',initial:65,min:0,max:100,step:1,unit:'%',controls:[
    control('lift','Lift',-100,100,0,'%'),control('gamma','Gamma',20,300,100,'%'),control('gain','Gain',0,300,100,'%'),
    control('temperature','Temperature',-100,100,0,'%'),control('saturation','Saturation',0,200,100,'%')]},
  {kind:'video-temporal-echo',label:'Temporal Echo',group:'Video & Temporal',initial:50,min:0,max:100,step:1,unit:'%',temporal:true,controls:[
    control('history','History',.04,2,.24,'s',.01),control('samples','Echoes',1,8,4),control('decay','Decay',0,95,65,'%')]},
  {kind:'video-motion-trail',label:'Motion Trail',group:'Video & Temporal',initial:50,min:0,max:100,step:1,unit:'%',temporal:true,controls:[
    control('history','Trail length',.04,2,.16,'s',.01),control('samples','Samples',1,8,4),control('decay','Fade',0,95,70,'%'),
    control('threshold','Motion threshold',0,100,12,'%')]},
  {kind:'video-rolling-shutter',label:'Rolling Shutter',group:'Video & Temporal',initial:74,min:0,max:100,step:1,unit:'%',
    controls:[control('frequency','Wobble speed',.1,5,1.6,'Hz',.1)]},
  {kind:'video-focus-rack',label:'Focus Rack',group:'Video & Temporal',initial:83,min:0,max:100,step:1,unit:'%',
    controls:[control('radius','Defocus',1,60,27,'px'),control('frequency','Rack speed',.05,2,.45,'Hz',.05),control('centerY','Focal height',12,88,48,'%')]},
  {kind:'video-film-gate-weave',label:'Film Gate Weave',group:'Video & Temporal',initial:84,min:0,max:100,step:1,unit:'%',
    controls:[control('seed','Seed',0,9999,13)]},
  {kind:'video-whip-pan-smear',label:'Whip-pan Smear',group:'Video & Temporal',initial:88,min:0,max:100,step:1,unit:'%',
    controls:[control('radius','Exposure reach',1,180,124,'px'),control('angle','Direction',-180,180,-12,'°')]},
  {kind:'video-deflicker',label:'Deflicker',group:'Video & Temporal',initial:87,min:0,max:100,step:1,unit:'%',temporal:true,
    controls:[control('history','Sample interval',.03,.4,.15,'s',.01)]},
];
export const VIDEO_EFFECT_CATALOG: readonly VideoEffectDescriptor[] = [
  ...native,
  ...FILTER_CATALOG.map(item=>{
    const controls=EFFECT_PARAMETER_SCHEMA[item.kind as EffectKind]??[];
    return {...item,
      unit:item.kind==='shadow'?'%':item.unit,
      amountLabel:item.kind==='shadow'?'Shadow strength':effectAmountLabel(item.kind,item.label),
      controls:item.kind==='atelier_4_7'?[...controls,control('angle','Eye tilt',-180,180,0,'°')]
        :item.kind==='inkwash'?[...controls,control('colorMix','Color wash and paper edges',0,100,0,'%')]
        :item.kind==='sig_3'?[...controls,control('colorMix','Bloom tint',0,100,0,'%')]:controls,
    };
  }),
];
export const VIDEO_EFFECT_LOOKUP = new Map(VIDEO_EFFECT_CATALOG.map(e => [e.kind,e]));
VIDEO_EFFECT_LOOKUP.set('cutout',{...LEGACY_CUTOUT,controls:EFFECT_PARAMETER_SCHEMA.cutout??[]});
export function createVideoEffect(kind: VideoEffect['kind']): VideoEffect {
  if(kind==='cutout')throw Error('Use Footage tools to remove a video background.');
  const descriptor = VIDEO_EFFECT_LOOKUP.get(kind);
  if (!descriptor) throw Error(`Unknown video effect: ${kind}`);
  const isNative = native.some(e=>e.kind===kind);
  return {version:1,id:crypto.randomUUID(),kind,enabled:true,amount:descriptor.initial,color:'#b579ff',
    parameters:isNative ? Object.fromEntries(descriptor.controls.map(c=>[c.key,c.initial])) : defaultParameters(kind as EffectKind)};
}
export const VIDEO_TEMPORAL_KINDS = new Set<VideoEffect['kind']>(['video-temporal-echo','video-motion-trail','video-deflicker']);
export const VIDEO_TIME_VARYING_KINDS=new Set<VideoEffect['kind']>(['grain','noise','vhs','glitch','video-rolling-shutter',
  'video-focus-rack','video-film-gate-weave','video-whip-pan-smear']);
export function createFilterEffect(id:string):VideoEffect{
  if(!VIDEO_FILTER_LOOKUP.has(id))throw Error(`Unknown video filter: ${id}`);
  return {version:1,id:crypto.randomUUID(),kind:'video-filter',enabled:true,amount:100,parameters:{lookId:id}};
}
