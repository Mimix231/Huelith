import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { activeTab, useEditor } from '../editor/store';
import {
  CREATIVE_DEFINITIONS, evaluatedCreative, setCreativeKeyframe,
  type CreativeObject, type CreativeKind,
} from '../editor/creative';
import { renderCreative } from '../editor/creative-render';
import './CreativeLab.css';

/** Kind-specific design starting points, not aliases for unrelated effects. */
const creativeLooks: Record<CreativeKind, {name:string; changes:Record<string,number>}[]> = {
  colorSculptor:[{name:'Selective hue',changes:{hue:305,tolerance:18,feather:12}},{name:'Soft recolor',changes:{hue:210,tolerance:85,feather:72}}],
  atmosphere:[{name:'Soft haze',changes:{density:26,turbulence:12,particles:45}},{name:'Storm front',changes:{density:90,turbulence:86,windX:65,particles:180}}],
  lightSculptor:[{name:'Spotlight',changes:{cone:36,softness:22,wrap:0}},{name:'Softbox',changes:{cone:270,softness:95,wrap:70}}],
  materialForge:[{name:'Shattered ice',changes:{material:2,scale:14,roughness:20}},{name:'Worn surface',changes:{material:3,scale:72,roughness:88}}],
  shockDesigner:[{name:'Impact pulse',changes:{mode:1,distortion:78,spread:35}},{name:'Lens bend',changes:{mode:2,distortion:25,spread:90}}],
  livingInk:[{name:'Fine calligraphy',changes:{width:5,taper:88,texture:6}},{name:'Bold ink',changes:{width:36,taper:22,texture:55}}],
  motionEcho:[{name:'Short exposure',changes:{history:2,decay:83,offsetX:8}},{name:'Long trail',changes:{history:7,decay:55,offsetX:32}}],
  paletteFlow:[{name:'Calm ribbons',changes:{frequency:3,warp:18,angle:40}},{name:'Chaotic flow',changes:{frequency:13,warp:94,angle:-70}}],
  sceneCards:[{name:'Near field',changes:{depth:20,cameraX:10}},{name:'Deep parallax',changes:{depth:145,cameraX:64,cameraY:-35}}],
  timeSculptor:[{name:'Slow pan',changes:{offsetX:38,rotation:0,scale:100}},{name:'Dolly spin',changes:{offsetY:-35,rotation:36,scale:133}}],
  particleGarden:[{name:'Floating embers',changes:{count:35,gravity:-15,speed:24,particleSize:7}},{name:'Meteor shower',changes:{count:210,gravity:80,speed:90,spread:45}}],
  warpCage:[{name:'Gentle bend',changes:{warpX:12,warpY:18,falloff:90}},{name:'Hard pull',changes:{warpX:115,warpY:-70,falloff:25}}],
  lightTrails:[{name:'Laser filaments',changes:{width:3,glow:95,pulse:60}},{name:'Soft ribbon',changes:{width:26,glow:35,pulse:12}}],
  patternArchitect:[{name:'Mandala',changes:{symmetry:16,rings:6,shape:2}},{name:'Deco tiles',changes:{symmetry:8,rings:4,shape:1}}],
  gradientReactor:[{name:'Aurora vortex',changes:{twist:125,repeats:7,falloff:72}},{name:'Soft iris',changes:{twist:12,repeats:2,falloff:95}}],
};

const variantLabels: Partial<Record<CreativeKind, string[]>> = {
  atmosphere: ['Miasma', 'Mist', 'Smoke', 'Embers', 'Magic energy', 'Frost', 'Dust'],
  materialForge: ['Crystal', 'Metal', 'Ice', 'Fabric', 'Stone', 'Energy'],
  shockDesigner: ['Psychological shock', 'Impact shock', 'Reality fracture', 'Spatial collapse'],
};

const icons: Record<CreativeKind, string> = {
  colorSculptor: '◉', atmosphere: '☁', lightSculptor: '☀', materialForge: '❖',
  shockDesigner: '◎', livingInk: '✎', motionEcho: '≋', paletteFlow: '🌈',
  sceneCards: '▥', timeSculptor: '◆',
  particleGarden: '✦', warpCage: '⬡', lightTrails: '〰', patternArchitect: '✿', gradientReactor: '◈',
};

function updateValue(item: CreativeObject, key: string, value: number | string): CreativeObject {
  const copy = structuredClone(item);
  if (key in copy.controls && typeof value === 'number') copy.controls[key] = value;
  else if (key === 'color' || key === 'secondary') copy[key] = String(value);
  else if (key === 'x' || key === 'y' || key === 'radius' || key === 'intensity') {
    if (typeof value === 'number') copy[key] = value;
  } else if (key === 'layerId') copy.layerId = String(value);
  return copy;
}

export default function CreativeLab() {
  const doc = useEditor(state => activeTab(state).doc);
  const open = useEditor(state => state.creativePanelOpen);
  const selectedId = useEditor(state => state.selectedCreativeId);
  const draft = useEditor(state => state.creativePreview);
  const drawMode = useEditor(state => state.creativeDrawMode);
  const [filter, setFilter] = useState('');
  const creativePreviewCanvas=useRef<HTMLCanvasElement>(null);
  const [presetName, setPresetName] = useState('');
  const [originalPresets, setOriginalPresets] = useState<Record<string, { kind: CreativeKind;
    controls: Record<string, number>; radius: number; intensity: number; color: string; secondary: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('huelith-original-presets-v1') ?? '{}') as Record<string, {kind: CreativeKind; controls: Record<string, number>; radius: number; intensity: number; color: string; secondary: string}>; }
    catch { return {}; }
  });
  const frame = doc.animation?.currentFrame ?? 0;
  const item = doc.creative?.find(entry => entry.id === selectedId);
  const displayed = draft?.id === selectedId ? draft : item;
  const evaluated = displayed ? evaluatedCreative(displayed, frame) : null;
  const definition = useMemo(() => CREATIVE_DEFINITIONS.find(def => def.kind === displayed?.kind), [displayed?.kind]);

  useEffect(() => {
    if (!open || !evaluated || !creativePreviewCanvas.current) return;
    const canvas=creativePreviewCanvas.current;
    const next=requestAnimationFrame(()=>{
      const ctx=canvas.getContext('2d'); if(!ctx) return;
      const w=canvas.width,h=canvas.height;
      const gradient=ctx.createLinearGradient(0,0,w,h);
      gradient.addColorStop(0,'#243044');gradient.addColorStop(.6,'#111725');gradient.addColorStop(1,'#372547');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#8793b255';ctx.fillRect(w*.16,h*.22,w*.68,h*.56);
      ctx.fillStyle='#dde6fa';ctx.font='bold 20px system-ui';ctx.fillText('HUELITH',w*.23,h*.53);
      const ratio=Math.min(w/Math.max(1,doc.width),h/Math.max(1,doc.height));
      const sample={...evaluated,x:evaluated.x*ratio,y:evaluated.y*ratio,radius:evaluated.radius*ratio,
        points:evaluated.points?.map(point=>({x:point.x*ratio,y:point.y*ratio}))};
      try {renderCreative(ctx,{...doc,width:w,height:h,creative:[sample],animation:undefined,creativeFrame:0});}
      catch { /* A missing frame/layer isn't fatal to editing the Original. */ }
    });
    return ()=>cancelAnimationFrame(next);
  },[open,displayed,frame,doc.width,doc.height]);

  function preview(key: string, value: number | string): void {
    if (!displayed) return;
    const updated = updateValue(displayed, key, value);
    // Animation edit mode is auto-keyed, so sliders show the new value rather
    // than being overridden by the previous interpolation on every render.
    if (doc.animation && key !== 'layerId') setCreativeKeyframe(updated, key, frame);
    useEditor.getState().previewCreative(updated);
  }
  function commit(key?: string): void {
    const state = useEditor.getState();
    if (!state.creativePreview) return;
    const pending = structuredClone(state.creativePreview);
    if (key && doc.animation && pending.tracks?.[key]?.some(k => k.frame === frame)) {
      setCreativeKeyframe(pending, key, frame);
      state.previewCreative(pending);
    }
    state.commitCreativePreview();
  }
  function movePosition(event: ReactPointerEvent<HTMLDivElement>, finish = false): void {
    if (!displayed) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(doc.width, (event.clientX - bounds.left) / bounds.width * doc.width));
    const y = Math.max(0, Math.min(doc.height, (event.clientY - bounds.top) / bounds.height * doc.height));
    // One immutable preview avoids mutating the saved Original until release.
    const next = updateValue(updateValue(displayed, 'x', x), 'y', y);
    if (doc.animation) { setCreativeKeyframe(next, 'x', frame); setCreativeKeyframe(next, 'y', frame); }
    useEditor.getState().previewCreative(next);
    if (finish) commit();
  }
  function addKeyframe(key: string): void {
    if (!displayed || !evaluated || !doc.animation) return;
    const updated = structuredClone(displayed);
    const value = key in evaluated.controls
      ? evaluated.controls[key] : (evaluated as unknown as Record<string, number | string>)[key];
    if (key in updated.controls && typeof value === 'number') updated.controls[key] = value;
    else if (key === 'color' || key === 'secondary') updated[key] = String(value);
    else if (['x', 'y', 'radius', 'intensity'].includes(key) && typeof value === 'number') {
      (updated as unknown as Record<string, number>)[key] = value;
    }
    setCreativeKeyframe(updated, key, frame);
    useEditor.getState().previewCreative(updated);
    useEditor.getState().commitCreativePreview();
  }

  if (!open) return null;
  return (
    <aside className="creative-lab" aria-label="Huelith Originals Studio">
      <div className="creative-head">
        <div><strong>◈ Huelith Originals</strong><small>Editable artwork · keyframed in animations</small></div>
        <button type="button" title="Close Creative Lab" onClick={() => useEditor.getState().setCreativePanelOpen(false)}>×</button>
      </div>
      <div className="creative-content">
        <input className="creative-search" aria-label="Search creative tools" placeholder="Find a creative tool…"
          value={filter} onChange={(event: { target: HTMLInputElement }) => setFilter(event.target.value)} />
        <div className="creative-library">
          {CREATIVE_DEFINITIONS.filter(def => `${def.name} ${def.description}`.toLowerCase().includes(filter.toLowerCase())).map(def => (
            <button key={def.kind} type="button" title={def.description}
              onClick={() => useEditor.getState().addCreative(def.kind)}>
              <span className="creative-symbol" style={{ color: def.color }}>{icons[def.kind]}</span>
              <span>{def.name}</span><span aria-hidden="true">＋</span>
            </button>
          ))}
        </div>
        {!!doc.creative?.length && <div className="creative-applied">
          <h4>Applied originals</h4>
          {doc.creative.map(object => (
            <button key={object.id} type="button" className={selectedId === object.id ? 'selected' : ''}
              onClick={() => useEditor.getState().selectCreative(object.id)}>
              <span>{icons[object.kind]}</span><span>{object.name}</span>
              {!!Object.keys(object.tracks ?? {}).length && <small>◆</small>}
            </button>
          ))}
        </div>}
        {displayed && evaluated && definition && <section className="creative-inspector">
          <div className="creative-inspector-title">
            <strong>{definition.name}</strong>
            <button title="Remove creative object" type="button" onClick={() => useEditor.getState().removeCreative(displayed.id)}>Delete</button>
          </div>
          <p>{definition.description}</p>
          <div className="creative-original-preset-bar">
            <label>Preset <input aria-label="Original preset name" placeholder="Name" maxLength={40} value={presetName}
              onChange={event => setPresetName(event.target.value)}/></label>
            <button type="button" title="Save all specialized properties for this Original" onClick={() => {
              const name = presetName.trim().slice(0, 40); if (!name) return;
              const next = { ...originalPresets, [`${displayed.kind}:${name}`]: {
                kind: displayed.kind, controls: { ...displayed.controls }, radius: displayed.radius,
                intensity: displayed.intensity, color: displayed.color, secondary: displayed.secondary,
              } }; setOriginalPresets(next);
              try { localStorage.setItem('huelith-original-presets-v1', JSON.stringify(next)); } catch { /* Optional local data */ }
            }}>Save</button>
            <select aria-label="Load Original preset" value="" onChange={event => {
              const entry = originalPresets[event.target.value]; if (!entry || entry.kind !== displayed.kind) return;
              useEditor.getState().updateCreative(displayed.id, {
                controls: { ...entry.controls }, radius: entry.radius, intensity: entry.intensity,
                color: entry.color, secondary: entry.secondary,
              });
            }}><option value="">Load preset…</option>
              {Object.keys(originalPresets).filter(key => originalPresets[key]?.kind === displayed.kind)
                .map(key => <option key={key} value={key}>{key.split(':').slice(1).join(':')}</option>)}
            </select>
            <button type="button" title="Restore this Original's initial control values" onClick={() =>
              useEditor.getState().updateCreative(displayed.id, { controls: Object.fromEntries(Object.entries(definition.controls).map(([key, control]) => [key, control.default])) })}>Reset</button>
          </div>
          <div className="creative-live-stage">
            <div className="creative-stage-heading"><strong>Original preview</strong><span>Actual rendering · scaled to fit</span></div>
            <canvas ref={creativePreviewCanvas} width={360} height={200} aria-label={`${definition.name} rendered preview`}/>
          </div>
          <section className="creative-quick-looks"><strong>{definition.name} · Quick looks</strong><div>
            {creativeLooks[displayed.kind].map(look=><button key={look.name} type="button"
              onClick={()=>useEditor.getState().updateCreative(displayed.id,{controls:{...displayed.controls,...look.changes}})}>
              {look.name}</button>)}
          </div><small>Editable starting points. All specialized controls remain available below.</small></section>
          <label className="creative-switch"><input type="checkbox" checked={displayed.enabled}
            onChange={(event: { target: HTMLInputElement }) => useEditor.getState().updateCreative(displayed.id, { enabled: event.target.checked })} /> Enabled</label>
          <div className="creative-section-label">Placement · {displayed.kind === 'lightSculptor' ? 'Light source' : displayed.kind === 'shockDesigner' ? 'Impact center' : 'Canvas position'}</div>
          <div className="creative-position">
            <div className="creative-position-pad" role="slider" tabIndex={0} aria-label="Original position on canvas"
              aria-valuetext={`${Math.round(evaluated.x)}, ${Math.round(evaluated.y)}`}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(evaluated.x / Math.max(1, doc.width) * 100)}
              onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); movePosition(event); }}
              onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) movePosition(event); }}
              onPointerUp={event => { movePosition(event, true); event.currentTarget.releasePointerCapture(event.pointerId); }}
              onPointerCancel={() => commit()}
              onKeyDown={event => {
                const step = event.shiftKey ? 20 : 4;
                const x = evaluated.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0);
                const y = evaluated.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0);
                if (x !== evaluated.x || y !== evaluated.y) {
                  event.preventDefault();
                  const next = updateValue(updateValue(displayed, 'x', Math.max(0, Math.min(doc.width, x))), 'y', Math.max(0, Math.min(doc.height, y)));
                  useEditor.getState().previewCreative(next); commit();
                }
              }}>
              <span className="creative-position-handle" style={{ left: `${evaluated.x / Math.max(1, doc.width) * 100}%`, top: `${evaluated.y / Math.max(1, doc.height) * 100}%` }} />
            </div>
            <div className="creative-position-info"><strong>Drag to position</strong><span>X {Math.round(evaluated.x)} · Y {Math.round(evaluated.y)}</span><small>Drag the handle or use arrow keys. Shift + arrows moves 20 px.</small></div>
          </div>
          {(displayed.kind === 'livingInk' || displayed.kind === 'lightTrails') && <button type="button" className={drawMode ? 'creative-action active' : 'creative-action'}
            onClick={() => useEditor.getState().setCreativeDrawMode(!drawMode)}>
            {drawMode ? 'Finish drawing' : '✎ Draw an editable path on canvas'}
          </button>}
          {(['sceneCards', 'timeSculptor', 'motionEcho', 'warpCage'] as CreativeKind[]).includes(displayed.kind) && <label className="creative-field">
            <span>Target layer</span>
            <select value={displayed.layerId ?? ''} onChange={(event: { target: HTMLSelectElement }) => {
              preview('layerId', event.target.value); commit();
            }}>
              <option value="">Entire composition</option>
              {doc.layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
            </select>
          </label>}
          {doc.animation && Object.keys(displayed.tracks ?? {}).length > 0 && <details className="creative-advanced" open>
            <summary>Animation · Keyframe interpolation</summary>
            <p className="creative-hint">Interpolation applies between each key and the next. Hold keeps a value fixed until the next key.</p>
            {Object.entries(displayed.tracks ?? {}).map(([property, keys]) =>
              <label className="creative-field" key={property}>
                <span>{property} ({keys.length} keys)</span>
                <select aria-label={`${property} interpolation`} value={keys[0]?.interpolation ?? 'linear'}
                  onChange={event => useEditor.getState().updateCreative(displayed.id, {
                    tracks: { ...displayed.tracks,
                      [property]: keys.map(key => ({ ...key,
                        interpolation: event.target.value as 'linear' | 'hold' | 'easeInOut' })) },
                  })}>
                  <option value="linear">Linear</option><option value="hold">Hold</option>
                  <option value="easeInOut">Ease in/out</option>
                </select>
              </label>)}
          </details>}
          {(displayed.kind === 'livingInk' || displayed.kind === 'lightTrails') && <details className="creative-advanced" open>
            <summary>Editable path nodes ({displayed.points?.length ?? 0})</summary>
            {(displayed.points ?? []).map((point, index) => <div className="creative-node-row" key={index}>
              <strong>Point {index + 1}</strong>
              <label>X <input type="number" value={Math.round(point.x)} onChange={event => { const updated = structuredClone(displayed); updated.points![index].x = Number(event.target.value); useEditor.getState().updateCreative(displayed.id, {points: updated.points}); }} /></label>
              <label>Y <input type="number" value={Math.round(point.y)} onChange={event => { const updated = structuredClone(displayed); updated.points![index].y = Number(event.target.value); useEditor.getState().updateCreative(displayed.id, {points: updated.points}); }} /></label>
              <button type="button" title="Delete point" onClick={() => useEditor.getState().updateCreative(displayed.id, {points: (displayed.points ?? []).filter((_, i) => i !== index)})}>×</button>
            </div>)}
            <button type="button" className="creative-action" onClick={() => useEditor.getState().updateCreative(displayed.id, {points: [...(displayed.points ?? []), {x: displayed.x, y: displayed.y}]})}>+ Add path point</button>
          </details>}
          <div className="creative-section-label">Main controls</div>
          {(['radius', 'intensity'] as const).map(key => {
            const def = definition.controls[key];
            const min = def?.min ?? (key === 'intensity' ? 0 : key === 'radius' ? 5 : -2000);
            const max = def?.max ?? (key === 'intensity' ? 100 : key === 'radius' ? Math.max(doc.width, doc.height) : 2000);
            const step = def?.step ?? 1;
            const v = key in evaluated.controls ? evaluated.controls[key] : evaluated[key as 'x' | 'y' | 'radius' | 'intensity'];
            return <label className="creative-field" key={key}>
              <span>{key.replace(/[A-Z]/g, match => ` ${match}`).replace(/^./, char => char.toUpperCase())}
                {doc.animation && <button type="button" title={`Add ${key} keyframe at frame ${frame + 1}`}
                  className={displayed.tracks?.[key]?.some(k => k.frame === frame) ? 'keyed' : ''}
                  onClick={() => addKeyframe(key)}>◆</button>}
              </span>
              <input type="range" min={min} max={max} step={step} value={v} onChange={(event: { target: HTMLInputElement }) => preview(key, Number(event.target.value))}
                onPointerUp={() => commit(key)} onKeyUp={() => commit(key)} onBlur={() => commit(key)} />
              <output>{Math.round(Number(v) * 10) / 10}</output>
            </label>;
          })}
          {Object.keys(definition.controls).length > 0 && <details className="creative-advanced" open>
            <summary>{definition.name} · Specialized controls</summary>
            {Object.keys(definition.controls).map(key => {
              const def = definition.controls[key];
              const v = evaluated.controls[key] ?? def.default;
              const variants = key === 'material' || key === 'mode' ? variantLabels[displayed.kind] : undefined;
              if (variants) return <label className="creative-field" key={key}><span>{key === 'mode' ? 'Distortion mode' : 'Material'}</span>
                <select value={Math.round(v)} onChange={event => { preview(key, Number(event.target.value)); queueMicrotask(() => useEditor.getState().commitCreativePreview()); }}>
                  {variants.map((name, index) => <option value={index} key={name}>{name}</option>)}
                </select></label>;
              return <label className="creative-field" key={key}><span>{key.replace(/[A-Z]/g, match => ` ${match}`).replace(/^./, char => char.toUpperCase())}
                {doc.animation && <button type="button" title={`Keyframe ${key}`} onClick={() => addKeyframe(key)}>◆</button>}</span>
                <input type="range" min={def.min} max={def.max} step={def.step} value={v}
                  onChange={event => preview(key, Number(event.target.value))}
                  onPointerUp={() => commit(key)} onKeyUp={() => commit(key)} onBlur={() => commit(key)} />
                <output>{Math.round(v * 10) / 10}</output></label>;
            })}
          </details>}
          <div className="creative-section-label">Colors</div>
          {(['color', 'secondary'] as const).map(key => (
            <label className="creative-field" key={key}><span>{key === 'color' ? 'Primary color' : 'Secondary color'}
              {doc.animation && <button type="button" title={`Keyframe ${key}`} onClick={() => addKeyframe(key)}>◆</button>}</span>
              <input type="color" aria-label={key} value={String(evaluated[key])}
                onChange={(event: { target: HTMLInputElement }) => preview(key, event.target.value)} onBlur={() => commit(key)} />
              <button type="button" onClick={() => commit(key)}>Apply</button>
            </label>
          ))}
          {doc.animation && <div className="creative-key-help">
            <strong>Time Sculptor · Frame {frame + 1}</strong>
            <p>Press ◆ beside a property to store a keyframe. Move the timeline marker, change its value, and press ◆ again. Numeric and color values interpolate across frames.</p>
            {Object.entries(displayed.tracks ?? {}).map(([name, keys]) => (
              <span key={name}>{name}: {keys.map(key => key.frame + 1).join(' → ')}</span>
            ))}
          </div>}
          <button type="button" className="creative-action" onClick={() => {
            const active = useEditor.getState();
            active.previewCreative(null);
            active.updateCreative(displayed.id, { tracks: undefined });
          }}>Clear keyframes</button>
        </section>}
      </div>
    </aside>
  );
}
