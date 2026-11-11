/** Cel exposure timing is independent of the output video's sample rate. */
export function animationFrameAt(durations:readonly number[],timeMs:number):number{
  if(!durations.length||durations.some(d=>!Number.isFinite(d)||d<=0))throw Error('Animation has invalid frame timing');
  let elapsed=0;for(let i=0;i<durations.length;i++){elapsed+=durations[i];if(timeMs<elapsed)return i;}return durations.length-1;
}
