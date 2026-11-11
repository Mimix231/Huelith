import {useState,type CSSProperties} from 'react';
import {ChevronLeft,ChevronRight,Diamond,DiamondOutlined} from '@mui/icons-material';
import {keyFrame,parameterAt,putKey,type ParameterKey} from '../editor/video/parameter-keys';

export type KeyClock={time:number;fps:number;active:boolean;auto:boolean;duration?:number;onSeek:(time:number)=>void};
type ButtonsProps={label:string;clock:KeyClock;keys:readonly ParameterKey[];onToggle:()=>void;disabled?:boolean};

export function VideoKeyButtons({label,clock,keys,onToggle,disabled}:ButtonsProps){
  const frame=keyFrame(clock.time,clock.fps);
  const previous=keys.filter(key=>keyFrame(key.time,clock.fps)<frame).at(-1);
  const current=keys.some(key=>keyFrame(key.time,clock.fps)===frame);
  const next=keys.find(key=>keyFrame(key.time,clock.fps)>frame&&key.time<=(clock.duration??Infinity)+1e-7);
  return <span className="hv-key-buttons">
    <button type="button" aria-label={`Previous ${label} keyframe`} title={`Previous ${label} keyframe`} disabled={!previous}
      onClick={()=>previous&&clock.onSeek(previous.time)}><ChevronLeft/></button>
    <button type="button" className={current?'is-keyed':''} aria-pressed={current} disabled={disabled||!clock.active}
      aria-label={`${current?'Remove':'Add'} ${label} keyframe`} title={`${current?'Remove':'Add'} ${label} keyframe at playhead`}
      onClick={onToggle}>{current?<Diamond/>:<DiamondOutlined/>}</button>
    <button type="button" aria-label={`Next ${label} keyframe`} title={`Next ${label} keyframe`} disabled={!next}
      onClick={()=>next&&clock.onSeek(next.time)}><ChevronRight/></button>
  </span>;
}

type Props={label:string;sliderLabel?:string;value:number;min:number;max:number;step:number;unit?:string;range?:boolean;
  encode?:(value:number)=>number;decode?:(value:number)=>number;
  clock?:KeyClock;keys?:ParameterKey[];disabled?:boolean;
  onValue:(value:number,preview:boolean)=>void;onKeys?:(keys:ParameterKey[],preview:boolean,fallback?:number)=>void;onCommit:()=>void;
};

export default function VideoKeyedValue({label,sliderLabel,value,min,max,step,unit,range=true,clock,keys=[],disabled,
  encode,decode,onValue,onKeys,onCommit}:Props){
  const [draft,setDraft]=useState<string>();
  const edited=clock?parameterAt(keys,clock.time,value):value;
  const shown=encode?encode(edited):edited;
  const blocked=disabled||!!clock&&!clock.active&&(clock.auto||keys.length>0)&&!!onKeys;
  function write(input:number){
    if(!Number.isFinite(input)||blocked)return;
    const bounded=Math.max(min,Math.min(max,input)),next=decode?decode(bounded):bounded;
    if(clock&&onKeys&&clock.active&&(clock.auto||keys.length)){
      const start=keys.length||clock.time<.5/clock.fps?keys:[{time:0,value}];
      onKeys(putKey(start,clock.time,next,clock.fps),true);
    }else onValue(next,true);
  }
  function toggle(){
    if(!clock||!onKeys)return;
    const frame=keyFrame(clock.time,clock.fps);
    if(keys.some(key=>keyFrame(key.time,clock.fps)===frame)){
      const rest=keys.filter(key=>keyFrame(key.time,clock.fps)!==frame);
      onKeys(rest,false,rest.length?undefined:edited);
    }else onKeys(putKey(keys,clock.time,edited,clock.fps),false);
  }
  return <div className={`hv-keyed-value${range?'':' is-number'}`}>
    <span className="hv-value-label">{label}</span>
    {range&&<input type="range" className="hv-studio-range" aria-label={sliderLabel??`${label} slider`} min={min} max={max} step={step}
      style={{'--hv-range-fill':`${Math.max(0,Math.min(100,(shown-min)/Math.max(.0001,max-min)*100))}%`} as CSSProperties}
      value={shown} disabled={blocked} onChange={event=>write(event.target.valueAsNumber)}
      onPointerUp={onCommit} onPointerCancel={onCommit} onKeyUp={onCommit} onBlur={onCommit}/>}
    <span className="hv-value-number"><input type="number" aria-label={label} min={min} max={max} step={step} disabled={blocked}
      value={draft??Number(shown.toFixed(step<.01?4:2))} onChange={event=>{setDraft(event.target.value);write(event.target.valueAsNumber);}}
      onBlur={()=>{setDraft(undefined);onCommit();}} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
      {unit&&<span aria-hidden="true">{unit}</span>}</span>
    {clock&&onKeys&&<VideoKeyButtons label={label} clock={clock} keys={keys} disabled={disabled} onToggle={toggle}/>}
  </div>;
}
