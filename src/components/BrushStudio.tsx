import { useEffect, useRef, useState } from 'react';
import type { EditorStore } from '../editor/store';
import { drawInkContour, INK_PRESETS, type InkPoint } from '../editor/ink-engine';
import { drawBrushDab } from '../editor/brush';
import './BrushStudio.css';

type SavedBrush = {width:number;hardness:number;smoothing:number;flow:number;spacing:number;taper:number;opacity:number;ink:boolean};
function InkSwatch({state}:{state:EditorStore}){
  const preview=useRef<HTMLCanvasElement|null>(null);
  useEffect(()=>{
    const canvas=preview.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
    ctx.clearRect(0,0,320,88);
    const pts:InkPoint[]=Array.from({length:35},(_,i)=>({
      x:15+i*8.4,y:45-19*Math.sin(i/34*Math.PI*2)*Math.cos(i/34*Math.PI),pressure:.35+.65*Math.sin(i/34*Math.PI),
    }));
    if(state.tool==='ink')drawInkContour(ctx,pts,{size:Math.min(35,state.strokeWidth),color:state.color,
      flow:state.brushFlow,opacity:state.opacity,spacing:state.brushSpacing,taper:state.inkTaper,
      pressureSize:state.pressureSize,pressureOpacity:state.pressureOpacity});
    else{for(const p of pts){drawBrushDab(ctx,p,{
      radius:Math.max(.5,Math.min(32,state.strokeWidth)/2)*(state.pressureSize?Math.max(.2,p.pressure):1),
      hardness:state.hardness,opacity:state.opacity*state.brushFlow*(state.pressureOpacity?p.pressure:1),
      color:state.color,erase:false,
    });}}
  },[state.tool,state.strokeWidth,state.brushFlow,state.brushSpacing,state.opacity,state.inkTaper,
    state.pressureSize,state.pressureOpacity,state.color,state.hardness]);
  return <canvas ref={preview} width="320" height="88" aria-label="Actual ink stroke preview"/>;
}
export default function BrushStudio({state,onClose}:{state:EditorStore;onClose:()=>void}){
  const [saved,setSaved]=useState<Record<string,SavedBrush>>(()=>{
    try {const data=JSON.parse(localStorage.getItem('huelith-brush-presets-v1')||'{}') as unknown;
      return data && typeof data==='object'&&!Array.isArray(data)?data as Record<string,SavedBrush>:{};
    }catch{return {};}
  });
  const [presetName,setPresetName]=useState('');
  const slider=(label:string,value:number,min:number,max:number,step:number,onChange:(value:number)=>void,suffix='')=><label className="h-brush-slider">
    <span>{label}<output>{Math.round(value*100)/100}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value}
      aria-label={label} onChange={e=>onChange(+e.target.value)}/></label>;
  const save=()=>{
    const key=presetName.trim().slice(0,45);if(!key)return;
    const next={...saved,[key]:{width:state.strokeWidth,hardness:state.hardness,smoothing:state.smoothing,flow:state.brushFlow,
      spacing:state.brushSpacing,taper:state.inkTaper,opacity:state.opacity,ink:state.tool==='ink'}};
    setSaved(next);try{localStorage.setItem('huelith-brush-presets-v1',JSON.stringify(next));}catch{/* Storage may be unavailable. */}
  };
  const load=(key:string)=>{const preset=saved[key];if(!preset)return;
    state.setTool(preset.ink?'ink':'brush');state.setStrokeWidth(preset.width);state.setHardness(preset.hardness);
    state.setSmoothing(preset.smoothing);state.setBrushFlow(preset.flow);state.setBrushSpacing(preset.spacing);
    state.setInkTaper(preset.taper);state.setOpacity(preset.opacity);
  };
  return <section className="h-brush-atelier" role="dialog" aria-label="Huelith Brush Studio">
    <header><span className="h-brush-crest">✦</span><div><strong>Brush Atelier</strong><small>HUELITH / HANDCRAFTED STROKES</small></div>
      <button aria-label="Close brush studio" onClick={onClose}>×</button></header>
    <div className="h-brush-scroll">
      <div className="h-brush-preview"><div><span>LIVE STROKE</span><span>{state.tool==='ink'?'Continuous Ink':'Raster Paint'}</span></div><InkSwatch state={state}/></div>
      <div className="h-brush-choices"><button className={state.tool==='ink'?'active':''} onClick={()=>state.setTool('ink')}>✧ Continuous Ink</button>
        <button className={state.tool==='brush'?'active':''} onClick={()=>state.setTool('brush')}>◉ Raster Paint</button></div>
      <h4>Brush library</h4><div className="h-brush-presets">{INK_PRESETS.map(preset=><button key={preset.id}
        className={state.brushPreset===preset.id?'active':''} onClick={()=>state.applyBrushPreset(preset.id)}>
        <span>✎</span><strong>{preset.label}</strong><small>{preset.engine==='ink'?'INK':'PAINT'}</small></button>)}</div>
      <h4>Shape &amp; ink flow</h4>
      <label className="h-brush-size"><span>Brush size (px)</span><input type="number" min="1" max="2000" value={state.strokeWidth}
        onChange={e=>state.setStrokeWidth(+e.target.value)}/></label>
      {slider('Size',state.strokeWidth,1,2000,1,state.setStrokeWidth,' px')}
      {slider('Flow',Math.round(state.brushFlow*100),2,100,1,value=>state.setBrushFlow(value/100),'%')}
      {slider('Spacing',Math.round(state.brushSpacing*100),3,100,1,value=>state.setBrushSpacing(value/100),'%')}
      {slider('Stabilization',Math.round(state.smoothing*100),0,95,1,value=>state.setSmoothing(value/100),'%')}
      {state.tool==='ink'&&slider('End taper',Math.round(state.inkTaper*100),0,48,1,value=>state.setInkTaper(value/100),'%')}
      {state.tool==='brush'&&slider('Hardness',Math.round(state.hardness*100),2,100,1,value=>state.setHardness(value/100),'%')}
      {slider('Opacity',Math.round(state.opacity*100),0,100,1,value=>state.setOpacity(value/100),'%')}
      <h4>Tablet response</h4>
      <label className="h-brush-check"><input type="checkbox" checked={state.pressureSize} onChange={e=>state.setPressureSize(e.target.checked)}/> Pressure controls stroke width</label>
      <label className="h-brush-check"><input type="checkbox" checked={state.pressureOpacity} onChange={e=>state.setPressureOpacity(e.target.checked)}/> Pressure controls opacity</label>
      <p className="h-brush-note">Pen tablets supply pressure. Mouse strokes use full pressure. Ink is rendered as a continuous filled contour; raster brushes retain their soft texture.</p>
      <h4>Your presets</h4><div className="h-brush-save"><input aria-label="New brush preset name" maxLength={45}
        placeholder="Name your brush..." value={presetName} onChange={e=>setPresetName(e.target.value)}/>
        <button disabled={!presetName.trim()} onClick={save}>Save</button></div>
      {Object.keys(saved).length>0&&<select aria-label="Load saved brush preset" defaultValue="" onChange={e=>load(e.target.value)}>
        <option value="">Load a custom brush…</option>{Object.keys(saved).map(key=><option key={key} value={key}>{key}</option>)}</select>}
    </div><footer><span>Non-destructive until stroke commit · Undo supported</span><button onClick={onClose}>Done</button></footer>
  </section>;
}
