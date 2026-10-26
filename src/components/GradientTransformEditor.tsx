import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GradientTransformStep, VectorShape } from '../editor/types';
import { uid } from '../editor/types';
import { GRADIENT_TRANSFORMS, type GradientTransform } from '../editor/gradient-transforms';
import { paintGradientPreview } from '../editor/gradient';
import './GradientTransformEditor.css';

const CATEGORIES = ['Radial', 'Distort', 'Geometry', 'Light', 'Huelith'];
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
    paintGradientPreview(ctx, { id: 'preview', kind: 'gradient', x: 0, y: 0, width: 52, height: 36,
      fill: 'none', stroke: 'none', strokeWidth: 0, gradientMode: 'linear',
      gradientStops: colors.map((color, index) => ({ id: String(index), color, position: index / Math.max(1, colors.length - 1), opacity: 1 })),
      gradientTransform: kind }, 52, 36);
  }, [kind, colors.join(':')]);
  return <canvas ref={ref} width="52" height="36" />;
}

export default function GradientTransformEditor({ source, name, onApply, onClose }: {
  source: VectorShape; name: string; onApply: (shape: VectorShape) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<VectorShape>(() => structuredClone(source));
  const [selectedId, setSelectedId] = useState<string | null>(source.gradientTransformStack?.at(-1)?.id ?? null);
  const [category, setCategory] = useState('Radial');
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
      showOriginal ? {...draft, gradientTransform:'none', gradientTransformStack:[]} : draft,
      canvas.width,canvas.height), 55);
    return () => window.clearTimeout(timer);
  }, [draft, showOriginal]);
  const point = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left)/rect.width)),
      y: Math.min(1, Math.max(0,(event.clientY-rect.top)/rect.height)) };
  };
  const saveCenter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (centerDrag.current !== event.pointerId || !selected) return;
    const value = point(event);
    patch(next => {
      const item = next.gradientTransformStack?.find(entry => entry.id === selected.id);
      if(item) { item.centerX = value.x; item.centerY = value.y; }
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
        <aside className="hte-library"><div className="hte-section-heading"><span>01</span> TRANSFORM LIBRARY</div>
          <input className="hte-search" placeholder="Search 26 creative transforms…" aria-label="Search gradient transforms"
            value={search} onChange={event=>setSearch(event.target.value)} />
          <nav aria-label="Transformation categories">{CATEGORIES.map(item => <button key={item} className={category===item?'selected':''} onClick={()=>setCategory(item)}>{item}</button>)}</nav>
          <div className="hte-transform-cards">{GRADIENT_TRANSFORMS.filter(item => item.id!=='none' && (search || category===item.category) && (!search || (item.name+' '+item.description).toLowerCase().includes(search.toLowerCase()))).map(item => <button
            key={item.id} className="hte-transform-card" title={item.description} disabled={stack.length>=24} onClick={()=>selectKind(item.id)}><TonePreview kind={item.id} colors={colors}/>
            <span><strong>{item.name}</strong><small>{item.description}</small></span><b>+</b></button>)}</div>
        </aside>
        <div className="hte-stage"><div className="hte-stage-meta"><span>LIVE PROCEDURAL PREVIEW</span><span>{Math.round(source.width)} × {Math.round(source.height)} · Full resolution on export</span></div>
          <div className="hte-stage-surround"><div className="hte-preview-frame" style={{transform:`scale(${zoom})`}}
              onPointerDown={event => { if(!selected || event.button!==0) return;
                setHistory(list=>[...list.slice(-39),structuredClone(draft)]);setFuture([]);
                centerDrag.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);saveCenter(event); }}
              onPointerMove={saveCenter} onPointerUp={event=>{if(centerDrag.current===event.pointerId){centerDrag.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}}>
              <canvas ref={preview} width={576} height={360} aria-label="Gradient transformation preview" />
              {selected && <div className="hte-center-handle" title="Drag to move transformation center" style={{left:`${selected.centerX*100}%`,top:`${selected.centerY*100}%`}}>✦</div>}
            </div></div>
          <div className="hte-stage-bar"><button className={showOriginal?'selected':''} onPointerDown={()=>setShowOriginal(true)} onPointerUp={()=>setShowOriginal(false)} onPointerLeave={()=>setShowOriginal(false)}>◉ Hold to compare</button><span>Drag the ✦ to reposition the transformation center</span>
            <button title="Zoom out" onClick={()=>setZoom(Math.max(.5,zoom-.1))}>−</button><output>{Math.round(zoom*100)}%</output><button title="Zoom in" onClick={()=>setZoom(Math.min(1.6,zoom+.1))}>+</button></div>
          <div className="hte-stack-heading"><strong>✧ Transformation stack</strong><span>Top to bottom · Non-destructive</span></div>
          <div className="hte-stack">{stack.length ? stack.map((item,index)=><div key={item.id} className={`hte-stack-node ${selectedId===item.id?'selected':''}`}>
            <button className="hte-stack-select" onClick={()=>setSelectedId(item.id)}><span>{index+1 < 10?'0':''}{index+1}</span><strong>{metadata.get(item.kind)?.name ?? item.kind}</strong></button>
            <button aria-label="Toggle transformation" title="Enable or disable" onClick={()=>editStack(items=>items.map(step=>step.id===item.id?{...step,enabled:!step.enabled}:step))}>{item.enabled?'◉':'○'}</button>
            <button aria-label="Move transformation up" title="Earlier" disabled={!index} onClick={()=>editStack(items=>{const copy=[...items];[copy[index-1],copy[index]]=[copy[index],copy[index-1]];return copy;})}>↑</button>
            <button aria-label="Move transformation down" title="Later" disabled={index===stack.length-1} onClick={()=>editStack(items=>{const copy=[...items];[copy[index],copy[index+1]]=[copy[index+1],copy[index]];return copy;})}>↓</button>
            <button aria-label="Duplicate transformation" title="Duplicate" onClick={()=>editStack(items=>{const copy=[...items];copy.splice(index+1,0,{...item,id:uid()});return copy;})}>⧉</button>
            <button aria-label="Delete transformation" title="Delete" onClick={()=>{editStack(items=>items.filter(step=>step.id!==item.id));setSelectedId(null);}}>×</button>
          </div>) : <div className="hte-empty">Choose a transformation to start building your look.</div>}</div>
        </div>
        <aside className="hte-properties"><div className="hte-section-heading"><span>02</span> RECIPE INSPECTOR</div>
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
          <div className="hte-presets"><div className="hte-section-heading"><span>03</span> SAVED LOOKS</div>
            <label>Preset name<input maxLength={42} value={presetName} onChange={event=>setPresetName(event.target.value)} placeholder="e.g. violet vortex"/></label>
            <button disabled={!presetName.trim()} onClick={()=>{
              const title=presetName.trim();const next={...saved,[title]:{
                gradientMode:draft.gradientMode,gradientStops:draft.gradientStops,
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
      <footer className="hte-footer"><span>26 creative transformations · Stored on the Gradient layer</span><button onClick={onClose}>Cancel</button><button className="hte-apply" onClick={()=>onApply(draft)}>✦ Apply to layer</button></footer>
    </section>
  </div>;
}
