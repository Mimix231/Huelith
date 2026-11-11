import {sourceBeatToTimeline} from './audio-analysis';
import {clipCrop,fittedSize,footagePlacement} from './clip-layout';
import {transformAt} from './motion';
import type {ClipTransformKey} from './studio-types';
import type {TimelineMarker,VideoAsset,VideoClip} from './timeline';

export function pinOverlay(overlay:VideoClip,source:VideoClip,asset:VideoAsset,width:number,height:number):ClipTransformKey[]{
  const smart=source.smart;
  if(!smart?.track||smart.revision!==(asset.revision??0)||!asset.width||!asset.height)
    throw Error('Track the subject on a source clip first.');
  const crop=clipCrop(asset,source),keys:ClipTransformKey[]=[];
  for(const point of smart.track.points){
    const time=sourceBeatToTimeline(source,point.time);
    if(!Number.isFinite(time)||time<overlay.start||time>=overlay.start+overlay.duration||point.confidence<.25)continue;
    const t=transformAt(source,time-source.start);
    const size=fittedSize(asset.width*crop.width,asset.height*crop.height,width,height,smart.reframe?'fill':source.fit);
    const place=footagePlacement(smart,point.time,width,height,size.width*t.scale,size.height*t.scale,crop,!!source.flipX,!!source.flipY);
    const x=place.x+((point.x-crop.x)/crop.width-.5)*size.width*t.scale*place.scale*(source.flipX?-1:1);
    const y=place.y+((point.y-crop.y)/crop.height-.5)*size.height*t.scale*place.scale*(source.flipY?-1:1);
    const angle=t.rotation*Math.PI/180;
    keys.push({parameter:'x',time:time-overlay.start,value:t.x+(x*Math.cos(angle)-y*Math.sin(angle))/width},
      {parameter:'y',time:time-overlay.start,value:t.y+(x*Math.sin(angle)+y*Math.cos(angle))/height});
  }
  if(keys.length<4)throw Error('Place the overlay over at least two confident tracking samples.');
  return [...overlay.keyframes?.filter(key=>key.parameter!=='x'&&key.parameter!=='y')??[],...keys];
}

export function beatPulsePoints(clip:VideoClip,markers:readonly TimelineMarker[],base:number,peak:number){
  const beats=[...new Set(markers.filter(marker=>marker.kind==='beat'&&marker.time>=clip.start&&marker.time<clip.start+clip.duration)
    .map(marker=>marker.time-clip.start))].sort((a,b)=>a-b).slice(0,1100);
  if(!beats.length)throw Error('Add or detect beats within this clip first.');
  const points=new Map<number,number>([[0,base],[clip.duration,base]]);
  beats.forEach((time,index)=>{
    const previous=beats[index-1]??0,next=beats[index+1]??clip.duration;
    points.set(Math.max(0,time-Math.min(.05,(time-previous)/2)),base);
    points.set(time,peak);
    points.set(Math.min(clip.duration,time+Math.min(.18,(next-time)/2)),base);
  });
  return [...points].sort((a,b)=>a[0]-b[0]).map(([time,value])=>({time,value}));
}
