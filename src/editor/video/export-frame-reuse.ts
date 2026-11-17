/** Exact-repeat detection for immutable export timelines.
 * A frame is reusable only when every visible pixel is provably time-invariant
 * AND the active scene signature matches the immediately preceding frame.
 * Never deduplicate video based on an average/nominal source frame rate: VFR,
 * temporal effects, keyframes and transitions can change inside those intervals.
 */
import type {VideoTimeline} from './timeline';
import {staticExportSignature} from './export-static-scene';
import {authoredTransitions} from './transition-placement';

export function createExportFrameReuse(timeline:VideoTimeline,start:number,fps:number):(index:number)=>boolean {
  if(!Number.isFinite(start)||!Number.isInteger(fps)||fps<1||fps>120)
    throw Error('Invalid export frame-reuse clock');
  const transitions=authoredTransitions(timeline,fps).map(({start,end})=>({start,end}));
  let lastIndex=-1;
  let previous:string|null=null;
  return index=>{
    if(!Number.isSafeInteger(index)||index!==lastIndex+1)throw Error('Export reuse decisions must be sequential');
    const time=start+index/fps;
    const signature=transitions.some(span=>time>=span.start-1e-7&&time<span.end+1e-7)
      ?null:staticExportSignature(timeline,time);
    const reusable=index>0&&signature!==null&&signature===previous;
    previous=signature;
    lastIndex=index;
    return reusable;
  };
}
