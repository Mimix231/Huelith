import {sourceBounds,sourcePosition} from './clip-timing';
import {durationOf,splitClip,type VideoClip,type VideoRange,type VideoTimeline} from './timeline';
import {separateBoundaryLinks} from './timeline-edits';

export function transcriptRows(timeline:VideoTimeline){
  const tracks=new Map(timeline.tracks.map(track=>[track.id,track]));
  return timeline.clips.filter(clip=>clip.caption&&clip.title).sort((a,b)=>a.start-b.start).map(clip=>({
    clip,text:clip.title!,language:tracks.get(clip.trackId)?.name??'Captions',
    words:(clip.caption?.words??[]).filter(word=>word.start<clip.duration).map(word=>({...word,start:clip.start+word.start,end:clip.start+Math.min(clip.duration,word.end)})),
  }));
}

/** Speech gaps are review candidates. They can contain music or gameplay. */
export function speechGaps(timeline:VideoTimeline,trackId:string,minimum=.75):VideoRange[]{
  const rows=transcriptRows(timeline).filter(row=>row.clip.trackId===trackId);
  const intervals=rows.flatMap(({clip,words})=>words.length?words.map(word=>[word.start,word.end]):[[clip.start,clip.start+clip.duration]])
    .sort((a,b)=>a[0]-b[0]);
  let end=intervals[0]?.[1]??0;
  const gaps:VideoRange[]=[];
  for(const [start,stop] of intervals.slice(1)){
    if(start-end>=minimum)gaps.push({id:`speech-gap-${end}`,name:'Speech gap',start:end,end:start});
    end=Math.max(end,stop);
  }
  return gaps;
}

export function fillerCandidates(timeline:VideoTimeline,trackId:string):VideoRange[]{
  return transcriptRows(timeline).filter(row=>row.clip.trackId===trackId).flatMap(row=>
    row.words.filter(word=>/^(?:u+h+m*|u+m+|e+rm+|h+m+|e+h+)$/i.test(word.text.trim().replace(/[\p{P}]/gu,''))&&word.end-word.start>=.08)
      .map((word,index)=>({id:row.clip.id+'-filler-'+index,name:word.text,start:word.start,end:word.end})));
}

export function suggestHighlights(timeline:VideoTimeline,seconds=12,phrase=''):VideoRange[]{
  const end=durationOf(timeline);
  const signals=(timeline.markers??[]).filter(marker=>marker.kind==='marker').map(marker=>({time:marker.time,label:marker.label??'Timeline marker',score:2}));
  const query=phrase.trim().toLowerCase();
  if(query)signals.push(...transcriptRows(timeline).filter(row=>row.text.toLowerCase().includes(query)).map(row=>({
    time:row.clip.start+row.clip.duration/2,label:row.text.replace(/\s+/g,' ').slice(0,70),score:3,
  })));
  for(const clip of timeline.clips){
    const track=timeline.tracks.find(item=>item.id===clip.trackId);
    const asset=timeline.assets.find(item=>item.id===clip.assetId);
    if(!track||track.muted||clip.audioMuted||!asset?.waveform?.length||!asset.duration||clip.holdFrame!==undefined)continue;
    const [lo,hi]=sourceBounds(clip),bins=asset.waveform;
    const from=Math.max(0,Math.floor(lo/asset.duration*bins.length)),to=Math.min(bins.length,Math.ceil(hi/asset.duration*bins.length));
    const hits=[];
    for(let i=from;i<to;i++){
      const level=bins[i];
      if(level<.42||level<(bins[i-1]??0)||level<(bins[i+1]??0))continue;
      const source=(i+.5)/bins.length*asset.duration;
      if(source<lo||source>hi)continue;
      let left=0,right=clip.duration;
      const forward=sourcePosition(clip,clip.duration)>=sourcePosition(clip,0);
      for(let n=0;n<18;n++){const mid=(left+right)/2;if((sourcePosition(clip,mid)<source)===forward)left=mid;else right=mid;}
      hits.push({time:clip.start+(left+right)/2,label:'Audio peak',score:level});
    }
    signals.push(...hits.sort((a,b)=>b.score-a.score).slice(0,12));
  }
  const selected:VideoRange[]=[];
  for(const signal of signals.sort((a,b)=>b.score-a.score||a.time-b.time)){
    if(signal.time>=end||selected.length>=18)continue;
    const start=Math.max(0,Math.min(signal.time-seconds*.35,end-seconds));
    const stop=Math.min(end,start+seconds);
    if(!selected.some(range=>range.start<stop&&range.end>start))
      selected.push({id:`highlight-${start}`,name:signal.label,start,end:stop});
  }
  return selected.sort((a,b)=>a.start-b.start);
}

function partition(timeline:VideoTimeline,start:number,end:number){
  let cut=timeline;
  const minimum=1/240;
  for(const original of timeline.clips){
    let current=original;
    for(const time of [start,end]){
      if(time<=current.start+1e-7||time>=current.start+current.duration-1e-7)continue;
      const split=splitClip(cut,current.id,time,minimum);
      if(!split.rightId)throw Error('Align the edit to a frame to avoid tiny fragments.');
      cut=split.timeline;current=cut.clips.find(item=>item.id===split.rightId)!;
    }
  }
  return cut.clips;
}

export function removeReviewedRange(timeline:VideoTimeline,range:{start:number;end:number}):VideoTimeline{
  const {start,end}=range,span=end-start;
  if(!Number.isFinite(span)||start<0||end>durationOf(timeline)+1e-7||span<1/240)throw Error('Choose a valid range to remove.');
  if(timeline.clips.some(clip=>clip.start+clip.duration>start&&timeline.tracks.find(track=>track.id===clip.trackId)?.locked))
    throw Error('Unlock tracks to ripple all clips after this range.');
  const move=(time:number)=>time<=start?time:Math.max(start,time-span);
  const cut=partition(timeline,start,end).filter(clip=>clip.start<start-1e-7||clip.start>=end-1e-7);
  const clips=separateBoundaryLinks(cut,end).map(clip=>clip.start>=end-1e-7?{...clip,start:clip.start-span}:clip);
  return {...timeline,clips,markers:timeline.markers?.filter(marker=>marker.time<start||marker.time>=end).map(marker=>({...marker,time:move(marker.time)})),
    ranges:timeline.ranges?.map(item=>({...item,start:move(item.start),end:move(item.end)})).filter(item=>item.end>item.start)};
}

export function assembleHighlights(timeline:VideoTimeline,ranges:readonly VideoRange[]):VideoTimeline{
  if(!ranges.length)throw Error('Select the highlights to include.');
  const unlocked={...timeline,tracks:timeline.tracks.map(track=>({...track,locked:false}))};
  const clips:VideoClip[]=[];
  let start=0;
  for(const range of ranges){
    const links=new Map<string,string>();
    const included=partition(unlocked,range.start,range.end).filter(clip=>clip.start>=range.start-1e-7&&clip.start<range.end-1e-7);
    for(const clip of included){
      if(clip.linkId&&!links.has(clip.linkId))links.set(clip.linkId,crypto.randomUUID());
      clips.push({...clip,id:crypto.randomUUID(),linkId:clip.linkId?links.get(clip.linkId):undefined,start:Math.max(0,start+clip.start-range.start)});
    }
    start+=range.end-range.start;
  }
  if(!clips.length||clips.length>4096)throw Error('Choose highlights that produce between one and 4096 clips.');
  return {...timeline,clips,markers:undefined,ranges:undefined};
}
