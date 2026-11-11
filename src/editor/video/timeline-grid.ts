import type {VideoTimeline} from './timeline';

export const frameTime=(seconds:number,fps:number)=>Math.max(0,Math.round(seconds*fps))/fps;

/** Frame snapping is always on. The magnet optionally aligns either moving edge. */
export function magneticFrame(
  timeline:VideoTimeline,time:number,fps:number,excluded:ReadonlySet<string>,tolerance:number,
  options:{length?:number;head?:number;beats?:boolean}={},
):{time:number;guide?:number} {
  const snapped=frameTime(time,fps);
  if(tolerance<=0)return {time:snapped};
  const offsets=options.length?[0,options.length]:[0];
  let best=tolerance,result:{time:number;guide?:number}={time:snapped};
  function test(target:number){
    const guide=frameTime(target,fps);
    for(const offset of offsets){
      const position=guide-offset,distance=Math.abs(time-position);
      if(position>=0&&distance<=best){best=distance;result={time:frameTime(position,fps),guide};}
    }
  }
  test(0);
  if(options.head!==undefined)test(options.head);
  for(const clip of timeline.clips){
    if(excluded.has(clip.id))continue;
    test(clip.start);test(clip.start+clip.duration);
  }
  for(const marker of timeline.markers??[])if(marker.kind==='marker'||options.beats)test(marker.time);
  return result;
}
