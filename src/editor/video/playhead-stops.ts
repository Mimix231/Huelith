import {clipKeyLanes} from './clip-key-lanes';
import {keyFrame} from './parameter-keys';
import type {VideoTimeline} from './timeline';

export type PlayheadStop={frame:number;label:string;tailFrame?:number;rank:number};

export function playheadStops(timeline:VideoTimeline,fps:number,collapsed:readonly string[]):PlayheadStop[]{
  const byFrame=new Map<number,PlayheadStop>();
  const hidden=new Set(timeline.tracks.filter(track=>track.muted||track.folder&&collapsed.includes(track.folder)).map(track=>track.id));
  function add(time:number,label:string,rank:number,tailFrame?:number){
    const frame=keyFrame(time,fps);
    if((byFrame.get(frame)?.rank??0)<rank)byFrame.set(frame,{frame,label,rank,tailFrame});
  }
  add(0,'Timeline start',1);
  for(const clip of timeline.clips){
    if(hidden.has(clip.trackId))continue;
    const start=clip.start,end=start+clip.duration;
    add(start,'Clip start or cut',5);
    add(end,'Clip end',4,Math.max(0,Math.ceil(end*fps-1e-7)-1));
    for(const lane of clipKeyLanes(clip))for(const key of lane.keys){
      if(key.time<=clip.duration+1e-7)add(start+key.time,lane.label+' keyframe',3);
    }
  }
  for(const marker of timeline.markers??[])if(marker.kind==='marker')add(marker.time,marker.label??'Marker',2);
  return [...byFrame.values()].sort((a,b)=>a.frame-b.frame);
}

function insertion(stops:readonly PlayheadStop[],frame:number){
  let low=0,high=stops.length;
  while(low<high){
    const middle=(low+high)>>>1;
    if(stops[middle].frame<frame)low=middle+1;else high=middle;
  }
  return low;
}

/** A fast scrub can cross a stop between pointer updates. Use the first
 * crossing in the direction of travel, and release on further movement. */
export function snapPlayhead(stops:readonly PlayheadStop[],frame:number,radius:number,previous?:number,held?:PlayheadStop):PlayheadStop|undefined {
  const index=insertion(stops,frame);
  const nearest=[stops[index-1],stops[index]].filter(Boolean).sort((a,b)=>Math.abs(a.frame-frame)-Math.abs(b.frame-frame)||b.rank-a.rank)[0];
  if(nearest&&nearest!==held&&Math.abs(nearest.frame-frame)<=Math.min(radius,.24))return nearest;
  if(held&&Math.abs(frame-held.frame)<=radius*1.65)return held;
  if(nearest&&Math.abs(nearest.frame-frame)<=radius&&nearest!==held)return nearest;
  if(previous===undefined||previous===frame)return undefined;
  const direction=Math.sign(frame-previous);
  const crossed=direction>0?stops[insertion(stops,previous+1e-6)]:stops[insertion(stops,previous)-1];
  if(crossed&&crossed!==held&&(direction>0?crossed.frame<=frame:crossed.frame>=frame))return crossed;
  return undefined;
}
