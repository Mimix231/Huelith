import {classifyMedia} from './media-assets';
import {isVideoTimeline,makeAsset,MAX_TIMELINE,type VideoAsset,type VideoClip,type VideoTimeline,type VideoTrack} from './timeline';

type ObjectRecord=Record<string,unknown>;
const record=(value:unknown):ObjectRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as ObjectRecord:{};
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const schema=(value:unknown)=>String(record(value).OTIO_SCHEMA??'').split('.')[0];
const rt=(seconds:number,fps:number)=>({OTIO_SCHEMA:'RationalTime.1',rate:fps,value:seconds*fps});
const span=(start:number,duration:number,fps:number)=>({OTIO_SCHEMA:'TimeRange.1',start_time:rt(start,fps),duration:rt(duration,fps)});
const item=(name:string)=>({name,metadata:{},effects:[],markers:[],enabled:true});

function fileUrl(path:string){
  const clean=path.replace(/\\/g,'/');
  if(clean.startsWith('//'))return 'file:'+clean.split('/').map(encodeURIComponent).join('/');
  const encoded=clean.split('/').map((part,index)=>index===0&&/^[A-Za-z]:$/.test(part)?part:encodeURIComponent(part)).join('/');
  return 'file://'+(encoded.startsWith('/')?'':'/')+encoded;
}

export function writeOtio(timeline:VideoTimeline,name:string,fps:number){
  const warnings=new Set<string>();
  const assets=new Map(timeline.assets.map(asset=>[asset.id,asset]));
  const tracks=[];
  for(const track of [...timeline.tracks].reverse()){
    const laneClips=timeline.clips.filter(clip=>clip.trackId===track.id).sort((a,b)=>a.start-b.start);
    const lanes:{end:number;children:unknown[]}[]=[{end:0,children:[]}];
    for(const clip of laneClips){
      let lane=lanes.find(lane=>lane.end<=clip.start+1e-7);
      if(!lane){lane={end:0,children:[]};lanes.push(lane);warnings.add('Overlaps were placed on separate tracks.');}
      if(clip.start>lane.end+1e-7)lane.children.push({OTIO_SCHEMA:'Gap.1',...item('Gap'),source_range:span(0,clip.start-lane.end,fps)});
      const asset=assets.get(clip.assetId??'');
      const external=asset&&!asset.libraryId&&!asset.path.startsWith('browser:')&&!asset.missing;
      const media=external?{OTIO_SCHEMA:'ExternalReference.1',name:asset.name,metadata:{},target_url:fileUrl(asset.path),
        available_range:span(0,asset.kind==='image'?Math.max(asset.duration,clip.duration):asset.duration,fps)}
        :{OTIO_SCHEMA:'MissingReference.1',name:asset?.name??clip.title??'Placeholder',metadata:{},available_range:null};
      if(!external)warnings.add('Titles, compounds and media without a local file are listed as missing references.');
      if(clip.sourceMap||clip.holdFrame!==undefined)warnings.add('Speed changes and freeze frames use a straight source range.');
      if(clip.effects?.length||clip.grade||clip.mask||clip.chromaKey||clip.smart||clip.shape||clip.keyframes?.length||clip.crop||clip.transitionIn||clip.adjustment||
        clip.opacity!==1||clip.volume!==1||clip.fadeIn||clip.fadeOut||clip.rotation||clip.x||clip.y||clip.scale!==1||clip.audioMuted)
        warnings.add('Effects, transitions, transforms, masks and audio processing need finishing in the destination editor.');
      lane.children.push({OTIO_SCHEMA:'Clip.1',...item(clip.title??asset?.name??'Clip'),media_reference:media,
        source_range:span(clip.holdFrame??clip.sourceIn,clip.duration,fps)});
      lane.end=clip.start+clip.duration;
    }
    for(const [index,lane] of lanes.entries()){
      if(!lane.children.length)continue;
      tracks.push({OTIO_SCHEMA:'Track.1',...item(track.name+(index?' · '+(index+1):'')),enabled:!track.muted,source_range:null,
        kind:track.kind==='audio'?'Audio':'Video',children:lane.children});
    }
  }
  return {document:JSON.stringify({OTIO_SCHEMA:'Timeline.1',name,metadata:{huelith_warnings:[...warnings]},global_start_time:rt(0,fps),
    tracks:{OTIO_SCHEMA:'Stack.1',...item('Tracks'),source_range:null,children:tracks}},null,2),warnings:[...warnings]};
}

function seconds(value:unknown){
  const {rate,value:n}=record(value);
  return typeof rate==='number'&&Number.isFinite(rate)&&rate>0&&typeof n==='number'&&Number.isFinite(n)?n/rate:undefined;
}

function mediaPath(target:unknown,folder:string){
  if(typeof target!=='string'||!target.length||target.length>4096)return;
  if(/^file:/i.test(target)){
    const url=new URL(target);
    const path=decodeURIComponent(url.pathname);
    if(url.hostname&&url.hostname!=='localhost')return '//'+url.hostname+path;
    return /^\/[A-Za-z]:\//.test(path)?path.slice(1):path;
  }
  if(/^[A-Za-z]:[\\/]|^[/\\]/.test(target))return target;
  if(/^[a-z][a-z0-9+.-]*:/i.test(target))return;
  return folder.replace(/[\\/]$/,'')+'/'+decodeURIComponent(target);
}

export function readOtio(document:string,folder:string,existing:VideoAsset[]=[]){
  if(document.length>16*1024*1024)throw Error('Choose an OTIO file smaller than 16 MiB.');
  const data=record(JSON.parse(document)),stack=record(data.tracks);
  if(schema(data)!=='Timeline'||schema(stack)!=='Stack')throw Error('Choose an OpenTimelineIO Timeline document.');
  const warnings=new Set<string>(),assets=[...existing],tracks:VideoTrack[]=[],clips:VideoClip[]=[];
  let importedRate=0;
  for(const value of list(stack.children)){
    const source=record(value);
    if(schema(source)!=='Track'){warnings.add('Nested stacks require flattening before import.');continue;}
    if(tracks.length>=24)throw Error('This timeline exceeds the 24-track limit.');
    const track:VideoTrack={id:crypto.randomUUID(),name:String(source.name||'Imported track').slice(0,120),
      kind:source.kind==='Audio'?'audio':'video',locked:false,muted:source.enabled===false};
    tracks.unshift(track);
    if(source.source_range)warnings.add('Track-level trims were omitted.');
    let position=0;
    for(const child of list(source.children)){
      const current=record(child),kind=schema(current);
      if(kind==='Transition'){warnings.add('Transitions were imported as cuts.');continue;}
      const references=record(current.media_references);
      const reference=record(current.media_reference??references[String(current.active_media_reference_key)]);
      const available=record(reference.available_range),base=seconds(available.start_time)??0;
      const range=record(current.source_range??reference.available_range);
      const length=seconds(range.duration),from=(seconds(range.start_time)??base)-base;
      if(length===undefined||length<=0||from<0||position+length>MAX_TIMELINE)throw Error('Invalid or unsupported OTIO source timing.');
      if(!importedRate){const rate=record(range.duration).rate;importedRate=typeof rate==='number'?rate:0;}
      const start=position;position+=length;
      if(kind==='Gap'||current.enabled===false)continue;
      if(kind!=='Clip'){warnings.add('Nested compositions were left as gaps.');continue;}
      if(length<1/240||clips.length>=4096)throw Error('This timeline exceeds Huelith’s clip limits.');
      const path=mediaPath(reference.target_url,folder);
      const mediaKind=path&&classifyMedia(path);
      if(!path||!mediaKind||track.kind==='audio'&&mediaKind==='image'){
        warnings.add('Unsupported or missing media references were left as gaps.');continue;
      }
      let asset=assets.find(item=>item.path.replace(/\\/g,'/')===path.replace(/\\/g,'/'));
      const duration=Math.max(from+length,seconds(available.duration)??0);
      if(!asset){
        if(assets.length>=512)throw Error('This timeline exceeds the 512-item library limit.');
        asset=makeAsset(String(reference.name||path.split(/[/\\]/).at(-1)),path,mediaKind,duration);assets.push(asset);
      }
      if(mediaKind!=='image'&&from+length>asset.duration+1e-6){warnings.add('An edit exceeded its known media duration and was left as a gap.');continue;}
      if(list(current.effects).length)warnings.add('OTIO effects require finishing in Huelith.');
      clips.push({id:crypto.randomUUID(),trackId:track.id,assetId:asset.id,title:String(current.name??asset.name).slice(0,2000),
        start,sourceIn:from,duration:length,x:0,y:0,scale:1,rotation:0,opacity:1,volume:1,fadeIn:0,fadeOut:0});
    }
  }
  const timeline={assets,tracks,clips};
  if(!tracks.length||!isVideoTimeline(timeline))throw Error('No compatible timeline could be created from this OTIO file.');
  return {timeline,name:String(data.name||'Imported OTIO').slice(0,120),fps:Math.max(1,Math.min(120,Math.round(importedRate||30))),warnings:[...warnings]};
}
