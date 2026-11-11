import {useRef,useState,type PointerEvent} from 'react';
import {easedProgress,KEY_EASINGS,type Bezier,type KeyCurve,type KeyEasing} from '../editor/video/key-easing';

type Point=KeyCurve & {time:number;value:number};
const LEFT=28,TOP=12,WIDTH=274,HEIGHT=98;
const DEFAULT_CURVE:Bezier=[.28,.06,.72,.94];
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
type Drag<K>={
  id:number;index:number;handle?:0|1;points:K[];selected:Set<number>;x:number;y:number;min:number;span:number;moved:boolean;
};

export default function VideoKeyframeGraph<K extends Point>({points,duration,fps,min,max,onChange,onCommit,onSeek}:{
  points:K[];duration:number;fps:number;min:number;max:number;
  onChange:(points:K[],preview?:boolean)=>void;onCommit:()=>void;onSeek?:(time:number)=>void;
}){
  const [selected,setSelected]=useState(new Set<number>());
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag<K>|undefined>(undefined);
  const active=drag.current;
  const values=points.map(point=>point.value);
  const spread=Math.max(Math.min(5,(max-min)*.08),Math.max(...values)-Math.min(...values),.001);
  const bottom=active?.min??Math.max(min,Math.min(...values)-spread*.18);
  const span=active?.span??Math.max(spread,Math.min(max,Math.max(...values)+spread*.18)-bottom);
  const scaleX=(time:number)=>LEFT+WIDTH*clamp(time/duration,0,1);
  const scaleY=(value:number)=>TOP+HEIGHT*(1-clamp((value-bottom)/span,0,1));
  const curvePath=points.map((point,index)=>{
    const next=points[index+1];
    if(!next)return '';
    return Array.from({length:21},(_,part)=>{
      const t=part/20;
      return (part?'L':'M')+scaleX(point.time+(next.time-point.time)*t)+' '+scaleY(point.value+(next.value-point.value)*easedProgress(t,point));
    }).join('');
  }).join('');

  function position(event:PointerEvent){
    const rect=svg.current!.getBoundingClientRect();
    return [(event.clientX-rect.left)/rect.width*320,(event.clientY-rect.top)/rect.height*126] as const;
  }
  function begin(event:PointerEvent,index:number,handle?:0|1){
    if(event.button!==0||drag.current)return;
    event.preventDefault();event.stopPropagation();
    const indices=new Set(selected);
    if(handle===undefined&&(event.shiftKey||event.ctrlKey||event.metaKey)){
      if(indices.has(index))indices.delete(index);else indices.add(index);
      setSelected(indices);return;
    }
    const group=indices.has(index)&&handle===undefined?indices:new Set([index]);
    setSelected(group);
    const [x,y]=position(event);
    drag.current={id:event.pointerId,index,handle,points,selected:group,x,y,min:bottom,span,moved:false};
    svg.current!.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<SVGSVGElement>){
    const current=drag.current;
    if(!current||event.pointerId!==current.id)return;
    const [x,y]=position(event);
    if(!current.moved&&Math.hypot(x-current.x,y-current.y)<1.5)return;
    current.moved=true;
    const {points:initial,index,handle}=current;
    const first=initial[index],last=initial[index+1];
    if(handle!==undefined&&last){
      const curve=[...first.curve??DEFAULT_CURVE] as Bezier;
      const time=(x-LEFT)/WIDTH*duration;
      const value=current.min+(1-(y-TOP)/HEIGHT)*current.span;
      curve[handle*2]=clamp((time-first.time)/(last.time-first.time),0,1);
      curve[handle*2+1]=first.value===last.value?handle:clamp((value-first.value)/(last.value-first.value),0,1);
      onChange(initial.map((point,i)=>i===index?{...point,curve,easeRange:undefined}:point),true);
      return;
    }
    let dt=Math.round((x-current.x)/WIDTH*duration*fps)/fps;
    let dv=(current.y-y)/HEIGHT*current.span;
    let low=-Infinity,high=Infinity,lowValue=-Infinity,highValue=Infinity;
    for(const i of current.selected){
      const point=initial[i],previous=initial[i-1],next=initial[i+1];
      low=Math.max(low,-point.time,previous&&!current.selected.has(i-1)?previous.time+1/fps-point.time:-Infinity);
      high=Math.min(high,duration-point.time,next&&!current.selected.has(i+1)?next.time-1/fps-point.time:Infinity);
      lowValue=Math.max(lowValue,min-point.value);highValue=Math.min(highValue,max-point.value);
    }
    dt=clamp(dt,Math.min(0,low),Math.max(0,high));
    dv=clamp(dv,Math.min(0,lowValue),Math.max(0,highValue));
    onChange(initial.map((point,i)=>current.selected.has(i)?{...point,time:point.time+dt,value:point.value+dv}:point),true);
  }
  function finish(event:PointerEvent<SVGSVGElement>){
    const current=drag.current;
    if(!current||current.id!==event.pointerId)return;
    drag.current=undefined;
    if(current.moved)onCommit();
    else if(current.handle===undefined)onSeek?.(current.points[current.index].time);
  }
  const picked=[...selected].filter(index=>!!points[index]);
  return <div className="hv-key-graph">
    <div className="hv-inline-actions"><small>Shift-click to select keys</small>
      <select aria-label="Set easing for selected keys" value="" disabled={!picked.length} onChange={event=>{
        const easing=event.target.value as KeyEasing|'bezier';
        onChange(points.map((point,index)=>!selected.has(index)?point:easing==='bezier'
          ?{...point,curve:[...DEFAULT_CURVE] as Bezier,easeRange:undefined}
          :{...point,easing,curve:undefined,easeRange:undefined}));
      }}><option value="">Selected easing</option>
        {KEY_EASINGS.map(easing=><option key={easing}>{easing}</option>)}<option value="bezier">Bézier handles</option>
      </select></div>
    <svg ref={svg} viewBox="0 0 320 126" aria-label="Keyframe value and time graph"
      onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <path className="hv-key-axis" d={`M${LEFT} ${TOP}v${HEIGHT}h${WIDTH} M${LEFT} ${TOP+HEIGHT/2}h${WIDTH}`}/>
      <text x="2" y="16">{(bottom+span).toFixed(1)}</text><text x="2" y="110">{bottom.toFixed(1)}</text>
      <text x={LEFT} y="122">0</text><text x="266" y="122">{duration.toFixed(2)} s</text>
      <path className="hv-key-curve" d={curvePath}/>
      {picked.flatMap(index=>{
        const first=points[index],last=points[index+1];
        if(!first.curve||!last||last.time<=first.time)return [];
        return ([0,1] as const).map(handle=>{
          const x=scaleX(first.time+(last.time-first.time)*first.curve![handle*2]);
          const y=scaleY(first.value+(last.value-first.value)*first.curve![handle*2+1]);
          const anchor=handle===0?first:last;
          return <g key={index+':'+handle}><line className="hv-key-handle-line" x1={scaleX(anchor.time)} y1={scaleY(anchor.value)} x2={x} y2={y}/>
            <circle className="hv-key-handle" cx={x} cy={y} r={4} onPointerDown={event=>begin(event,index,handle)}/></g>;
        });
      })}
      {points.map((point,index)=><circle key={index} className={selected.has(index)?'hv-key-point is-selected':'hv-key-point'}
        cx={scaleX(point.time)} cy={scaleY(point.value)} r={4.5} role="button" tabIndex={0}
        aria-label={`Key at ${point.time.toFixed(3)} seconds, value ${point.value.toFixed(2)}`} aria-pressed={selected.has(index)}
        onPointerDown={event=>begin(event,index)} onKeyDown={event=>{
          if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();setSelected(new Set([index]));onSeek?.(point.time);}
        }}/>)}
    </svg>
  </div>;
}
