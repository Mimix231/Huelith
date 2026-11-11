import type {VideoTransition} from './effects/types';
import type {VideoClip,VideoTimeline} from './timeline';
import {frameTime} from './timeline-grid';
import type {AuthoredTransition} from './transition-recipes';

export type TransitionPlacement='start'|'cut'|'middle'|'end';
export type TransitionDrop={placement:TransitionPlacement;at:number;start:number;end:number;duration:number};
export type TransitionSpan={from?:VideoClip;to?:VideoClip;start:number;end:number;transition:VideoTransition};

const endOf=(clip:VideoClip)=>clip.start+clip.duration;
const frames=(seconds:number,fps:number)=>Math.floor((seconds+1e-6)*fps);

export function transitionDrop(
  timeline:VideoTimeline,trackId:string,hitId:string|undefined,time:number,edgeWindow:number,fps:number,recipe?:AuthoredTransition,
):{clip:VideoClip;drop:TransitionDrop}|undefined{
  const clips=timeline.clips.filter(clip=>clip.trackId===trackId&&!clip.adjustment);
  const tolerance=Math.max(.5/fps,Math.min(.32,edgeWindow));
  const hit=clips.find(clip=>clip.id===hitId);
  if(recipe&&recipe.group!=='Combo'){
    const start=recipe.group==='Fade In';
    const atEdge=(clip:VideoClip)=>start?clip.start:endOf(clip);
    const clip=hit??clips.filter(clip=>Math.abs(atEdge(clip)-time)<=tolerance)
      .sort((a,b)=>Math.abs(atEdge(a)-time)-Math.abs(atEdge(b)-time))[0];
    if(!clip)return;
    const available=clip.duration-(start?clip.transitionOut?.duration??0:clip.transitionIn?.duration??0);
    if(frames(available,fps)<1)return;
    const duration=Math.min(frames(available,fps),Math.max(1,Math.round(recipe.duration*fps)))/fps;
    const at=atEdge(clip);
    return {clip,drop:{placement:start?'start':'end',at,duration,start:start?at:at-duration,end:start?at+duration:at}};
  }
  const edge=clips.flatMap(clip=>[
    {clip,at:clip.start,placement:'start' as const},
    {clip,at:endOf(clip),placement:'end' as const},
  ]).filter(edge=>Math.abs(edge.at-time)<=tolerance).sort((a,b)=>Math.abs(a.at-time)-Math.abs(b.at-time))[0];
  if(edge){
    const peer=clips.find(item=>item.id!==edge.clip.id&&Math.abs((edge.placement==='start'?endOf(item):item.start)-edge.at)<.5/fps);
    if(peer){
      const from=edge.placement==='start'?peer:edge.clip,to=edge.placement==='start'?edge.clip:peer;
      const left=from.duration-(recipe?from.transitionIn?.duration??0:0),right=to.duration-(recipe?to.transitionOut?.duration??0:0);
      if(recipe&&(frames(left,fps)<1||frames(right,fps)<1))return;
      return {clip:to,drop:aroundCut(to.start,left,right,fps,'cut',recipe?.duration)};
    }
    if(recipe)return;
    const duration=Math.min(edge.clip.duration,Math.max(1,frames(.5,fps))/fps);
    return {clip:edge.clip,drop:{placement:edge.placement,at:edge.at,duration,
      start:edge.placement==='end'?Math.max(0,edge.at-duration):edge.at,
      end:edge.placement==='end'?edge.at:edge.at+duration}};
  }
  if(!hit)return;
  const at=frameTime(time,fps),left=at-hit.start,right=endOf(hit)-at;
  if(frames(left,fps)<1||frames(right,fps)<1)return;
  if(hit.linkId){
    const peers=timeline.clips.filter(clip=>clip.linkId===hit.linkId&&at>clip.start+1e-7&&at<endOf(clip)-1e-7);
    if(peers.some(clip=>frames(at-clip.start,fps)<1||frames(endOf(clip)-at,fps)<1
      ||timeline.tracks.find(track=>track.id===clip.trackId)?.locked))return;
  }
  const availableLeft=left-(recipe?hit.transitionIn?.duration??0:0),availableRight=right-(recipe?hit.transitionOut?.duration??0:0);
  if(recipe&&(frames(availableLeft,fps)<1||frames(availableRight,fps)<1))return;
  return {clip:hit,drop:aroundCut(at,availableLeft,availableRight,fps,'middle',recipe?.duration)};
}

function aroundCut(at:number,left:number,right:number,fps:number,placement:'cut'|'middle',seconds=.5):TransitionDrop{
  const duration=Math.min(right,Math.max(1,Math.min(Math.round(seconds*fps),2*frames(left,fps),2*frames(right,fps)))/fps);
  const sides=splitWindow(duration,left,right,fps);
  return {placement,at,start:at-sides.before,end:at+sides.after,duration};
}

function splitWindow(duration:number,left:number,right:number,fps:number){
  const count=Math.max(2,Math.round(duration*fps));
  return {before:Math.min(Math.floor(count/2)/fps,left),after:Math.min(Math.ceil(count/2)/fps,right)};
}

export function authoredTransitions(timeline:VideoTimeline,fps:number):TransitionSpan[]{
  const muted=new Set(timeline.tracks.filter(track=>track.muted||track.kind==='audio').map(track=>track.id));
  const spans:TransitionSpan[]=[];
  for(const clip of timeline.clips){
    if(clip.adjustment||muted.has(clip.trackId))continue;
    const incoming=clip.transitionIn;
    if(incoming?.placement==='start'||incoming?.placement==='cut'){
      const modern=incoming.placement==='cut'&&incoming.preset?.startsWith('combo-');
      const from=incoming.placement==='cut'?timeline.clips.find(other=>other.id!==clip.id&&other.trackId===clip.trackId
        &&!other.adjustment&&Math.abs(endOf(other)-clip.start)<.5/fps):undefined;
      if(from){
        const left=from.duration-(modern?from.transitionIn?.duration??0:0),right=clip.duration-(modern?clip.transitionOut?.duration??0:0);
        if(!modern||frames(left,fps)>=1&&frames(right,fps)>=1){
          const {before,after}=splitWindow(incoming.duration,left,right,fps);
          spans.push({from,to:clip,start:clip.start-before,end:clip.start+after,transition:incoming});
        }
      }else if(!modern)spans.push({to:clip,start:clip.start,end:clip.start+incoming.duration,transition:incoming});
    }
    if(clip.transitionOut)spans.push({from:clip,start:endOf(clip)-clip.transitionOut.duration,end:endOf(clip),transition:clip.transitionOut});
  }
  return spans;
}
