import {useMemo,useRef,useState,type PointerEvent} from 'react';
import {Search} from '@mui/icons-material';
import type {VideoTimeline} from '../editor/video/timeline';

type Match={id:string;kind:'Clip'|'Caption'|'Chapter';text:string;time:number;clipId?:string};
type Props={
  timeline:VideoTimeline;head:number;duration:number;viewStart:number;viewDuration:number;fps:number;
  onJump:(time:number,clipId?:string)=>void;onScrub:(scrubbing:boolean)=>void;
};

export default function VideoTimelineOverview({timeline,head,duration,viewStart,viewDuration,fps,onJump,onScrub}:Props){
  const [search,setSearch]=useState(false);
  const [query,setQuery]=useState('');
  const capture=useRef<number|null>(null);
  const matches=useMemo(()=>{
    const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if(!search||!terms.length)return [];
    const assets=new Map(timeline.assets.map(asset=>[asset.id,asset.name]));
    const captions=new Set(timeline.tracks.filter(track=>track.purpose==='captions').map(track=>track.id));
    const items:Match[]=timeline.clips.map(clip=>({id:clip.id,clipId:clip.id,time:clip.start,
      kind:captions.has(clip.trackId)?'Caption':'Clip',text:clip.title||assets.get(clip.assetId??'')||'Untitled clip'}));
    for(const marker of timeline.markers??[])if(marker.kind==='marker'&&marker.label){
      items.push({id:marker.id,time:marker.time,kind:'Chapter',text:marker.label});
    }
    return items.filter(item=>terms.every(term=>(item.kind+' '+item.text).toLowerCase().includes(term)))
      .sort((a,b)=>a.time-b.time).slice(0,60);
  },[timeline,query,search]);
  const density=useMemo(()=>{
    const width=1000;
    const changes=new Int32Array(width+1);
    for(const clip of timeline.clips){
      const start=Math.max(0,Math.min(width,Math.floor(clip.start/duration*width)));
      const end=Math.max(start,Math.min(width,Math.ceil((clip.start+clip.duration)/duration*width)));
      changes[start]++;
      changes[end]--;
    }
    let path='',start=0,active=0;
    for(let x=0;x<=width;x++){
      if(!changes[x]&&x!==width)continue;
      if(active>0&&x>start){
        const height=Math.min(19,4+active*3);
        path+=`M${start} ${22-height}H${x}V22H${start}Z`;
      }
      active+=changes[x];
      start=x;
    }
    return path;
  },[timeline.clips,duration]);

  function scrub(event:PointerEvent<SVGSVGElement>){
    const rect=event.currentTarget.getBoundingClientRect();
    if(rect.width>0)onJump(Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*duration);
  }
  function finish(){
    capture.current=null;
    onScrub(false);
  }
  const x=(time:number)=>Math.min(1000,Math.max(0,time/duration*1000));
  return <div className="hv-overview">
    <button type="button" className="hv-overview-search" aria-label="Search timeline" aria-expanded={search}
      data-hint="Find clips, captions, or chapters" onClick={()=>setSearch(value=>!value)}><Search fontSize="inherit"/></button>
    <svg className="hv-overview-map" viewBox="0 0 1000 24" preserveAspectRatio="none"
      aria-label="Timeline overview" role="slider" tabIndex={0} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={head}
      onKeyDown={event=>{
        const step=event.shiftKey?Math.max(1,viewDuration/5):1/fps;
        const next=event.key==='Home'?0:event.key==='End'?duration:event.key==='ArrowLeft'?head-step:event.key==='ArrowRight'?head+step:undefined;
        if(next!==undefined){event.preventDefault();event.stopPropagation();onJump(Math.max(0,Math.min(duration,next)));}
      }}
      onPointerDown={event=>{
        if(event.button!==0)return;
        event.currentTarget.setPointerCapture(event.pointerId);
        capture.current=event.pointerId;
        onScrub(true);
        scrub(event);
      }} onPointerMove={event=>{if(capture.current===event.pointerId)scrub(event);}}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <path className="hv-overview-density" d={density}/>
      <rect className="hv-overview-viewport" x={x(viewStart)} width={x(viewStart+viewDuration)-x(viewStart)} y={1} height={22}/>
      <line className="hv-overview-head" x1={x(head)} x2={x(head)} y1={0} y2={24}/>
    </svg>
    {search&&<div className="hv-overview-results">
      <input type="search" autoFocus aria-label="Search clips, captions, or chapters" placeholder="Find clips, captions, chapters" value={query}
        onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{
          if(event.key==='Escape'){event.stopPropagation();setSearch(false);}
          if(event.key==='Enter'&&matches[0]){onJump(matches[0].time,matches[0].clipId);setSearch(false);}
        }}/>
      {query.trim()&&(!matches.length?<p>No timeline matches</p>:matches.map(item=><button type="button" key={item.kind+item.id}
        onClick={()=>{onJump(item.time,item.clipId);setSearch(false);}}>
        <small>{item.kind}</small><span>{item.text}</span><time>{item.time.toFixed(2)} s</time>
      </button>))}
    </div>}
  </div>;
}
