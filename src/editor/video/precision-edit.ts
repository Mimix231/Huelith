import {sourceBounds} from './clip-timing';
import {addMediaClip,MAX_TIMELINE,splitClip,trimClip,type VideoAsset,type VideoClip,type VideoTimeline} from './timeline';
import {separateBoundaryLinks} from './timeline-edits';

const end=(clip:VideoClip)=>clip.start+clip.duration;
const close=(a:number,b:number)=>Math.abs(a-b)<1e-6;

export function precisionEdit(timeline:VideoTimeline,clipId:string,mode:'roll'|'slip'|'slide',delta:number,minimum:number):VideoTimeline{
  const clip=timeline.clips.find(item=>item.id===clipId);
  if(!clip||timeline.tracks.find(track=>track.id===clip.trackId)?.locked)throw Error('Select an unlocked clip.');
  if(!Number.isFinite(delta)||!delta)return timeline;
  if(clip.linkId&&timeline.clips.some(item=>item.id!==clip.id&&item.linkId===clip.linkId))
    throw Error('Unlink the selected clip before a precision trim.');
  if(mode==='slip'){
    const asset=timeline.assets.find(item=>item.id===clip.assetId);
    const available=clip.compound?Math.max(0,...clip.compound.clips.map(end)):asset?.duration;
    if(available===undefined||asset?.kind==='image'&&!asset.animated)throw Error('Slip requires media with a source duration.');
    const [lo,hi]=sourceBounds(clip);
    if(lo+delta<0||hi+delta>available+1e-6)throw Error('The source has insufficient handles for this slip.');
    return {...timeline,clips:timeline.clips.map(item=>item===clip?{...clip,sourceIn:clip.sourceIn+delta,
      holdFrame:clip.holdFrame===undefined?undefined:clip.holdFrame+delta,
      sourceMap:clip.sourceMap?.map(key=>({...key,source:key.source+delta}))}:item)};
  }
  const lane=timeline.clips.filter(item=>item.trackId===clip.trackId&&item.id!==clip.id);
  const before=lane.find(item=>close(end(item),clip.start)),after=lane.find(item=>close(item.start,end(clip)));
  if(!before||mode==='slide'&&!after)throw Error(mode==='roll'?'Select the incoming clip at a cut.':'Slide requires an adjacent clip on both sides.');
  const right=mode==='roll'?clip:after!;
  if([before,right].some(item=>item.linkId&&timeline.clips.some(other=>other.id!==item.id&&other.linkId===item.linkId)))
    throw Error('Unlink adjacent clips before moving this edit point.');
  const leftTrim=trimClip(timeline,before.id,'right',delta,minimum);
  const both=trimClip(leftTrim,right.id,'left',delta,minimum);
  if(!close(end(both.clips.find(item=>item.id===before.id)!),end(before)+delta)
    ||!close(both.clips.find(item=>item.id===right.id)!.start,right.start+delta)
    ||clip.start+delta<0||end(clip)+delta>MAX_TIMELINE&&mode==='slide')throw Error('There are insufficient source handles for this edit.');
  return mode==='roll'?both:{...both,clips:both.clips.map(item=>item.id===clip.id?{...item,start:item.start+delta}:item)};
}

/** Insert on a specific lane, or overwrite just the covered interval. */
export function placeSourceEdit(timeline:VideoTimeline,asset:VideoAsset,at:number,trackId:string|undefined,mode:'insert'|'overwrite'){
  const kind=asset.kind==='audio'?'audio':'video';
  const tracks=timeline.tracks.filter(track=>track.kind===kind&&!track.locked&&track.purpose!=='adjustment'&&track.purpose!=='camera-angle');
  const target=tracks.find(track=>track.id===trackId)??tracks.find(track=>track.id===(kind==='audio'?'audio1':'video1'))??tracks.at(-1);
  if(!target)throw Error('Add an unlocked '+kind+' track for this edit.');
  const {clip}=addMediaClip(timeline,asset,target.id,at);
  const span=clip.duration,start=clip.start,stop=end(clip);
  const trackIds=new Set([clip.trackId,...(mode==='insert'?timeline.tracks.filter(track=>track.syncLock).map(track=>track.id):[])]);
  if(timeline.tracks.some(track=>trackIds.has(track.id)&&track.locked))throw Error('Unlock the sync-locked tracks before inserting.');
  const involved=timeline.clips.filter(item=>trackIds.has(item.trackId)&&end(item)>start+1e-7);
  const outside=timeline.clips.filter(item=>!involved.includes(item));
  if(involved.some(item=>item.linkId&&timeline.clips.some(other=>other.linkId===item.linkId&&!involved.includes(other))))
    throw Error('Include the linked tracks in the edit or unlink their clips.');
  let cut=timeline;
  const minimum=1/240;
  for(const item of involved){
    const boundaries=mode==='insert'?[start]:[start,stop];
    let partId=item.id;
    for(const boundary of boundaries){
      const part=cut.clips.find(other=>other.id===partId)!;
      if(boundary<=part.start+1e-7||boundary>=end(part)-1e-7)continue;
      const split=splitClip(cut,partId,boundary,minimum);
      if(!split.rightId)throw Error('This edit would leave a clip fragment shorter than one frame.');
      cut=split.timeline;partId=split.rightId;
    }
  }
  const outsideIds=new Set(outside.map(item=>item.id));
  const clips=cut.clips.flatMap(item=>{
    if(outsideIds.has(item.id)||end(item)<=start+1e-7)return [item];
    if(mode==='overwrite')return item.start>=stop-1e-7?[item]:[];
    return [{...item,start:item.start+span}];
  });
  if(clips.length>=4096||clips.some(item=>end(item)>MAX_TIMELINE))throw Error('This edit exceeds the timeline limits.');
  if(!timeline.assets.some(item=>item.id===asset.id)&&timeline.assets.length>=512)throw Error('The media library is full.');
  const editedIds=new Set(cut.clips.filter(item=>!outsideIds.has(item.id)&&!!item.linkId).map(item=>item.linkId));
  const linked=separateBoundaryLinks(clips.filter(item=>editedIds.has(item.linkId)),stop);
  const linkedById=new Map(linked.map(item=>[item.id,item]));
  return {clip,timeline:{...timeline,assets:timeline.assets.some(item=>item.id===asset.id)?timeline.assets:[...timeline.assets,asset],
    clips:[...clips.map(item=>linkedById.get(item.id)??item),clip]}};
}

export function assembleSelects(timeline:VideoTimeline,asset:VideoAsset,at:number,trackId?:string){
  const selections=asset.selects??[];
  if(!selections.length)throw Error('Save at least one named source range.');
  let current=timeline,next=at;
  const ids:string[]=[];
  for(const range of selections){
    if(next+range.out-range.in>MAX_TIMELINE)throw Error('The selects reel exceeds the timeline duration limit.');
    const result=placeSourceEdit(current,{...asset,sourceRange:range},next,trackId,'insert');
    current={...result.timeline,clips:result.timeline.clips.map(clip=>clip.id===result.clip.id?{...clip,title:range.name}:clip)};
    ids.push(result.clip.id);next+=result.clip.duration;trackId=result.clip.trackId;
  }
  return {timeline:current,ids};
}
