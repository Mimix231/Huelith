import {sourceBounds,sourcePosition} from './clip-timing';
import {MAX_TIMELINE,splitClip,trimClip,type VideoClip,type VideoTimeline,type VideoTrack} from './timeline';

export function correlateAngles(first:readonly number[],second:readonly number[],firstSeconds:number,secondSeconds:number,fps:number){
  const step=Math.max(1/fps,firstSeconds/first.length,secondSeconds/second.length);
  if(!Number.isFinite(step)||firstSeconds<1||secondSeconds<1)throw Error('Both angles need a shared audible section.');
  const max=Math.floor(Math.min(10,Math.min(firstSeconds,secondSeconds)*.5)/step);
  const sample=(wave:readonly number[],duration:number,index:number)=>{
    const position=index*step/duration*wave.length;
    const from=Math.min(wave.length-1,Math.floor(position)),mix=position-from;
    return wave[from]+((wave[from+1]??wave[from])-wave[from])*mix;
  };
  const candidates=[];
  for(let offset=-max;offset<=max;offset++){
    let x=0,y=0,xx=0,yy=0,xy=0,n=0;
    const end=Math.min(Math.floor(firstSeconds/step),Math.floor(secondSeconds/step)+offset);
    for(let i=Math.max(0,offset);i<end;i++){
      const a=sample(first,firstSeconds,i),b=sample(second,secondSeconds,i-offset);
      x+=a;y+=b;xx+=a*a;yy+=b*b;xy+=a*b;n++;
    }
    if(n<20)continue;
    const divisor=Math.sqrt(Math.max(0,(xx-x*x/n)*(yy-y*y/n)));
    if(divisor>1e-5)candidates.push({shift:offset*step,score:(xy-x*y/n)/divisor});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0],alternative=candidates.find(item=>best&&Math.abs(best.shift-item.shift)>Math.max(.15,step*3));
  if(!best||best.score<.45||alternative&&alternative.score>best.score-.025)throw Error('No clear waveform match. Align the angles on the timeline first.');
  return Math.round(best.shift*fps)/fps;
}

export function buildMulticam(timeline:VideoTimeline,ids:readonly string[],shifts?:readonly number[]):VideoTimeline{
  const angles=ids.map(id=>timeline.clips.find(clip=>clip.id===id)).filter((clip):clip is VideoClip=>
    !!clip&&timeline.assets.some(asset=>asset.id===clip.assetId&&asset.kind==='video'));
  if(angles.length<2||angles.length>8||angles.length!==ids.length)throw Error('Select two to eight video clips for multicam.');
  const starts=angles.map((clip,index)=>shifts?.[index]??clip.start);
  const origin=Math.min(...starts);
  const lanes=angles.map((clip,index):VideoTrack=>({
    id:crypto.randomUUID(),kind:'video',name:'Angle '+(index+1)+' · '+(clip.title??timeline.assets.find(asset=>asset.id===clip.assetId)?.name??'Camera'),
    muted:true,locked:false,purpose:'camera-angle',
  }));
  const program:VideoTrack={id:crypto.randomUUID(),kind:'video',name:'Multicam program',muted:false,locked:false,purpose:'camera-program'};
  const sound:VideoTrack={id:crypto.randomUUID(),kind:'audio',name:'Multicam reference audio',muted:false,locked:false};
  const copies=angles.map((clip,index)=>({...clip,id:crypto.randomUUID(),trackId:lanes[index].id,linkId:undefined,
    start:starts[index]-origin,transitionIn:undefined}));
  if(copies.some(clip=>clip.start+clip.duration>MAX_TIMELINE))throw Error('Aligned angles exceed the six-hour timeline.');
  const master=copies[0];
  const edited={...master,id:crypto.randomUUID(),trackId:program.id,audioMuted:true};
  const audio={...master,id:crypto.randomUUID(),trackId:sound.id,effects:undefined,grade:undefined,smart:undefined,opacity:1};
  return {assets:timeline.assets,background:timeline.background,tracks:[program,...lanes,sound],clips:[...copies,edited,audio]};
}

export function cutMulticam(timeline:VideoTimeline,angleId:string,at:number,fps:number):VideoTimeline{
  const time=Math.round(at*fps)/fps,minimum=1/fps;
  const program=timeline.tracks.find(track=>track.purpose==='camera-program');
  const angle=timeline.tracks.find(track=>track.id===angleId&&track.purpose==='camera-angle');
  const source=timeline.clips.find(clip=>clip.trackId===angle?.id&&clip.start<=time+1e-7&&clip.start+clip.duration>time+minimum-1e-7);
  if(!program||program.locked||!source)throw Error('That camera has no frame at this point or the program track is locked.');
  const old=timeline.clips.find(clip=>clip.trackId===program.id&&clip.start<=time&&clip.start+clip.duration>time);
  const following=timeline.clips.filter(clip=>clip.trackId===program.id&&clip.start>time).sort((a,b)=>a.start-b.start)[0];
  const end=Math.min(source.start+source.duration,old?old.start+old.duration:following?.start??Infinity);
  if(end-time<minimum-1e-7)throw Error('The angle change needs at least one frame.');
  let next=timeline,replaceId=old?.id;
  if(old&&time>old.start+1e-7){
    const split=splitClip(timeline,old.id,time,minimum);
    if(!split.rightId)throw Error('The cut is too close to an existing edit.');
    next=split.timeline;replaceId=split.rightId;
  }
  const unlocked={...timeline,tracks:timeline.tracks.map(track=>track.id===source.trackId?{...track,locked:false}:track)};
  let clipped=trimClip(unlocked,source.id,'right',end-source.start-source.duration,minimum);
  clipped=trimClip(clipped,source.id,'left',time-source.start,minimum);
  const take=clipped.clips.find(clip=>clip.id===source.id)!;
  if(Math.abs(take.start-time)>1e-6||Math.abs(take.duration-(end-time))>1e-6)throw Error('That angle does not cover this cut.');
  let remaining=next.clips.filter(clip=>clip.id!==replaceId);
  const replaced=next.clips.find(clip=>clip.id===replaceId);
  if(replaced&&replaced.start+replaced.duration-end>=minimum-1e-7){
    const tail=trimClip(next,replaced.id,'left',end-replaced.start,minimum).clips.find(clip=>clip.id===replaced.id)!;
    remaining=[...remaining,tail];
  }
  if(remaining.length>=4096)throw Error('This sequence has reached its clip limit.');
  return {...next,clips:[...remaining,{...take,id:crypto.randomUUID(),trackId:program.id,audioMuted:true,transitionIn:undefined,linkId:undefined}]};
}

export function syncSourceRange(clip:VideoClip){
  if(clip.sourceMap||clip.holdFrame!==undefined)throw Error('Use unretimed camera clips for waveform sync.');
  const [lo,hi]=sourceBounds(clip);
  return {start:Math.max(lo,sourcePosition(clip,0)),end:Math.min(hi,lo+24)};
}
