import {clipEnd} from './working-edit';
import {durationOf,type VideoScene,type VideoTimeline} from './timeline';

export type ExportIssue={id:string;message:string;time:number;clipId?:string;assetId?:string;blocking?:boolean};
const generic=new Set(['arial','sans-serif','serif','monospace','system-ui','segoe ui','']);
export function reviewExport(timeline:VideoTimeline,offline:Record<string,string>,fonts?:string[]):ExportIssue[]{
  const issues:ExportIssue[]=[];
  const assetMap=new Map(timeline.assets.map(asset=>[asset.id,asset]));
  const families=fonts&&new Set(fonts.map(name=>name.toLowerCase()));
  function visit(scene:VideoScene,parentTime=0,parentId?:string){
    const muted=new Set(scene.tracks.filter(track=>track.muted).map(track=>track.id));
    for(const clip of scene.clips){
      if(muted.has(clip.trackId))continue;
      const time=parentId?parentTime:clip.start,clipId=parentId??clip.id,asset=assetMap.get(clip.assetId??'');
      if(asset&&(offline[asset.id]||asset.missing))issues.push({id:'offline:'+clip.id,message:asset.name+' is offline.',time,clipId,assetId:asset.id,blocking:true});
      const font=clip.textStyle?.fontFamily?.toLowerCase()??'';
      if(families&&!generic.has(font)&&!families.has(font))issues.push({id:'font:'+clip.id,message:'Font '+clip.textStyle?.fontFamily+' is unavailable.',time,clipId});
      if(asset?.waveform&&clip.volume>1&&Math.max(0,...asset.waveform)*clip.volume>1.08&&!clip.audioMuted)
        issues.push({id:'peak:'+clip.id,message:'Review the audio level for '+(clip.title??asset.name)+'.',time,clipId});
      if(clip.compound)visit(clip.compound,time,clipId);
    }
  }
  visit(timeline);
  const visual=new Set(timeline.tracks.filter(track=>!track.muted&&track.kind!=='audio').map(track=>track.id));
  const spans=timeline.clips.filter(clip=>!clip.adjustment&&visual.has(clip.trackId)).sort((a,b)=>a.start-b.start);
  let end=0;
  for(const clip of spans){
    if(clip.start-end>=.5)issues.push({id:'gap:'+clip.id,message:(clip.start-end).toFixed(1)+' s with no visible clip.',time:end});
    end=Math.max(end,clipEnd(clip));
  }
  if(durationOf(timeline)-end>=.5)issues.push({id:'gap:end',message:(durationOf(timeline)-end).toFixed(1)+' s with no visible clip at the end.',time:end});
  return issues.slice(0,120);
}
