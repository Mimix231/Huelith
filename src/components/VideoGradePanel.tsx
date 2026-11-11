import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {BASIC_GRADE,HUE_BANDS,gradeValue,identityCurve,matchGrade,parseCube,sampleGradeStats,withGradeValue,
  type CurvePoint,type GradeParameter,type GradeWheel,type VideoGrade} from '../editor/video/color-tools';
import {parameterAt,putKey} from '../editor/video/parameter-keys';
import {readUserPresets,saveUserPresets,type UserVideoPreset} from '../editor/video/user-presets';
import VideoKeyedValue,{type KeyClock} from './VideoKeyedValue';
import VideoMaskControls from './VideoMaskControls';

const REGIONS = ['shadows','midtones','highlights'] as const;
const CHANNELS = ['rgb','red','green','blue'] as const;
const center: GradeWheel = { x: 0, y: 0, luminance: 0 };
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function Wheel({ name, value, onChange, onCommit }: { name: string; value: GradeWheel; onChange: (value: GradeWheel, live: boolean) => void; onCommit: () => void }) {
  const active = useRef<number | null>(null);
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (active.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    const y = 1 - (event.clientY - bounds.top) / bounds.height * 2;
    const radius = Math.max(1, Math.hypot(x, y));
    onChange({ ...value, x: x / radius, y: y / radius }, true);
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (active.current !== event.pointerId) return;
    active.current = null;
    onCommit();
  }
  return <div className="hv-grade-wheel">
    <small>{name}</small>
    <button className="hv-wheel-face" aria-label={`${name} color wheel`} data-hint={`Drag to tint ${name}. Arrow keys also move the point.`}
      onPointerDown={event => { if (event.button !== 0) return; active.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event); }}
      onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={event => {
        const delta = { ArrowLeft: [-.03,0], ArrowRight: [.03,0], ArrowUp: [0,.03], ArrowDown: [0,-.03] }[event.key];
        if (!delta) return;
        event.preventDefault();
        onChange({ ...value, x: clamp(value.x + delta[0], -1, 1), y: clamp(value.y + delta[1], -1, 1) }, true);
      }} onKeyUp={onCommit} onBlur={onCommit}>
      <i style={{ left: `${50 + value.x * 50}%`, top: `${50 - value.y * 50}%` }} />
    </button>
    <input aria-label={`${name} luminance`} type="range" min={-1} max={1} step={.01} value={value.luminance}
      onChange={event => onChange({ ...value, luminance: event.target.valueAsNumber }, true)} onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit}/>
  </div>;
}

function Curves({ points, channel, onChange, onCommit }: { points: CurvePoint[]; channel: string; onChange: (points: CurvePoint[], live: boolean) => void; onCommit: () => void }) {
  const drag = useRef<{ id: number; index: number; points: CurvePoint[] } | null>(null);
  const [selected, setSelected] = useState(0);
  function position(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp(1 - (event.clientY - box.top) / box.height) };
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (active?.id !== event.pointerId) return;
    const point = position(event), index = active.index, values = [...active.points];
    const x = index === 0 ? 0 : index === values.length - 1 ? 1 : clamp(point.x, values[index - 1].x + .002, values[index + 1].x - .002);
    values[index] = { x, y: point.y };
    onChange(values, true);
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    onCommit();
  }
  return <>
    <svg className="hv-grade-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${channel} color curve`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const point = position(event);
        const close = points.findIndex(item => Math.hypot(item.x-point.x,item.y-point.y)<.07 || Math.abs(item.x-point.x)<.006);
        if (close < 0 && points.length >= 32) return;
        const values = close < 0 ? [...points, point].sort((a,b)=>a.x-b.x) : points;
        const index = close < 0 ? values.indexOf(point) : close;
        setSelected(index);
        drag.current = { id: event.pointerId, index, points: values };
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <path d="M0 25H100 M0 50H100 M0 75H100 M25 0V100 M50 0V100 M75 0V100" stroke="#50505c" strokeWidth=".4" />
      <path d="M0 100L100 0" stroke="#777785" strokeWidth=".35" />
      <polyline points={points.map(p=>`${p.x*100},${100-p.y*100}`).join(' ')} fill="none" stroke={channel==='rgb'?'#d9d2f5':channel} strokeWidth="1" />
      {points.map((point,index)=><circle key={index} cx={point.x*100} cy={100-point.y*100} r={index===selected?2.4:1.7} fill="#c9b3ff" />)}
    </svg>
    <div className="hv-inline-actions">
      <button disabled={selected<=0||selected>=points.length-1} onClick={()=>{onChange(points.filter((_,index)=>index!==selected),false);setSelected(0);}}>Remove point</button>
      <button onClick={()=>onChange(identityCurve,false)}>Reset curve</button>
    </div>
  </>;
}

function Scope({ kind }: { kind: 'waveform'|'vectorscope'|'histogram' }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const sample = document.createElement('canvas');
    sample.width = 128; sample.height = 72;
    const read = sample.getContext('2d', { willReadFrequently: true })!;
    let last = -Infinity;
    function draw() {
      const time = performance.now();
      if (time-last<140) return;
      last=time;
      const target=canvas.current, source=document.querySelector<HTMLCanvasElement>('.hv-preview-canvas');
      if (!target || !source) return;
      const ctx=target.getContext('2d')!, w=target.width, h=target.height;
      read.drawImage(source,0,0,128,72);
      const data=read.getImageData(0,0,128,72).data;
      ctx.fillStyle='#15141d';ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#515064';
      ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();
      const hist=[new Uint32Array(64),new Uint32Array(64),new Uint32Array(64)];
      if (kind==='vectorscope') {ctx.beginPath();ctx.ellipse(w/2,h/2,w*.35,h*.36,0,0,2*Math.PI);ctx.stroke();}
      for (let i=0;i<data.length;i+=4) {
        const l=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
        if (kind==='histogram') {for(let c=0;c<3;c++)hist[c][data[i+c]>>2]++;continue;}
        if (kind==='waveform') {
          ctx.fillStyle='#63e5c623';ctx.fillRect((i/4%128)/128*w,(1-l/255)*(h-2),2,2);
        } else {
          ctx.fillStyle=`rgba(${data[i]},${data[i+1]},${data[i+2]},.35)`;
          ctx.fillRect(w/2+(data[i+2]-l)/255*w*.78,h/2-(data[i]-l)/255*h*.78,2,2);
        }
      }
      if (kind==='histogram') {
        const max=Math.max(1,...hist.flatMap(channel=>Array.from(channel)));
        hist.forEach((channel,c)=>{
          ctx.strokeStyle=['#f97e93','#5ce0aa','#819dff'][c];ctx.beginPath();
          channel.forEach((value,i)=>{const x=i/63*(w-1),y=h-2-(h-4)*value/max;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
          ctx.stroke();
        });
      }
    }
    draw();
    window.addEventListener('huelith-video-frame',draw);
    return()=>window.removeEventListener('huelith-video-frame',draw);
  },[kind]);
  return <canvas ref={canvas} className="hv-grade-scope" width={320} height={142} aria-label={`Preview ${kind}`} />;
}

type Props = {
  grade?: VideoGrade; disabled: boolean; bypass: boolean;
  clock?:KeyClock;onApply?:(grade:VideoGrade)=>void;applyCount?:number;onMaskHandles?:(enabled:boolean)=>void;
  onChange: (grade: VideoGrade | undefined, live?: boolean) => void;
  onCommit: () => void; onBypass: () => void;
  onFrame: (graded: boolean) => Promise<HTMLCanvasElement>; onError: (message: string) => void;
};

const GRADE_TABS=['Basic','HSL','Curves','Color Wheels','Mask'] as const;
type GradePreset=Extract<UserVideoPreset,{kind:'grade'}>;

export default function VideoGradePanel({ grade = {}, disabled, bypass, clock,onApply,applyCount,onMaskHandles,onChange,onCommit,onBypass,onFrame,onError }: Props) {
  const [page,setPage]=useState<typeof GRADE_TABS[number]>('Basic');
  const [channel,setChannel]=useState<typeof CHANNELS[number]>('rgb');
  const [band,setBand]=useState<typeof HUE_BANDS[number][0]>('Red');
  const [region,setRegion]=useState<typeof REGIONS[number]>('midtones');
  const [scope,setScope]=useState<'waveform'|'vectorscope'|'histogram'>('waveform');
  const [copied,setCopied]=useState<VideoGrade>();
  const [reference,setReference]=useState<ReturnType<typeof sampleGradeStats>>();
  const [busy,setBusy]=useState(false);
  const [presets,setPresets]=useState<GradePreset[]>([]),[presetName,setPresetName]=useState('');
  const patch=(part:Partial<VideoGrade>,live=false)=>onChange({...grade,...part},live);
  useEffect(()=>{let mounted=true;void readUserPresets().then(items=>{
    if(mounted)setPresets(items.filter((item):item is GradePreset=>item.kind==='grade'));
  }).catch(()=>{});return()=>{mounted=false;};},[]);

  function gradeRow(name:GradeParameter,label:string,min=-100,max=100){
    return <VideoKeyedValue key={name} label={label} value={gradeValue(grade,name)} min={min} max={max} step={1}
      encode={value=>value*100} decode={value=>value/100} clock={clock} keys={grade.keys?.[name]} onCommit={onCommit}
      onValue={(value,live)=>onChange(withGradeValue(grade,name,value),live)} onKeys={(keys,live,fallback)=>{
        const base=fallback===undefined?grade:withGradeValue(grade,name,fallback);
        onChange({...base,keys:{...base.keys,[name]:keys}},live);
      }}/>;
  }
  async function match(capture: boolean) {
    setBusy(true);
    try {
      const stats=sampleGradeStats(await onFrame(capture));
      if (capture) setReference(stats);
      else if (reference) patch({match:matchGrade(stats,reference)});
    } catch(error){onError(String(error));}
    finally{setBusy(false);}
  }
  function writeWheel(value:GradeWheel,live:boolean){
    let next=grade;
    for(const channel of ['x','y','luminance'] as const){
      const name=`wheel.${region}.${channel}` as const,keys=next.keys?.[name]??[];
      if(clock?.active&&(clock.auto||keys.length)){
        const lane=keys.length||clock.time<.5/clock.fps?keys:[{time:0,value:gradeValue(next,name)}];
        next={...next,keys:{...next.keys,[name]:putKey(lane,clock.time,value[channel],clock.fps)}};
      }else if(!keys.length)next=withGradeValue(next,name,value[channel]);
    }
    onChange(next,live);
  }
  const wheel={...center};
  for(const channel of ['x','y','luminance'] as const){
    const name=`wheel.${region}.${channel}` as const;
    wheel[channel]=parameterAt(grade.keys?.[name],clock?.time??0,gradeValue(grade,name));
  }
  return <div className="hv-tool-panel hv-color-tools">
    <nav className="hv-inspector-subtabs" aria-label="Adjustment tools">{GRADE_TABS.map(tab=>
      <button type="button" key={tab} aria-pressed={tab===page} onClick={()=>{setPage(tab);onMaskHandles?.(tab==='Mask');}}>{tab}</button>)}</nav>
    <details className="hv-inspector-section"><summary>Scopes</summary>
    <label className="hv-field">Scope<select value={scope} onChange={event=>setScope(event.target.value as typeof scope)}>
      <option value="waveform">Luma waveform</option><option value="histogram">RGB histogram</option><option value="vectorscope">Vectorscope</option>
    </select></label>
    <Scope kind={scope}/></details>
    <fieldset disabled={disabled}>
      <div className="hv-inline-actions">
        <button aria-pressed={bypass} onClick={onBypass}>{bypass?'Show grade':'Bypass grade'}</button>
        <button onClick={()=>setCopied(grade)}>Copy grade</button><button disabled={!copied} onClick={()=>onChange(copied)}>Paste grade</button>
      </div>
      {page==='Color Wheels'&&<><label className="hv-field">Tonal range<select value={region} onChange={event=>setRegion(event.target.value as typeof region)}>
        {REGIONS.map(name=><option key={name}>{name}</option>)}</select></label>
        <div className="hv-wheel-row"><Wheel name={region} value={wheel} onChange={writeWheel} onCommit={onCommit}/></div>
        {gradeRow(`wheel.${region}.x`,'Color X')}{gradeRow(`wheel.${region}.y`,'Color Y')}{gradeRow(`wheel.${region}.luminance`,'Luminance')}
      </>}
      {page==='Curves'&&<>
      <label className="hv-field">Curves<select value={channel} onChange={event=>setChannel(event.target.value as typeof channel)}>
        {CHANNELS.map(value=><option key={value} value={value}>{value.toUpperCase()}</option>)}
      </select></label>
      <Curves key={channel} channel={channel} points={grade.curves?.[channel]??identityCurve}
        onChange={(points,live)=>patch({curves:{...grade.curves,[channel]:points}},live)} onCommit={onCommit}/>
      </>}
      {page==='HSL'&&<>
      <label className="hv-field">HSL range<select value={band} onChange={event=>setBand(event.target.value as typeof band)}>
        {HUE_BANDS.map(([name])=><option key={name}>{name}</option>)}
      </select></label>
      {gradeRow(`hsl.${band}.hue`,'Hue')}{gradeRow(`hsl.${band}.saturation`,'Saturation')}{gradeRow(`hsl.${band}.lightness`,'Lightness')}
      </>}
      {page==='Mask'&&<VideoMaskControls mask={grade.mask} clock={clock} onChange={(mask,live)=>patch({mask},live)}
        onCommit={onCommit} onError={onError} allowPolygon={false}/>}
      {page==='Basic'&&<>
      <label className="hv-field">Import .cube LUT<input type="file" accept=".cube" onChange={event=>{
        const file=event.currentTarget.files?.[0];event.currentTarget.value='';
        if(!file)return;
        if(file.size>32*1024*1024){onError('Choose a LUT under 32 MiB.');return;}
        void file.text().then(text=>patch({lut:parseCube(text,file.name),lutStrength:1})).catch(error=>onError(String(error)));
      }}/></label>
      {grade.lut&&<><small>{grade.lut.name} · {grade.lut.dimension}D · {grade.lut.size} points per channel</small>
        {gradeRow('lutStrength','LUT strength',0,100)}
        <button onClick={()=>patch({lut:undefined})}>Remove LUT</button></>}
      <label className="hv-source-favorite"><input type="checkbox" checked={!!grade.protectSkin}
        onChange={event=>patch({protectSkin:event.target.checked})}/> Protect skin tones</label>
      {BASIC_GRADE.map(([id,label])=>gradeRow(id,label,['sharpen','grain','fade','vignette'].includes(id)?0:-100))}
      <div className="hv-inline-actions">
        <button disabled={busy} onClick={()=>void match(true)}>Set shot reference</button>
        <button disabled={busy||!reference} onClick={()=>void match(false)}>Match to reference</button>
      </div>
      {grade.match&&<button onClick={()=>patch({match:undefined})}>Remove shot match</button>}
      </>}
      <details className="hv-inspector-section"><summary>Grade presets</summary>
        {presets.length>0&&<label className="hv-field">Load preset<select value="" onChange={event=>{
          const preset=presets.find(item=>item.id===event.target.value);if(preset)onChange(structuredClone(preset.grade));
        }}><option value="">Choose preset…</option>{presets.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        <div className="hv-inline-actions"><input type="text" aria-label="Grade preset name" maxLength={120} placeholder="Preset name"
          value={presetName} onChange={event=>setPresetName(event.target.value)}/>
          <button disabled={!presetName.trim()} onClick={()=>{
            const preset:GradePreset={id:crypto.randomUUID(),kind:'grade',name:presetName.trim(),grade:structuredClone(grade)};
            void saveUserPresets([preset]).then(()=>{setPresets(items=>[...items,preset]);setPresetName('');}).catch(error=>onError(String(error)));
          }}>Save preset</button></div>
      </details>
      {onApply&&<button disabled={(applyCount??0)<2} onClick={()=>onApply(grade)}>Apply to selected clips ({applyCount??0})</button>}
      <button onClick={()=>onChange(undefined)}>Reset grade</button>
    </fieldset>
  </div>;
}
