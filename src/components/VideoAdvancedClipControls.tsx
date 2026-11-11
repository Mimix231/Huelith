import {useState} from 'react';
import {playbackRateAt,retimeClipCurve,sourceBounds,sourceTimeAt,type SpeedPoint} from '../editor/video/clip-timing';
import type {CropRegion} from '../editor/video/studio-types';
import {MAX_TIMELINE,type VideoAsset,type VideoClip} from '../editor/video/timeline';
import {DEFAULT_CHROMA_KEY} from '../editor/video/chroma-key';
import VideoKeyedValue from './VideoKeyedValue';

type Props={clip:VideoClip;asset?:VideoAsset;time:number;fps:number;section:'crop'|'speed'|'background';visual:boolean;
  onChange:(patch:Partial<VideoClip>,preview?:boolean)=>void;onCommit:()=>void;onError:(message:string)=>void;
  onPreservePitch?:()=>void;onAnalyzeScenes?:()=>void};
const full:CropRegion={x:0,y:0,width:1,height:1};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const VELOCITIES:readonly [string,readonly number[]][]=[
  ['Beat punch',[1,1,3,.65,1]],['Slow reveal',[.35,.48,.86,1.25]],['Whip exit',[.8,.8,1.25,3.7]],
  ['Rush and settle',[2.6,1.8,.52,1]],['Ramp up',[.35,.75,1.3,2.5]],['Ramp down',[2.5,1.45,.75,.35]],
  ['Double hit',[1,3,.6,2.4,.7,1]],['Freeze-like impact',[1.3,.11,.11,1.4,2]],
];

function CropControls({clip,onChange}:Pick<Props,'clip'|'onChange'>){
  const [crop,setCrop]=useState(!!clip.crop);
  return <>
    <label className="hv-field">Framing<select value={clip.fit??'fit'} onChange={event=>onChange({fit:event.target.value as VideoClip['fit']})}>
      <option value="fit">Fit</option><option value="fill">Fill</option><option value="stretch">Stretch</option></select></label>
    <div className="hv-inline-actions">
      <button aria-pressed={!!clip.flipX} onClick={()=>onChange({flipX:!clip.flipX})}>Flip horizontal</button>
      <button aria-pressed={!!clip.flipY} onClick={()=>onChange({flipY:!clip.flipY})}>Flip vertical</button>
      <button aria-pressed={crop} onClick={()=>setCrop(!crop)}>Crop</button>
    </div>
    {crop&&<><div className="hv-pair">{(['x','y','width','height'] as const).map(key=>{
      const region=clip.crop??full;
      return <label key={key} className="hv-field">{key==='x'?'Left':key==='y'?'Top':key} (%)<input type="number" min={0} max={100}
        step={.1} defaultValue={+(region[key]*100).toFixed(2)} key={region[key]} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}
        onBlur={event=>{
          const value=event.target.valueAsNumber/100;
          if(!Number.isFinite(value)||Math.abs(value-region[key])<.0001)return;
          const box={...region,[key]:value};
          box.x=clamp(box.x,0,.99);box.y=clamp(box.y,0,.99);box.width=clamp(box.width,.01,1-box.x);box.height=clamp(box.height,.01,1-box.y);
          onChange({crop:box});
        }}/></label>;
    })}</div><button onClick={()=>onChange({crop:undefined})}>Reset crop</button></>}
  </>;
}

function BackgroundControls({clip,onChange,onCommit}:Pick<Props,'clip'|'onChange'|'onCommit'>){
  const key=clip.chromaKey;
  return <>
    <label className="hv-source-favorite"><input type="checkbox" checked={!!key}
      onChange={event=>onChange({chromaKey:event.target.checked?{...DEFAULT_CHROMA_KEY}:undefined})}/> Chroma key</label>
    {key&&<>
      <label className="hv-field hv-effect-color">Key color<input type="color" value={key.color}
        onChange={event=>onChange({chromaKey:{...key,color:event.target.value}},true)} onBlur={onCommit} onPointerUp={onCommit}/></label>
      {([['tolerance','Color tolerance'],['softness','Edge softness'],['spill','Spill suppression']] as const).map(([name,label])=>
        <VideoKeyedValue key={name} label={label} value={key[name]} min={0} max={100} step={1} unit="%" onCommit={onCommit}
          encode={value=>value*100} decode={value=>value/100}
          onValue={(value,preview)=>onChange({chromaKey:{...key,[name]:value}},preview)}/>)}
    </>}
  </>;
}

function SpeedControls({clip,asset,time,fps,visual,onChange,onError,onPreservePitch,onAnalyzeScenes}:Props){
  const rate=playbackRateAt({...clip,holdFrame:undefined},0);
  const [page,setPage]=useState<'Standard'|'Curve'|'Velocity'>('Standard');
  const [standard,setStandard]=useState(String(+Math.abs(rate).toFixed(4)));
  const [reverse,setReverse]=useState(rate<0);
  const [curve,setCurve]=useState<SpeedPoint[]>(()=>clip.speedCurve??[{at:0,rate:Math.abs(rate)},{at:1,rate:Math.abs(rate)}]);
  const bounds=sourceBounds(clip),distance=bounds[1]-bounds[0];
  const duration=distance/clamp(Number(standard)||1,.0625,16);
  function apply(points:SpeedPoint[],backwards=reverse){
    try{
      const edit=retimeClipCurve(clip,points,backwards);
      if(edit.duration!<1/fps-1e-7)throw Error('Choose a speed that leaves at least one project frame.');
      if(clip.start+edit.duration!>MAX_TIMELINE)throw Error('The clip would extend past the six-hour timeline.');
      onChange(edit);setCurve(points);setStandard(String(+points[0].rate.toFixed(4)));
    }catch(error){onError(String(error));}
  }
  const constant=()=>[{at:0,rate:Number(standard)},{at:1,rate:Number(standard)}];
  return <div className="hv-speed-inspector">
    <nav className="hv-inspector-subtabs" aria-label="Speed tools">
      {(['Standard','Curve','Velocity'] as const).map(name=><button type="button" key={name} aria-pressed={page===name}
        onClick={()=>setPage(name)}>{name}</button>)}
    </nav>
    {page==='Standard'&&<>
      <VideoKeyedValue label="Speed" value={Number(standard)||1} min={.0625} max={16} step={.0625} unit="×"
        onValue={value=>setStandard(String(value))} onCommit={()=>{}}/>
      <VideoKeyedValue label="Target duration" value={duration} min={1/fps} max={Math.max(1/fps,distance*16)} step={1/fps} unit="s" range={false}
        onValue={value=>setStandard(String(clamp(distance/value,.0625,16)))} onCommit={()=>{}}/>
      <div className="hv-inline-actions"><button onClick={()=>apply(constant())}>Apply speed</button>
        <button onClick={()=>apply([{at:0,rate:1},{at:1,rate:1}],false)}>Reset to 1×</button></div>
    </>}
    {page==='Curve'&&<>
      <svg viewBox="0 0 200 54" className="hv-speed-graph" role="img" aria-label="Speed curve">
        <path d="M0 53H200 M0 27H200 M0 1H200" stroke="#534a61" fill="none"/>
        <polyline points={curve.map(point=>`${point.at*200},${27-Math.log2(clamp(point.rate,.0625,16))*6.5}`).join(' ')} stroke="#baa5ff" strokeWidth="2" fill="none"/>
      </svg>
      {curve.map((point,index)=><div className="hv-pair hv-speed-point" key={index}>
        <label className="hv-field">Position %<input type="number" min={1} max={99} value={Math.round(point.at*100)} disabled={index===0||index===curve.length-1}
          onChange={event=>{const at=event.target.valueAsNumber/100;if(Number.isFinite(at))setCurve(items=>items.map((item,i)=>i===index?{...item,at:clamp(at,items[i-1].at+.001,items[i+1].at-.001)}:item));}}/></label>
        <label className="hv-field">Speed ×<input type="number" min={.0625} max={16} step={.05} value={point.rate}
          onChange={event=>{const rate=event.target.valueAsNumber;if(Number.isFinite(rate))setCurve(items=>items.map((item,i)=>i===index?{...item,rate:clamp(rate,.0625,16)}:item));}}/></label>
        {index>0&&index<curve.length-1&&<button aria-label={`Remove speed point ${index}`} onClick={()=>setCurve(items=>items.filter((_,i)=>i!==index))}>×</button>}
      </div>)}
      <div className="hv-inline-actions"><button disabled={curve.length>=16} onClick={()=>setCurve(items=>{
        const spans=items.slice(1).map((end,index)=>({at:(end.at+items[index].at)/2,width:end.at-items[index].at,rate:(end.rate+items[index].rate)/2}));
        const point=spans.sort((a,b)=>b.width-a.width)[0];return [...items,{at:point.at,rate:point.rate}].sort((a,b)=>a.at-b.at);
      })}>Add speed point</button><button onClick={()=>apply(curve)}>Apply curve</button></div>
    </>}
    {page==='Velocity'&&<div className="hv-velocity-presets">{VELOCITIES.map(([name,rates])=><button key={name}
      title={rates.map(rate=>`${rate}×`).join(' → ')} onClick={()=>apply(rates.map((rate,index)=>({at:index/(rates.length-1),rate})))}>{name}</button>)}</div>}
    <output className="hv-duration-readout">Clip duration {clip.duration.toFixed(3)} s</output>
    {visual&&<label className="hv-source-favorite"><input type="checkbox" checked={reverse} onChange={event=>{
      setReverse(event.target.checked);apply(page==='Curve'?curve:clip.speedCurve??constant(),event.target.checked);
    }}/> Reverse video</label>}
    <div className="hv-inline-actions">
      {onPreservePitch&&clip.sourceMap&&rate>0&&clip.holdFrame===undefined&&!clip.audioMuted&&<button onClick={onPreservePitch}>Preserve audio pitch</button>}
      {visual&&asset&&<button onClick={()=>onChange({holdFrame:clip.holdFrame===undefined
        ?Math.max(0,Math.min(asset.duration-.0001,sourceTimeAt(clip,clamp(time-clip.start,0,clip.duration)))):undefined})}>
        {clip.holdFrame===undefined?'Freeze at playhead':'Remove freeze'}</button>}
      {onAnalyzeScenes&&<button onClick={onAnalyzeScenes}>Find scene cuts</button>}
    </div>
  </div>;
}

export default function VideoAdvancedClipControls(props:Props){
  if(props.section==='speed')return props.asset&&props.asset.kind!=='image'?<SpeedControls {...props}/>:null;
  if(!props.visual||props.clip.adjustment)return null;
  return props.section==='crop'?<CropControls {...props}/>:<BackgroundControls {...props}/>;
}
