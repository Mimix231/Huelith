/** Round 1: one authoring contract, independent presentation/export backends.
 * The native graph remains version 2 and is compiled separately from the
 * same unmodified timeline. This contract never silently removes operations.
 */
import {activeClips,type VideoClip,type VideoTimeline} from './timeline';

export const VIDEO_RENDER_CONTRACT_VERSION=1 as const;
export type VideoRenderContract={
  version:typeof VIDEO_RENDER_CONTRACT_VERSION;
  timeline:VideoTimeline;
  width:number;height:number;fps:number;transparent:boolean;
  /** Original project width for pixel-based typography and effect sizes.
   * Preview buffers may be scaled down without scaling authored artwork up. */
  designWidth?:number;
};
export type VisibleVideoOperation={clip:VideoClip;trackId:string;trackIndex:number};

export function createVideoRenderContract(timeline:VideoTimeline,width:number,height:number,fps:number,transparent=false,designWidth=width):VideoRenderContract{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||
    !Number.isFinite(fps)||fps<=0||!Number.isFinite(designWidth)||designWidth<1)throw Error('Invalid video render dimensions or frame rate.');
  return {version:VIDEO_RENDER_CONTRACT_VERSION,timeline,width:Math.round(width),height:Math.round(height),fps,transparent,designWidth:Math.round(designWidth)};
}

/** Order is painter's order: bottom tracks first, top tracks last.
 * Muted and audio tracks are not part of the picture. */
export function visibleVideoOperations(plan:VideoRenderContract,time:number):VisibleVideoOperation[]{
  if(plan.version!==VIDEO_RENDER_CONTRACT_VERSION)throw Error('Unknown video render contract version.');
  const order=new Map(plan.timeline.tracks.map((track,index)=>[track.id,{track,index}]));
  return activeClips(plan.timeline,time).filter(clip=>{
    const entry=order.get(clip.trackId);
    return !!entry&&!entry.track.muted&&entry.track.kind!=='audio';
  }).map(clip=>({clip,trackId:clip.trackId,trackIndex:order.get(clip.trackId)!.index}))
    .sort((a,b)=>b.trackIndex-a.trackIndex||a.clip.start-b.clip.start);
}

export function previewFrameTime(seconds:number,fps:number):number{
  return Math.max(0,Math.floor((Math.max(0,seconds)+1e-7)*fps)/fps);
}
