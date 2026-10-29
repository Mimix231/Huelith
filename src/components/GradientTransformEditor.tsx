import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GradientTransformStep, VectorShape } from '../editor/types';
import { uid } from '../editor/types';
import { GRADIENT_TRANSFORMS, type GradientTransform } from '../editor/gradient-transforms';
import { paintGradientPreview } from '../editor/gradient';
import { GRADIENT_COLOR_MODES, GRADIENT_PATTERNS } from '../editor/gradient-patterns';
import './GradientTransformEditor.css';

const CATEGORIES = ['Patterns', 'Radial', 'Distort', 'Geometry', 'Light', 'Huelith'];
const metadata = new Map(GRADIENT_TRANSFORMS.map(item => [item.id, item]));
function nodeFor(kind: GradientTransform): GradientTransformStep {
  return { id: uid(), kind, enabled: true, amount: 100, frequency: 2, count: 14,
    phase: 0, seed: 12, centerX: .5, centerY: .5 };
}
function TonePreview({ kind, colors }: { kind: GradientTransform; colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    paintGradientPreview(ctx, { id: 'preview', kind: 'gradient', x: 0, y: 0, width: 96, height: 72,
      fill: 'none', stroke: 'none', strokeWidth: 0, gradientMode: 'linear',
      gradientStops: colors.map((color, index) => ({ id: String(index), color, position: index / Math.max(1, colors.length - 1), opacity: 1 })),
      gradientTransform: kind }, 96, 72);
  }, [kind, colors.join(':')]);
  return <canvas ref={ref} width="96" height="72" />;
}

function PatternPreview({ pattern, colors }: {pattern: 'smooth' | 'sunburst' | 'speedlines';colors:string[]}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current?.getContext('2d');if(!ctx)return;
    paintGradientPreview(ctx,{id:'pattern-preview',kind:'gradient',x:0,y:0,width:56,height:42,fill:'none',stroke:'none',strokeWidth:0,
      gradientPattern:pattern,gradientColorMode:pattern==='smooth'?'smooth':'alternating',
      gradientRayCount:16,gradientRayWidth:.5,gradientRaySoftness:0,gradientTwist:0,gradientStops:colors.map((color,i)=>({id:String(i),color,position:i/Math.max(1,colors.length-1),opacity:1}))},56,42);
  },[pattern,colors.join(':')]);return <canvas width={56} height={42} ref={ref}/>;
}

export default function GradientTransformEditor({ source, name, onApply, onClose }: {
  source: VectorShape; name: string; onApply: (shape: VectorShape) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<VectorShape>(() => structuredClone(source));
  const [selectedId, setSelectedId] = useState<string | null>(source.gradientTransformStack?.at(-1)?.id ?? null);
  const [category, setCategory] = useState('Patterns');
  const [search, setSearch] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [saved, setSaved] = useState<Record<string, Partial<VectorShape>>>(() => {
    try { const stored = JSON.parse(localStorage.getItem('huelith-gradient-presets-v1') ?? '{}') as unknown;
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, Partial<VectorShape>> : {};
    } catch { return {}; }
  });
  const [presetName, setPresetName] = useState('');
  const [history, setHistory] = useState<VectorShape[]>([]);
  const [future, setFuture] = useState<VectorShape[]>([]);
  const preview = useRef<HTMLCanvasElement>(null);
  const centerDrag = useRef<number | null>(null);
  const stack = draft.gradientTransformStack ?? [];
  const selected = stack.find(item => item.id === selectedId);
  const colors = draft.gradientStops?.map(item => item.color) ?? ['#8e83ff', '#ffffff'];
  const patternActive = draft.gradientPattern !== undefined && draft.gradientPattern !== 'smooth';
  const patternHandle = patternActive && (category==='Patterns' || !selected);
  const previewWidth = Math.max(1,Math.round(576*Math.min(1,Math.abs(source.width)/Math.max(1,Math.abs(source.height)))));
  const previewHeight = Math.max(1,Math.round(576*Math.min(1,Math.abs(source.height)/Math.max(1,Math.abs(source.width)))));
  const snapshot = (next: VectorShape) => {
    setHistory(prev => [...prev.slice(-39), structuredClone(draft)]);
    setFuture([]);
    setDraft(next);
  };
  const patch = (apply: (next: VectorShape) => void, commit = true) => {
    const next = structuredClone(draft); apply(next);
    if (commit) snapshot(next); else setDraft(next);
  };
  const adjust = (key: keyof GradientTransformStep, value: number | boolean) => patch(next => {
    const step = next.gradientTransformStack?.find(item => item.id === selectedId);
    if (step) Object.assign(step, { [key]: value });
  }, false);
  const selectKind = (kind: GradientTransform) => {
    if (kind === 'none') { snapshot({...draft, gradientTransformStack: []});setSelectedId(null);return; }
    if (stack.length >= 24) return; // Keep the serialized project within the supported stack limit.
    const node = nodeFor(kind);
    snapshot({...draft,gradientTransform: 'none',gradientTransformStack:[...stack,node]});
    setSelectedId(node.id);
  };
  const choosePattern = (pattern: 'smooth' | 'sunburst' | 'speedlines', preset?: 'ink' | 'comic') => {
    patch(next=>{
      next.gradientPattern=pattern;next.gradientColorMode=pattern==='smooth'?'smooth':'alternating';
      next.gradientBandCount=8;next.gradientRayCount=pattern==='speedlines'?32:24;
      next.gradientRayWidth=.5;next.gradientRaySoftness=pattern==='speedlines'?.03:0;
      next.gradientRayTaper=pattern==='speedlines'?.52:0;next.gradientRayGlow=0;
      next.gradientTwist=0;next.gradientRotation=0;next.gradientCenterX=.5;next.gradientCenterY=.5;
      if (preset==='ink' || preset==='comic') {
        const pair=preset==='ink'?['#000000','#ffffff']:['#ffdf24','#d52c55'];
        next.gradientStops=pair.map((color,i)=>({id:uid(),position:i,color,opacity:1}));
      }
    });setSelectedId(null);setCategory('Patterns');
  };
  const changePattern = (updates: Partial<VectorShape>, commit=true) => patch(next=>Object.assign(next,updates),commit);
  const setColorBands = (count:number) => patch(next=>{
    next.gradientBandCount=count;
    // A band count is meaningful for Bands/Alternating/Stepped/Pattern, not
    // for a smooth, unquantized ramp or binary hard stops. When someone
    // touches this slider, immediately enter Bands mode rather than making
    // it an inert control. Pattern geometry itself is preserved.
    if (next.gradientColorMode === undefined || next.gradientColorMode==='smooth' ||
        next.gradientColorMode==='hardStops' || next.gradientColorMode==='alternating') {
      next.gradientColorMode='bands';
    }
  },false);
  const patternControl = (title:string,key:keyof VectorShape,min:number,max:number,step:number,format:(v:number)=>string=String) => (
    <label key={key} className="hte-parameter hte-pattern-parameter"><span>{title}<output>{format(Number(draft[key]??({gradientBandCount:8,gradientRayCount:24,gradientRayWidth:.5,gradientRaySoftness:0,gradientRayTaper:0,gradientTwist:0,gradientRotation:0} as Partial<VectorShape>)[key]??0))}</output></span>
      <input type="range" aria-label={title} min={min} max={max} step={step} value={Number(draft[key]??({gradientBandCount:8,gradientRayCount:24,gradientRayWidth:.5,gradientRaySoftness:0,gradientRayTaper:0,gradientTwist:0,gradientRotation:0} as Partial<VectorShape>)[key]??0)}
        onPointerDown={()=>{setHistory(list=>[...list.slice(-39),structuredClone(draft)]);setFuture([]);}}
        onChange={event=>changePattern({[key]:Number(event.target.value)},false)}/>
    </label>);
  const editStack = (edit: (items: GradientTransformStep[]) => GradientTransformStep[]) => patch(next => {
    next.gradientTransformStack = edit(next.gradientTransformStack ?? []);
  });
  const undo = () => {
    const previous = history.at(-1);if (!previous) return;
    setFuture(items => [...items, structuredClone(draft)]);
    setHistory(items => items.slice(0,-1)); setDraft(previous);
  };
  const redo = () => {
    const upcoming = future.at(-1);if (!upcoming) return;
    setHistory(items => [...items,structuredClone(draft)]);
    setFuture(items => items.slice(0,-1));setDraft(upcoming);
  };
  useEffect(() => {
    const canvas = preview.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // Coalesce continuous slider edits. The working preview runs the *real*
    // procedural sampler; full document resolution is used on committed export.
    const timer = window.setTimeout(() => paintGradientPreview(ctx,
      showOriginal ? source : draft,
      canvas.width,canvas.height), 55);
    return () => window.clearTimeout(timer);
  }, [draft, showOriginal]);
  const point = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left)/rect.width)),
      y: Math.min(1, Math.max(0,(event.clientY-rect.top)/rect.height)) };
  };
  const saveCenter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (centerDrag.current !== event.pointerId || (!selected && !patternHandle)) return;
    const value = point(event);
    patch(next => {
      if (patternHandle) {next.gradientCenterX=value.x;next.gradientCenterY=value.y;}
      else { const item = next.gradientTransformStack?.find(entry => entry.id === selected?.id);
        if(item) { item.centerX=value.x; item.centerY=value.y; } }
    }, false);
  };
  const control = (title: string, key: keyof GradientTransformStep, min: number, max: number, step: number, suffix = '') => (
    <label key={key} className="hte-parameter"><span>{title}<output>{Number(selected?.[key] ?? 0).toFixed(step<1?2:0)}{suffix}</output></span>
      <input type="range" value={Number(selected?.[key] ?? 0)} min={min} max={max} step={step}
        onPointerDown={() => { setHistory(list => [...list.slice(-39),structuredClone(draft)]);setFuture([]); }}
        onChange={event => adjust(key, Number(event.target.value))} aria-label={title} />
    </label>
  );
  return <div className="hte-backdrop" role="presentation">
    <section className="hte-workspace" role="dialog" aria-modal="true" aria-label="Huelith Gradient Transformation Editor"
      onKeyDown={event => {
        if (event.key === 'Escape') {event.stopPropagation();onClose();}
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {event.preventDefault();event.shiftKey?redo():undo();}
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {event.preventDefault();redo();}
      }}>
      <header className="hte-header"><div className="hte-brand"><span>✦</span><div><strong>Gradient Atelier</strong><small>HUELITH / CREATIVE WORKSPACE</small></div></div>
        <span className="hte-document-name">◈ {name}</span><div className="hte-header-actions"><button title="Undo" disabled={!history.length} onClick={undo}>↶</button><button title="Redo" disabled={!future.length} onClick={redo}>↷</button><button aria-label="Close gradient editor" onClick={onClose}>×</button></div></header>
      <div className="hte-body">
        <aside className="hte-library"><div className="hte-section-heading">PATTERNS & TRANSFORMS</div>
          <input className="hte-search" placeholder="Search patterns and transforms…" aria-label="Search gradient transforms"
            value={search} onChange={event=>setSearch(event.target.value)} />
          <nav aria-label="Transformation categories">{CATEGORIES.map(item => <button key={item} className={category===item?'selected':''} onClick={()=>setCategory(item)}>{item}</button>)}</nav>
          {(category==='Patterns' || search) && <div className="hte-pattern-list">
            <button className="hte-preset-hero" onClick={()=>choosePattern('sunburst','ink')} title="Black and white radial lines, without blended colors">
              <PatternPreview pattern="sunburst" colors={['#000000','#ffffff']}/>
              <span><strong>◈ Black & White Burst</strong><small>Exact alternating ink rays · one click</small></span>
            </button>
            <button className="hte-preset-hero hte-comic" onClick={()=>choosePattern('sunburst','comic')}>
              <PatternPreview pattern="sunburst" colors={['#ffdf24','#d52c55']}/>
              <span><strong>✦ Comic Explosion</strong><small>Sharp two-color action rays</small></span>
            </button>
            {GRADIENT_PATTERNS.filter(item=>!search||(item.label+' '+item.detail).toLowerCase().includes(search.toLowerCase())).map(item=><button
              key={item.id} className="hte-transform-card" onClick={()=>choosePattern(item.id)}>
              <PatternPreview pattern={item.id} colors={colors}/><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>➜</b></button>)}
          </div>}
          <div className="hte-transform-cards">{GRADIENT_TRANSFORMS.filter(item => item.id!=='none' && (category!=='Patterns' && (search || category===item.category)) && (!search || (item.name+' '+item.description).toLowerCase().includes(search.toLowerCase()))).map(item => <button
            key={item.id} className="hte-transform-card" title={item.description} disabled={stack.length>=24} onClick={()=>selectKind(item.id)}><TonePreview kind={item.id} colors={colors}/>
            <span><strong>{item.name}</strong><small>{item.description}</small></span><b>+</b></button>)}</div>
        </aside>
        <div className="hte-stage"><div className="hte-stage-meta"><span>LIVE PROCEDURAL PREVIEW</span><span>{Math.round(source.width)} × {Math.round(source.height)} · Full resolution on export</span></div>
          <div className="hte-stage-surround"><div className="hte-preview-frame" style={{transform:`scale(${zoom})`,width:`min(100%, ${previewWidth}px)`,aspectRatio:`${previewWidth}/${previewHeight}`}}
              onPointerDown={event => { if((!selected && !patternHandle) || event.button!==0) return;
                setHistory(list=>[...list.slice(-39),structuredClone(draft)]);setFuture([]);
                centerDrag.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);saveCenter(event); }}
              onPointerMove={saveCenter} onPointerUp={event=>{if(centerDrag.current===event.pointerId){centerDrag.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}}>
              <canvas ref={preview} width={previewWidth} height={previewHeight} aria-label="Gradient transformation preview" />
              {(patternHandle || selected) && <div className="hte-center-handle" title={patternHandle?'Drag radial pattern center':'Drag transformation center'} style={{left:`${(patternHandle?draft.gradientCenterX??.5:selected!.centerX)*100}%`,top:`${(patternHandle?draft.gradientCenterY??.5:selected!.centerY)*100}%`}}>✦</div>}
            </div></div>
          <div className="hte-stage-bar"><button className={showOriginal?'selected':''} onPointerDown={()=>setShowOriginal(true)} onPointerUp={()=>setShowOriginal(false)} onPointerLeave={()=>setShowOriginal(false)}>◉ Hold to compare</button><span>Drag ✦ to move the radial or transformation center</span>
            <button title="Zoom out" onClick={()=>setZoom(Math.max(.5,zoom-.1))}>−</button><output>{Math.round(zoom*100)}%</output><button title="Zoom in" onClick={()=>setZoom(Math.min(1.6,zoom+.1))}>+</button></div>
          <div className="hte-stack-heading"><strong>✧ Transformation stack</strong><span>Top to bottom · Non-destructive</span></div>
          <div className="hte-stack">{stack.length ? stack.map((item,index)=><div key={item.id} className={`hte-stack-node ${selectedId===item.id?'selected':''}`}>
            <button className="hte-stack-select" onClick={()=>setSelectedId(item.id)}><strong>{metadata.get(item.kind)?.name ?? item.kind}</strong></button>
            <button aria-label="Toggle transformation" title="Enable or disable" onClick={()=>editStack(items=>items.map(step=>step.id===item.id?{...step,enabled:!step.enabled}:step))}>{item.enabled?'◉':'○'}</button>
            <button aria-label="Move transformation up" title="Earlier" disabled={!index} onClick={()=>editStack(items=>{const copy=[...items];[copy[index-1],copy[index]]=[copy[index],copy[index-1]];return copy;})}>↑</button>
            <button aria-label="Move transformation down" title="Later" disabled={index===stack.length-1} onClick={()=>editStack(items=>{const copy=[...items];[copy[index],copy[index+1]]=[copy[index+1],copy[index]];return copy;})}>↓</button>
            <button aria-label="Duplicate transformation" title="Duplicate" onClick={()=>editStack(items=>{const copy=[...items];copy.splice(index+1,0,{...item,id:uid()});return copy;})}>⧉</button>
            <button aria-label="Delete transformation" title="Delete" onClick={()=>{editStack(items=>items.filter(step=>step.id!==item.id));setSelectedId(null);}}>×</button>
          </div>) : <div className="hte-empty">Choose a transformation to start building your look.</div>}</div>
        </div>
        <aside className="hte-properties"><div className="hte-section-heading">RECIPE INSPECTOR</div>
          <div className="hte-pattern-inspector"><div className="hte-section-heading">COLOR & PATTERN ENGINE</div>
            <label className="hte-mode-label">Color behavior
              <select aria-label="Gradient color mode" value={draft.gradientColorMode??'smooth'} onChange={event=>changePattern({gradientColorMode:event.target.value as VectorShape['gradientColorMode']})}>
                {GRADIENT_COLOR_MODES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
              </select></label>
            <p className="hte-pattern-detail">{GRADIENT_COLOR_MODES.find(item=>item.id===(draft.gradientColorMode??'smooth'))?.detail}</p>
            <label className="hte-parameter hte-pattern-parameter"><span>Color bands<output>{draft.gradientBandCount??8}</output></span>
              <input type="range" aria-label="Color bands" min={2} max={128} step={1} value={draft.gradientBandCount??8}
                onPointerDown={()=>{setHistory(list=>[...list.slice(-39),structuredClone(draft)]);setFuture([]);}}
                onChange={event=>setColorBands(Number(event.target.value))}/>
              <small className="hte-band-hint">Changing the count activates visible repeating palette bands.</small>
            </label>
            <div className="hte-pattern-palettes"><span>Palette · click a color to edit</span><div className="hte-pattern-swatches">{(draft.gradientStops??[]).map((stop,i)=><label key={stop.id} title={`Palette color ${i+1}`}><input aria-label={`Pattern color ${i+1}`} type="color" value={stop.color} onPointerDown={()=>{setHistory(list=>[...list.slice(-39),structuredClone(draft)]);setFuture([]);}} onChange={event=>changePattern({gradientStops:draft.gradientStops?.map(s=>s.id===stop.id?{...s,color:event.target.value}:s)},false)} /></label>)}</div>
              <button title="Add a palette color" disabled={(draft.gradientStops?.length??0)>=32} onClick={()=>changePattern({gradientStops:[...(draft.gradientStops??[]),{id:uid(),position:1,color:'#8e83ff',opacity:1}].map((stop,i,all)=>({...stop,position:i/(all.length-1)}))})}>+ Color</button>
            </div>
            <label className="hte-mode-label">Geometry
              <select aria-label="Gradient pattern geometry" value={draft.gradientPattern??'smooth'} onChange={event=>choosePattern(event.target.value as 'smooth'|'sunburst'|'speedlines')}>
                {GRADIENT_PATTERNS.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}
              </select></label>
            {patternActive && <div className="hte-ray-controls">
              {patternControl('Ray pairs','gradientRayCount',2,180,1,v=>`${v||20} × 2`)}
              {patternControl('Ray width','gradientRayWidth',.05,.95,.01,v=>`${Math.round((v||0)*100)}%`)}
              {patternControl('Edge softness','gradientRaySoftness',0,.48,.01,v=>`${Math.round((v||0)*100)}%`)}
              {patternControl('Taper','gradientRayTaper',0,1,.01,v=>`${Math.round((v||0)*100)}%`)}
              {patternControl('Twist','gradientTwist',-8,8,.05,v=>v.toFixed(2))}
              {patternControl('Rotation','gradientRotation',-180,180,1,v=>`${v}°`)}
              <div className="hte-centers"><label>Pivot X<input aria-label="Ray center X" type="number" step="0.01" min="0" max="1" value={Number(draft.gradientCenterX??.5).toFixed(2)} onChange={event=>changePattern({gradientCenterX:Math.max(0,Math.min(1,+event.target.value))})}/></label>
                <label>Pivot Y<input aria-label="Ray center Y" type="number" step="0.01" min="0" max="1" value={Number(draft.gradientCenterY??.5).toFixed(2)} onChange={event=>changePattern({gradientCenterY:Math.max(0,Math.min(1,+event.target.value))})}/></label></div>
            </div>}
          </div>
          <div className="hte-section-heading hte-recipe-heading">TRANSFORM RECIPE</div>
          <div className="hte-properties-title"><span>◈</span><strong>{selected ? metadata.get(selected.kind)?.name : 'Select a recipe'}</strong><small>{selected ? metadata.get(selected.kind)?.category : 'No active recipe'}</small></div>
          {selected ? <>
            {control('Intensity','amount',0,100,1,'%')}
            {control(selected.kind==='twirl'?'Twist density':'Frequency','frequency',.25,16,.25)}
            {control(['starburst','speedRays','pinwheel','solarRings','kaleidoscope','lightBeams','crystalBloom'].includes(selected.kind)?'Rays / segments':'Elements','count',2,180,1)}
            {control('Phase / rotation','phase',-100,100,1)}
            {control('Variation','seed',0,999,1)}
            <div className="hte-centers"><label>Center X<input type="number" min={0} max={1} step={.01} value={selected.centerX.toFixed(2)} onChange={event=>adjust('centerX',Math.min(1,Math.max(0,+event.target.value)))}/></label><label>Center Y<input type="number" min={0} max={1} step={.01} value={selected.centerY.toFixed(2)} onChange={event=>adjust('centerY',Math.min(1,Math.max(0,+event.target.value)))}/></label></div>
            <button className="hte-reset-recipe" onClick={()=>editStack(items=>items.map(item=>item.id===selected.id?{...nodeFor(item.kind),id:item.id}:item))}>↺ Reset selected recipe</button>
          </> : <p className="hte-empty-text">Layer your distortions, light fields and patterns. Select a recipe to adjust its geometry. All changes remain editable.</p>}
          <div className="hte-presets"><div className="hte-section-heading">SAVED LOOKS</div>
            <label>Preset name<input maxLength={42} value={presetName} onChange={event=>setPresetName(event.target.value)} placeholder="e.g. violet vortex"/></label>
            <button disabled={!presetName.trim()} onClick={()=>{
              const title=presetName.trim();const next={...saved,[title]:{
                gradientMode:draft.gradientMode,gradientStops:draft.gradientStops,
                gradientPattern:draft.gradientPattern,gradientColorMode:draft.gradientColorMode,
                gradientBandCount:draft.gradientBandCount,gradientRayCount:draft.gradientRayCount,
                gradientRayWidth:draft.gradientRayWidth,gradientRaySoftness:draft.gradientRaySoftness,
                gradientRayTaper:draft.gradientRayTaper,gradientRayGlow:draft.gradientRayGlow,
                gradientRaySeed:draft.gradientRaySeed,gradientRotation:draft.gradientRotation,
                gradientTwist:draft.gradientTwist,
                gradientTransformStack:draft.gradientTransformStack,
                gradientTransform:draft.gradientTransform,gradientCenterX:draft.gradientCenterX,
                gradientCenterY:draft.gradientCenterY,gradientReverse:draft.gradientReverse,
              }};setSaved(next);try{localStorage.setItem('huelith-gradient-presets-v1',JSON.stringify(next));}catch{/* optional local storage */}
            }}>◇ Save look</button>
            <select aria-label="Load saved gradient look" value="" onChange={event=>{
              const preset=saved[event.target.value];if(preset){snapshot({...draft,...preset});setSelectedId(preset.gradientTransformStack?.at(-1)?.id??null);}
            }}><option value="">Open saved look…</option>{Object.keys(saved).map(name=><option key={name} value={name}>{name}</option>)}</select>
          </div>
          <div className="hte-creative-tip"><strong>✦ Atelier tip</strong><p>Try Starburst → Twirl → Wave, or combine Crystal Bloom with Aurora Curtains. Disable any recipe to compare.</p></div>
        </aside>
      </div>
      <footer className="hte-footer"><span>Discrete radial patterns + 26 transforms · Editable Gradient layer</span><button onClick={onClose}>Cancel</button><button className="hte-apply" onClick={()=>onApply(draft)}>✦ Apply to layer</button></footer>
    </section>
  </div>;
}
