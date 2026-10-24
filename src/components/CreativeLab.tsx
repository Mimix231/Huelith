import { useMemo, useState } from 'react';
import { activeTab, useEditor } from '../editor/store';
import {
  CREATIVE_DEFINITIONS, evaluatedCreative, setCreativeKeyframe,
  type CreativeObject, type CreativeKind,
} from '../editor/creative';
import './CreativeLab.css';

const variantLabels: Partial<Record<CreativeKind, string[]>> = {
  atmosphere: ['Miasma', 'Mist', 'Smoke', 'Embers', 'Magic energy', 'Frost', 'Dust'],
  materialForge: ['Crystal', 'Metal', 'Ice', 'Fabric', 'Stone', 'Energy'],
  shockDesigner: ['Psychological shock', 'Impact shock', 'Reality fracture', 'Spatial collapse'],
};

const icons: Record<CreativeKind, string> = {
  colorSculptor: '◉', atmosphere: '☁', lightSculptor: '☀', materialForge: '❖',
  shockDesigner: '◎', livingInk: '✎', motionEcho: '≋', paletteFlow: '🌈',
  sceneCards: '▥', timeSculptor: '◆',
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
  const frame = doc.animation?.currentFrame ?? 0;
  const item = doc.creative?.find(entry => entry.id === selectedId);
  const displayed = draft?.id === selectedId ? draft : item;
  const evaluated = displayed ? evaluatedCreative(displayed, frame) : null;
  const definition = useMemo(() => CREATIVE_DEFINITIONS.find(def => def.kind === displayed?.kind), [displayed?.kind]);

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
    <aside className="creative-lab" aria-label="Spectrum Originals Creative Lab">
      <div className="creative-head">
        <div><strong>◈ Spectrum Originals</strong><small>Editable artwork · keyframed in animations</small></div>
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
          <label className="creative-switch"><input type="checkbox" checked={displayed.enabled}
            onChange={(event: { target: HTMLInputElement }) => useEditor.getState().updateCreative(displayed.id, { enabled: event.target.checked })} /> Enabled</label>
          {(displayed.kind === 'livingInk') && <button type="button" className={drawMode ? 'creative-action active' : 'creative-action'}
            onClick={() => useEditor.getState().setCreativeDrawMode(!drawMode)}>
            {drawMode ? 'Finish drawing' : '✎ Draw an editable path on canvas'}
          </button>}
          {(['sceneCards', 'timeSculptor', 'motionEcho'] as CreativeKind[]).includes(displayed.kind) && <label className="creative-field">
            <span>Target layer</span>
            <select value={displayed.layerId ?? ''} onChange={(event: { target: HTMLSelectElement }) => {
              preview('layerId', event.target.value); commit();
            }}>
              <option value="">Entire composition</option>
              {doc.layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
            </select>
          </label>}
          {(['x', 'y', 'radius', 'intensity', ...Object.keys(definition.controls)] as const).map(key => {
            const def = definition.controls[key];
            const min = def?.min ?? (key === 'intensity' ? 0 : key === 'radius' ? 5 : -2000);
            const max = def?.max ?? (key === 'intensity' ? 100 : key === 'radius' ? Math.max(doc.width, doc.height) : 2000);
            const step = def?.step ?? 1;
            const v = key in evaluated.controls ? evaluated.controls[key] : evaluated[key as 'x' | 'y' | 'radius' | 'intensity'];
            const variants = key === 'material' || key === 'mode' ? variantLabels[displayed.kind] : undefined;
            if (variants) return <label className="creative-field" key={key}>
              <span>{key === 'mode' ? 'Distortion mode' : 'Material'}
                {doc.animation && <button type="button" title={`Keyframe ${key}`} onClick={() => addKeyframe(key)}>◆</button>}
              </span>
              <select value={Math.round(Number(v))} onChange={(event: { target: HTMLSelectElement }) => {
                preview(key, Number(event.target.value));
                // preview commits on next microtask to avoid stale Zustand state
                queueMicrotask(() => useEditor.getState().commitCreativePreview());
              }}>
                {variants.map((label, index) => <option key={label} value={index}>{label}</option>)}
              </select>
            </label>;
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
