import {useMemo,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import {Diamond,DiamondOutlined} from '@mui/icons-material';
import {clipKeyLanes,type ClipKeyLane} from '../editor/video/clip-key-lanes';
import {keyFrame} from '../editor/video/parameter-keys';
import {KEY_EASINGS,type KeyEasing} from '../editor/video/key-easing';
import type {VideoClip} from '../editor/video/timeline';

type Selected={lane:string;index:number};
type Drag={id:number;x:number;delta:number;original:VideoClip;lanes:ClipKeyLane[];selected:Selected[]};
const has=(selection:Selected[],lane:string,index:number)=>selection.some(key=>key.lane===lane&&key.index===index);
type Props={clip:VideoClip;fps:number;zoom:number;width:number;head:number;visibleStart:number;visibleEnd:number;locked:boolean;
  onChange:(patch:Partial<VideoClip>,preview?:boolean)=>void;onSeek:(time:number)=>void;onCommit:()=>void;onCancel:()=>void};

export default function VideoKeyframeLanes({clip,fps,zoom,width,head,visibleStart,visibleEnd,locked,onChange,onSeek,onCommit,onCancel}:Props){
  const [selection,setSelection]=useState<Selected[]>([]);
  const drag=useRef<Drag|undefined>(undefined);
  const lanes=useMemo(()=>clipKeyLanes(clip),[clip]);
  const end=Math.floor((clip.duration+1e-7)*fps);
  const easings=new Set(lanes.flatMap(lane=>lane.keys.flatMap((key,index)=>has(selection,lane.id,index)?[key.curve?'bezier':key.easing??'linear']:[])));

  function shift(original:VideoClip,source:ClipKeyLane[],picked:Selected[],wanted:number){
    let low=-Infinity,high=Infinity;
    for(const lane of source){
      lane.keys.forEach((key,index)=>{
        if(!has(picked,lane.id,index))return;
        const frame=keyFrame(key.time,fps),before=lane.keys[index-1],after=lane.keys[index+1];
        low=Math.max(low,-frame,before&&!has(picked,lane.id,index-1)?keyFrame(before.time,fps)+1-frame:-Infinity);
        high=Math.min(high,end-frame,after&&!has(picked,lane.id,index+1)?keyFrame(after.time,fps)-1-frame:Infinity);
      });
    }
    const delta=Math.max(Math.min(0,low),Math.min(Math.max(0,high),wanted));
    let patch:Partial<VideoClip>={};
    for(const lane of source){
      if(!picked.some(key=>key.lane===lane.id))continue;
      patch={...patch,...lane.write({...original,...patch},lane.keys.map((key,index)=>has(picked,lane.id,index)&&delta
        ?{...key,time:(keyFrame(key.time,fps)+delta)/fps}:key))};
    }
    return {patch,delta};
  }

  function begin(event:PointerEvent<HTMLButtonElement>,lane:ClipKeyLane,index:number){
    if(event.button!==0||drag.current)return;
    event.stopPropagation();
    if(locked){onSeek(clip.start+lane.keys[index].time);return;}
    const key={lane:lane.id,index};
    if(event.shiftKey||event.ctrlKey||event.metaKey){
      setSelection(items=>has(items,lane.id,index)?items.filter(item=>item.lane!==lane.id||item.index!==index):[...items,key]);
      return;
    }
    const picked=has(selection,lane.id,index)?selection:[key];
    setSelection(picked);
    onSeek(clip.start+lane.keys[index].time);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={id:event.pointerId,x:event.clientX,delta:0,original:clip,lanes,selected:picked};
  }

  function move(event:PointerEvent<HTMLButtonElement>){
    const active=drag.current;
    if(active?.id!==event.pointerId)return;
    const wanted=Math.round((event.clientX-active.x)*fps/zoom);
    const {patch,delta}=shift(active.original,active.lanes,active.selected,wanted);
    if(delta===active.delta)return;
    active.delta=delta;
    onChange(patch,true);
  }

  function finish(event:PointerEvent<HTMLButtonElement>,cancel:boolean){
    if(drag.current?.id!==event.pointerId)return;
    if(!cancel)move(event);
    drag.current=undefined;
    if(cancel)onCancel();else onCommit();
  }

  function keyDown(event:KeyboardEvent<HTMLElement>){
    if(locked||!selection.length||!(event.target instanceof HTMLButtonElement)||!['ArrowLeft','ArrowRight','Delete','Backspace'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(event.key.startsWith('Arrow')){
      const {patch,delta}=shift(clip,lanes,selection,event.key==='ArrowLeft'?-1:1);
      if(delta)onChange(patch);
    }else{
      let patch:Partial<VideoClip>={};
      for(const lane of lanes)if(selection.some(key=>key.lane===lane.id))
        patch={...patch,...lane.write({...clip,...patch},lane.keys.filter((_,index)=>!has(selection,lane.id,index)))};
      onChange(patch);setSelection([]);
    }
  }

  function setEasing(easing:KeyEasing){
    let patch:Partial<VideoClip>={};
    for(const lane of lanes)if(selection.some(key=>key.lane===lane.id))
      patch={...patch,...lane.write({...clip,...patch},lane.keys.map((key,index)=>has(selection,lane.id,index)
        ?{...key,easing,curve:undefined,easeRange:undefined}:key))};
    onChange(patch);
  }

  if(!lanes.length)return <div className="hv-keyframe-hint">Add a diamond keyframe in the Inspector to edit it here.</div>;
  return <section className="hv-keyframe-lanes" aria-label="Selected clip keyframes" onKeyDown={keyDown}
    style={{'--hv-key-hit':Math.max(8,Math.min(18,zoom/fps))+'px'} as CSSProperties}>
    {easings.size>0&&<div className="hv-keyframe-easing">
      <label>Easing <select disabled={locked} aria-label="Selected keyframe easing"
        value={easings.size===1?[...easings][0]:''} onChange={event=>setEasing(event.target.value as KeyEasing)}>
        <option value="" disabled>Mixed</option>
        {KEY_EASINGS.map(easing=><option key={easing} value={easing}>{easing.replaceAll('-',' ')}</option>)}
        {easings.has('bezier')&&<option value="bezier" disabled>Bézier</option>}
      </select></label>
    </div>}
    {lanes.map(lane=><div className="hv-keyframe-lane" key={lane.id}>
      <span className="hv-track-name" data-hint={lane.label}>{lane.label}</span>
      <div className="hv-keyframe-track" style={{width}}>
        <span className="hv-keyframe-clip-span" style={{left:clip.start*zoom,width:clip.duration*zoom}}/>
        {lane.keys.map((key,index)=>{
          const time=clip.start+key.time;
          if(time<visibleStart||time>visibleEnd||key.time>clip.duration+1e-7)return null;
          const active=keyFrame(head,fps)===keyFrame(time,fps),picked=has(selection,lane.id,index);
          return <button type="button" key={index} className={active?'is-keyed':''} aria-pressed={picked}
            aria-label={`${lane.label} keyframe at ${time.toFixed(3)} seconds`} data-hint={`${lane.label} · ${time.toFixed(3)} s`}
            style={{left:time*zoom}} onPointerDown={event=>begin(event,lane,index)} onPointerMove={move}
            onPointerUp={event=>finish(event,false)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}
            onClick={event=>{if(event.detail===0){setSelection([{lane:lane.id,index}]);onSeek(time);}}}>
            {active||picked?<Diamond/>:<DiamondOutlined/>}
          </button>;
        })}
      </div>
    </div>)}
  </section>;
}
