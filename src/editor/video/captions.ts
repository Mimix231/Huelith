import type {VideoTimeline,VideoClip,VideoTrack} from './timeline';
import type {CaptionWord,VideoTextStyle} from './studio-types';
export interface CaptionCue {id:string;start:number;end:number;text:string;words?:CaptionWord[]}
const stamp=(text:string):number=>{
  const match=text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if(!match)return NaN;return Number(match[1]??0)*3600+Number(match[2])*60+Number(match[3])+Number(match[4].padEnd(3,'0'))/1000;
};
export function parseCaptions(text:string):{format:'srt'|'vtt';cues:CaptionCue[]}{
  const format=text.replace(/^\uFEFF/,'').startsWith('WEBVTT')?'vtt':'srt',lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n'),cues:CaptionCue[]=[];
  for(let i=0;i<lines.length;i++){
    if(!lines[i].includes('-->'))continue;const [left,right]=lines[i].split('-->'),start=stamp(left),end=stamp(right);
    const content:string[]=[];while(i+1<lines.length&&lines[i+1].trim())content.push(lines[++i]);
    const value=content.join('\n').replace(/<[^>]*>/g,'').trim();
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>21600||!value)throw Error('A caption contains invalid timing or empty text.');
    cues.push({id:crypto.randomUUID(),start,end,text:value.slice(0,2000)});
  }
  if(!cues.length)throw Error('No valid SRT/VTT cues were found.');return {format,cues};
}
function timestamp(time:number,vtt=false):string{
  const ms=Math.max(0,Math.round(time*1000)),hours=Math.floor(ms/3600000),minutes=Math.floor(ms/60000)%60,seconds=Math.floor(ms/1000)%60;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}${vtt?'.':','}${String(ms%1000).padStart(3,'0')}`;
}
export function serializeCaptions(cues:readonly CaptionCue[],format:'srt'|'vtt'='srt'):string{
  return (format==='vtt'?'WEBVTT\n\n':'')+[...cues].sort((a,b)=>a.start-b.start).map((cue,index)=>`${format==='srt'?`${index+1}\n`:''}${timestamp(cue.start,format==='vtt')} --> ${timestamp(cue.end,format==='vtt')}\n${cue.text}\n`).join('\n');
}
export function captionCues(timeline:VideoTimeline,trackId?:string):CaptionCue[]{
  return timeline.clips.filter(c=>c.caption&&(!trackId||c.trackId===trackId)).sort((a,b)=>a.start-b.start).map(c=>({id:c.id,start:c.start,end:c.start+c.duration,text:c.title??'',words:c.caption?.words}));
}
export function addCaptions(timeline:VideoTimeline,cues:readonly CaptionCue[],source:'manual'|'srt'|'vtt'|'speech',style?:VideoTextStyle,replace=false,trackId?:string):VideoTimeline{
  let track=timeline.tracks.find(t=>t.purpose==='captions'&&(trackId?t.id===trackId:!t.locked)),tracks=timeline.tracks;
  if(trackId&&(!track||track.locked))throw Error('Select an unlocked caption track.');
  if(!track){if(tracks.length>=24)throw Error('Remove an unused track before adding a caption track.');
    track={id:crypto.randomUUID(),name:'Captions',kind:'title',muted:false,locked:false,purpose:'captions'} as VideoTrack;tracks=[track,...tracks];}
  const clips=replace?timeline.clips.filter(c=>!c.caption||c.trackId!==track!.id):timeline.clips;
  if(clips.length+cues.length>4096)throw Error('This import exceeds the project clip limit. Import fewer cues or split the project.');
  const additions:VideoClip[]=cues.map(cue=>({id:crypto.randomUUID(),trackId:track!.id,title:cue.text,start:cue.start,sourceIn:0,duration:Math.max(1/240,cue.end-cue.start),volume:0,opacity:1,
    fadeIn:0,fadeOut:0,x:0,y:.35,scale:1,rotation:0,textStyle:style??{fontSize:48,fontWeight:800,color:'#ffffff',stroke:'#111111',strokeWidth:4,width:.8},caption:{source,words:cue.words,highlight:cue.words?.length?'#ffe778':undefined}}));
  return {...timeline,tracks,clips:[...clips,...additions]};
}

export function wrapCaptionText(text:string,columns:number):string{
  const lines:string[]=[];
  for(const paragraph of text.trim().split(/\n+/)){
    let current='';
    for(const word of paragraph.trim().split(/\s+/)){
      const next=current?current+' '+word:word;
      if(current&&Array.from(next).length>columns){lines.push(current);current=word;}
      else current=next;
    }
    if(current)lines.push(current);
  }
  return lines.join('\n');
}

export function captionReplacement(text:string,find:string,replace:string):string{
  const term=find.trim();
  if(!term)return text;
  const literal=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return text.replace(new RegExp(literal,'giu'),()=>replace);
}

export function captionDictionary(cues:CaptionCue[],terms:readonly {find:string;replace:string}[]):CaptionCue[]{
  return cues.map(cue=>{
    const correct=(text:string)=>terms.reduce((current,item)=>captionReplacement(current,item.find,item.replace),text);
    const text=correct(cue.text).slice(0,2000);
    if(text===cue.text)return cue;
    const words=cue.words?.map(word=>({...word,text:correct(word.text)}));
    return {...cue,text,words:words?.every(word=>word.text.trim()&&!/\s/.test(word.text.trim()))?words:undefined};
  });
}
