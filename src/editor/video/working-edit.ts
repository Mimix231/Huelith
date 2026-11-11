import {sourceBounds, sourceTimeAt} from './clip-timing';
import {editableClips, linkedSelection, splitLinkedClips} from './timeline-edits';
import {addMediaClip, defaultTimeline, durationOf, MAX_TIMELINE, type VideoAsset, type VideoClip, type VideoTimeline} from './timeline';
import {mapAnimation} from './clip-animation';
import {rebaseMask} from './clip-layout';
import {gradeFromOffset} from './color-tools';
import type {ParameterKey} from './parameter-keys';

export type TimeSpan = {start:number;end:number};
export type StarterLayout = 'footage'|'gameplay'|'amv'|'short';
export const clipEnd = (clip:VideoClip) => clip.start+clip.duration;
const EPSILON=1e-6;

export function makeFirstCut(timeline:VideoTimeline, asset:VideoAsset, layout:StarterLayout, fallbackFps:number) {
  if(timeline.clips.length)throw Error('Start from footage is available on an empty timeline.');
  const portrait=layout==='short';
  const sourceWidth=asset.width??1920,sourceHeight=asset.height??1080;
  const ratio=Math.min(1,3840/sourceWidth,2160/sourceHeight);
  const width=portrait?1080:Math.max(16,Math.floor(sourceWidth*ratio/2)*2);
  const height=portrait?1920:Math.max(16,Math.floor(sourceHeight*ratio/2)*2);
  const fps=Math.max(1,Math.min(120,Math.round(asset.frameRate??fallbackFps)));
  const defaultTracks=defaultTimeline().tracks.map(track=>({...track,
    name:layout==='gameplay'?(track.id==='video2'?'Facecam':track.id==='video1'?'Gameplay':track.id==='audio1'?'Game audio':track.name):
      layout==='amv'&&track.kind==='audio'?'Soundtrack':track.name,
  }));
  if(layout==='gameplay'||portrait)defaultTracks.push({id:crypto.randomUUID(),kind:'audio',name:'Voiceover',muted:false,locked:false,purpose:'dialogue'});
  const source={...asset,sourceRange:undefined};
  const result=addMediaClip({...timeline,tracks:layout==='footage'?timeline.tracks:defaultTracks},source,
    source.kind==='audio'?'audio1':'video1',0);
  return {...result,width,height,fps};
}

export function loopSpan(timeline:VideoTimeline,selected:readonly string[],range:TimeSpan|undefined,fps:number):TimeSpan|undefined{
  const total=durationOf(timeline),chosen=timeline.clips.filter(clip=>selected.includes(clip.id));
  const start=Math.max(0,range?.start??(chosen.length?Math.min(...chosen.map(clip=>clip.start)):0));
  const end=Math.min(total,range?.end??(chosen.length?Math.max(...chosen.map(clipEnd)):total));
  return end-start>=1/fps-EPSILON?{start,end}:undefined;
}

export function gapAt(timeline:VideoTimeline,trackId:string,time:number):TimeSpan|undefined{
  const clips=timeline.clips.filter(clip=>clip.trackId===trackId);
  if(clips.some(clip=>clip.start<=time&&clipEnd(clip)>time))return;
  const start=Math.max(0,...clips.filter(clip=>clipEnd(clip)<=time).map(clipEnd));
  const end=Math.min(Infinity,...clips.filter(clip=>clip.start>time).map(clip=>clip.start));
  return Number.isFinite(end)&&end-start>EPSILON?{start,end}:undefined;
}

export function closeGap(timeline:VideoTimeline,trackId:string,time:number):VideoTimeline {
  const gap=gapAt(timeline,trackId,time);
  if(!gap)throw Error('Choose an empty space before a clip.');
  const tracks=new Set(timeline.tracks.filter(track=>track.id===trackId||track.syncLock).map(track=>track.id));
  const ids=new Set(timeline.clips.filter(clip=>tracks.has(clip.trackId)&&clip.start>=gap.end-EPSILON).map(clip=>clip.id));
  for(const id of linkedSelection(timeline,[...ids]))ids.add(id);
  if(editableClips(timeline,[...ids]).length!==ids.size)throw Error('Unlock linked tracks before closing this gap.');
  if(timeline.clips.some(clip=>tracks.has(clip.trackId)&&!ids.has(clip.id)&&clip.start<gap.end&&clipEnd(clip)>gap.start+EPSILON))
    throw Error('A sync-locked clip crosses this gap.');
  const amount=gap.end-gap.start;
  const shifted=timeline.clips.map(clip=>ids.has(clip.id)?{...clip,start:clip.start-amount}:clip);
  if(shifted.some(clip=>clip.start<0||ids.has(clip.id)&&shifted.some(other=>!ids.has(other.id)&&other.trackId===clip.trackId&&
    other.start<clipEnd(clip)-EPSILON&&clipEnd(other)>clip.start+EPSILON)))throw Error('Closing this gap would collide with a linked clip.');
  return {...timeline,clips:shifted};
}

/** Split only the touched unlocked, linked items and keep the in/out cuts as one edit. */
export function cutRange(timeline:VideoTimeline,ids:readonly string[],span:TimeSpan,fps:number) {
  const expanded=linkedSelection(timeline,ids);
  const crossing=timeline.clips.filter(clip=>expanded.includes(clip.id)&&clip.start<span.end&&clipEnd(clip)>span.start);
  const original=new Set(crossing.map(clip=>clip.id));
  if(editableClips(timeline,expanded).length!==expanded.length)throw Error('Unlock the selected tracks before editing a range.');
  const step=1/fps;
  for(const clip of crossing)for(const point of [span.start,span.end]){
    const left=point-clip.start,right=clipEnd(clip)-point;
    if(left>EPSILON&&right>EPSILON&&(left<step-EPSILON||right<step-EPSILON))throw Error('Move the range edge at least one frame from the cut.');
  }
  const first=splitLinkedClips(timeline,[...original],span.start,step);
  const added=new Set(first.ids);
  const inside=first.timeline.clips.filter(clip=>(original.has(clip.id)||added.has(clip.id))&&clip.start>=span.start-EPSILON&&clip.start<span.end-EPSILON);
  const second=splitLinkedClips(first.timeline,inside.map(clip=>clip.id),span.end,step);
  const wanted=new Set(inside.map(clip=>clip.id));
  return {timeline:second.timeline,clips:second.timeline.clips.filter(clip=>wanted.has(clip.id))};
}

export const ATTRIBUTE_OPTIONS=[
  ['effects','Effects and filter'],['grade','Color grade'],['framing','Framing and mask'],['motion','Motion and opacity'],['audio','Audio levels'],
] as const;
export type ClipAttribute=typeof ATTRIBUTE_OPTIONS[number][0];

export function pasteAttributes(timeline:VideoTimeline,source:VideoClip,ids:string[],groups:ClipAttribute[]):VideoTimeline {
  const unlocked=new Set(editableClips(timeline,ids).map(clip=>clip.id));
  return {...timeline,clips:timeline.clips.map(target=>{
    if(!unlocked.has(target.id)||target.id===source.id)return target;
    const track=timeline.tracks.find(item=>item.id===target.trackId);
    const next={...target};
    const stretch=target.duration/source.duration;
    const keyTime=(time:number)=>Math.min(target.duration,time*stretch);
    const copyKeys=<K extends ParameterKey>(keys:readonly K[]|undefined)=>
      keys?.filter(key=>key.time<=source.duration).map(key=>({...key,time:keyTime(key.time)}));
    for(const group of groups){
      if(group==='audio'){
        if(track?.kind==='title')continue;
        Object.assign(next,{volume:source.volume,volumeKeys:copyKeys(source.volumeKeys),pan:source.pan,panKeys:copyKeys(source.panKeys),
          fadeIn:keyTime(source.fadeIn),fadeOut:keyTime(source.fadeOut),
          audioFadeIn:source.audioFadeIn===undefined?undefined:keyTime(source.audioFadeIn),
          audioFadeOut:source.audioFadeOut===undefined?undefined:keyTime(source.audioFadeOut),
          channelMode:source.channelMode,voice:source.voice&&{...source.voice,keys:copyKeys(source.voice.keys)},ducking:source.ducking});
      }else if(track?.kind!=='audio'){
        if(group==='effects')next.effects=source.effects?.map(effect=>({...effect,id:crypto.randomUUID(),
          keyframes:copyKeys(effect.keyframes),mask:rebaseMask(effect.mask,0,stretch)}));
        if(group==='grade')next.grade=gradeFromOffset(source.grade,0,stretch);
        if(group==='framing')Object.assign(next,{crop:source.crop,mask:rebaseMask(source.mask,0,stretch),chromaKey:source.chromaKey,fit:source.fit,flipX:source.flipX,flipY:source.flipY});
        if(group==='motion')Object.assign(next,{x:source.x,y:source.y,scale:source.scale,scaleY:source.scaleY,rotation:source.rotation,
          opacity:source.opacity,animation:mapAnimation(source.animation,0,stretch),keyframes:copyKeys(source.keyframes)});
      }
    }
    return next;
  })};
}

export function replacementPatch(clip:VideoClip,asset:VideoAsset):{patch:Partial<VideoClip>;rate?:number} {
  const patch:Partial<VideoClip>={assetId:asset.id,smart:undefined};
  if(asset.kind==='image'&&!asset.animated)return {patch:{...patch,sourceIn:0,sourceMap:undefined,speedCurve:undefined,holdFrame:undefined}};
  const [lo,hi]=sourceBounds(clip);
  if(hi<=asset.duration+EPSILON)return {patch};
  const backwards=sourceTimeAt(clip,clip.duration)<sourceTimeAt(clip,0);
  const duration=Math.min(asset.duration,Math.max(EPSILON,hi-lo));
  const rate=duration/clip.duration;
  if(rate<.0625||rate>16)throw Error('This source cannot cover the cut at a supported speed.');
  const sourceIn=backwards?duration:0;
  return {rate,patch:{...patch,sourceIn,sourceMap:[{time:0,source:sourceIn},{time:clip.duration,source:backwards?0:duration}],
    speedCurve:undefined,holdFrame:undefined}};
}

export function fitSoundtrack(clip:VideoClip,asset:VideoAsset,span:TimeSpan,beats:readonly number[],fps:number):VideoClip[]{
  if(asset.kind!=='audio'||span.start<0||span.end>MAX_TIMELINE||span.end-span.start<1/fps)throw Error('Choose an audio clip and a valid destination range.');
  const [lo,hi]=sourceBounds(clip);
  const within=beats.filter(time=>time>=lo-EPSILON&&time<=hi+EPSILON).sort((a,b)=>a-b);
  const sourceIn=within.length>=2?within[0]:lo;
  const end=within.length>=2?within[within.length-1]:Math.min(asset.duration,hi);
  const section=end-sourceIn;
  if(section<1/fps||Math.ceil((span.end-span.start)/section)>128)throw Error('Choose a longer music section or a shorter destination range.');
  const total=span.end-span.start;
  const lengths=Array.from({length:Math.ceil((total-EPSILON)/section)},(_,i)=>Math.min(section,total-i*section));
  const tail=lengths.at(-1)!;
  const frame=1/fps;
  if(tail<frame-EPSILON){
    const previous=lengths.length-2;
    if(sourceIn+section+tail<=Math.min(asset.duration,hi)+EPSILON){
      lengths[previous]+=tail;
      lengths.pop();
    }else if(lengths[previous]-(frame-tail)>=frame-EPSILON){
      lengths[previous]-=frame-tail;
      lengths[previous+1]=frame;
    }else{
      throw Error('Choose a longer section to fit this range without a gap.');
    }
  }
  let start=span.start;
  return lengths.map(duration=>{
    const edge=Math.min(.045,duration/4);
    const part={...clip,id:crypto.randomUUID(),start,duration,sourceIn,fadeIn:edge,fadeOut:edge,volumeKeys:undefined,
      sourceMap:undefined,speedCurve:undefined,holdFrame:undefined,linkId:undefined,transitionIn:undefined};
    start+=duration;
    return part;
  });
}
