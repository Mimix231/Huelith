import { useEffect, useRef, useState } from 'react';
import { AutoAwesome, Close, Search, Tune, Palette, ArrowBack } from '@mui/icons-material';
import { Slider } from '@mui/material';
import EffectAdvancedEditors, { PreviewColorInput } from './EffectAdvancedEditors';
import EffectIcon from './EffectIcon';
import EffectPreview from './EffectPreview';
import BufferedColorPicker from './BufferedColorPicker';
import { EFFECT_CONTROLS, EFFECT_PARAMETERS, FX_PRESETS } from '../editor/fx';
import { applyStudioRecipe, resetStudioEffect, saveStudioRecipe, studioRecipes } from '../editor/studio-presets';
import { FILTER_CATALOG } from '../editor/effect-catalog';
import {
  appliedStudioItems, createStudioFilter, createStudioPreset, moveStudioItem, CREATIVITY_FILTERS,
  LAYER_EFFECTS, STUDIO_CATEGORIES, type AppliedStudioItem, type StudioCategory,
} from '../editor/studio-catalog';
import type { EditorStore } from '../editor/store';
import { layerById, type BlendMode, type Effect, type Layer, type VectorShape } from '../editor/types';
import { useEditor } from '../editor/store';
import './FxStudio.css';

interface Props {
  state: EditorStore;
  active?: Layer;
  activeShape?: VectorShape;
  onClose: () => void;
}

interface EditingSession {
  title: string;
  category: StudioCategory;
  id: string;
  layerId: string;
}

const blendModes: BlendMode[] = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];

/** The thumb and its numeric label must track pointer input synchronously.
 * Image processing runs separately; it must never control the slider's value.
 */
function ResponsiveSlider({ value, min, max, step, label, unit = '', onPreview, onFinish }: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  unit?: string;
  onPreview: (value: number) => void;
  onFinish: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
    setDraft(value);
  }, [value]);

  return (
    <label className="fx-level studio-responsive-slider">
      <span>{label}<output>{Number(draft.toFixed(2))}{unit}</output></span>
      <Slider size="small" aria-label={label} min={min} max={max} step={step} value={draft}
        onChange={(_, raw) => {
          const next = raw as number;
          latest.current = next;
          setDraft(next);
          onPreview(next);
        }}
        onChangeCommitted={(_, raw) => {
          const final = raw as number;
          latest.current = final;
          setDraft(final);
          // Submit the exact released value even if the last onChange was
          // coalesced by React or MUI during an overloaded rendering frame.
          onFinish(final);
        }}
      />
    </label>
  );
}


/** One Studio transaction: temporary preview, explicit Apply, or full Cancel. */
export default function FxStudio({ state, active, activeShape, onClose }: Props) {
  const [category, setCategory] = useState<StudioCategory>('creativity');
  const [query, setQuery] = useState('');
  const [warning, setWarning] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetVersion, setPresetVersion] = useState(0);
  const [editorNotice, setEditorNotice] = useState('');
  const [editing, setEditing] = useState<EditingSession | null>(null);
  const [working, setWorking] = useState<Effect[]>([]);
  const current = useRef<Effect[]>([]);
  const scheduled = useRef<number | null>(null);
  const pending = useRef<{ layerId: string; effects: Effect[] } | null>(null);
  const writable = Boolean(active && !active.locked);
  const applied = appliedStudioItems(active?.effects ?? []);
  const relevant = applied.filter(item => item.category === category);
  const term = query.trim().toLowerCase();
  const matches = (label: string): boolean => label.toLowerCase().includes(term);

  function flushPreview(): void {
    if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
    scheduled.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) useEditor.getState().previewStudioEffects(next.layerId, next.effects);
  }

  function schedulePreview(id: string, effects: Effect[]): void {
    pending.current = { layerId: id, effects };
    // Submit at most one latest-value preview per display frame. The worker
    // independently drops obsolete jobs; the UI never waits for its pixels.
    if (scheduled.current === null) scheduled.current = requestAnimationFrame(flushPreview);
  }

  function begin(title: string, tab: StudioCategory, id: string, changes: Effect[]): void {
    if (!active || active.locked) return;
    const original = active.effects ?? [];
    if (original.length + changes.length > 64) {
      setWarning('This layer has reached the 64 processing-step limit. Remove an effect before adding another.');
      return;
    }
    setWarning('');
    setEditorNotice('');
    setShowAdvanced(false);
    const next = [...original, ...changes];
    current.current = next;
    setWorking(next);
    setEditing({ title, category: tab, id, layerId: active.id });
    useEditor.getState().previewStudioEffects(active.id, next);
  }

  function reopen(item: AppliedStudioItem): void {
    begin(item.title, item.category, item.id, []);
  }

  function change(effectId: string, patch: Partial<Effect>, sliderPreview = false): void {
    if (!editing) return;
    const next = current.current.map(effect => effect.id !== effectId ? effect : {
      ...effect,
      ...patch,
      parameters: patch.parameters ? { ...effect.parameters, ...patch.parameters } : effect.parameters,
    });
    current.current = next;
    if (!sliderPreview) setWorking(next);
    schedulePreview(editing.layerId, next);
  }


  function replaceEffect(effectId: string, convert: (effect: Effect) => Effect): void {
    if (!editing) return;
    const next = current.current.map(effect => effect.id === effectId ? convert(effect) : effect);
    current.current = next;
    setWorking(next);
    schedulePreview(editing.layerId, next);
  }

  function storeRecipe(effectId: string): void {
    const effect = current.current.find(item => item.id === effectId);
    if (!effect) return;
    const title = presetName.trim() || `${effect.kind} custom`;
    const saved = saveStudioRecipe(effect, title);
    setEditorNotice(saved ? `Saved preset “${title}”.` : 'Could not save preset (storage unavailable).');
    if (saved) { setPresetName(''); setPresetVersion(value => value + 1); }
  }

  function finishSlider(effectId: string, patch: Partial<Effect>): void {
    change(effectId, patch, true);
    flushPreview();
    setWorking(current.current);
  }

  function commitEditor(): void {
    flushPreview();
    setWorking(current.current);
  }

  function apply(): void {
    if (!editing) return;
    flushPreview();
    useEditor.getState().commitStudioEffects(editing.layerId, current.current);
    setEditing(null);
  }

  function cancel(): void {
    if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
    scheduled.current = null;
    pending.current = null;
    useEditor.getState().cancelStudioEffects();
    useEditor.getState().setFxBypassLayer(null);
    setEditing(null);
  }

  function dismiss(): void {
    if (editing) cancel();
    onClose();
  }

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismissRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
        useEditor.getState().cancelStudioEffects();
      useEditor.getState().setFxBypassLayer(null);
    };
  }, []);

  const editingEffects = editing ? appliedStudioItems(working).find(item => item.id === editing.id)?.effects ?? [] : [];
  const shownLibrary = category === 'creativity' ? CREATIVITY_FILTERS : category === 'effects' ? LAYER_EFFECTS : [];
  const groupNames = ['Color & light', 'Detail & texture', 'Stylize'];

  return (
    <div className="fx-overlay spectrum-studio-v3" id="spectrum-fx-studio" role="dialog"
      aria-modal="false" aria-label="Spectrum Studio">
      <div className="fx-overlay-header">
        <div className="fx-overlay-title">
          {editing ? (
            <button type="button" className="studio-icon-button" aria-label="Cancel and return to Studio"
              onClick={cancel}><ArrowBack fontSize="small" /></button>
          ) : <span className="fx-overlay-symbol"><AutoAwesome fontSize="small" /></span>}
          <div><strong>{editing?.title ?? 'Spectrum Studio'}</strong>
            <small>{editing ? `${STUDIO_CATEGORIES[editing.category]} · non-destructive editor`
              : 'Create, refine, and revisit'}</small></div>
        </div>
        <button type="button" aria-label="Close FX studio" className="fx-close" onClick={dismiss}>
          <Close fontSize="small" />
        </button>
      </div>
      {editing ? (
        <div className="studio-editor-view" key={editing.id}>
          <div className="studio-editor-intro">
            <EffectIcon kind={editingEffects[0]?.kind ?? editing.title} className="studio-editor-icon" />
            <div><strong>{editing.title}</strong><small>Changes preview on the canvas. Apply to keep them.</small></div>
          </div>
          <div className="studio-edit-toolbar" role="group" aria-label="Studio editor controls">
            <div className="studio-detail-switch" role="group" aria-label="Effect control detail">
              <button type="button" className={!showAdvanced ? 'selected' : ''} aria-pressed={!showAdvanced}
                onClick={() => setShowAdvanced(false)}>Basic</button>
              <button type="button" className={showAdvanced ? 'selected' : ''} aria-pressed={showAdvanced}
                onClick={() => setShowAdvanced(true)}>Advanced</button>
            </div>
            <button type="button" className="studio-compare-hold" aria-label="Hold for before comparison"
              onPointerDown={() => useEditor.getState().setFxBypassLayer(editing.layerId)}
              onPointerUp={() => useEditor.getState().setFxBypassLayer(null)}
              onPointerCancel={() => useEditor.getState().setFxBypassLayer(null)}
              onPointerLeave={() => useEditor.getState().setFxBypassLayer(null)}
              onBlur={() => useEditor.getState().setFxBypassLayer(null)}>◉ Before / after</button>
          </div>
          {editorNotice && <p className="studio-edit-notice" role="status">{editorNotice}</p>}
          <div className="studio-effect-scroll">
            {editingEffects.map((effect, index) => {
              const descriptor = EFFECT_CONTROLS[effect.kind];
              return (
                <section key={effect.id} className="studio-editor-section">
                  {editingEffects.length > 1 && <h3>{index + 1}. {FILTER_CATALOG.find(item => item.kind === effect.kind)?.label ?? effect.kind}</h3>}
                  <div className="studio-recipe-controls" role="group" aria-label={`Presets for ${effect.kind}`}>
                    <button type="button" aria-label={`Reset ${effect.kind}`} title="Restore effect defaults"
                      onClick={() => replaceEffect(effect.id, resetStudioEffect)}>Reset</button>
                    <select aria-label={`${effect.kind} saved presets`} key={`recipes-${effect.kind}-${presetVersion}`}
                      defaultValue="" onChange={event => {
                        const recipe = studioRecipes(effect.kind).find(item => item.name === event.target.value);
                        if (recipe) { replaceEffect(effect.id, previous => applyStudioRecipe(previous, recipe)); setEditorNotice(`Loaded preset “${recipe.name}”.`); }
                        event.currentTarget.value = '';
                      }}>
                      <option value="">Load preset…</option>
                      {studioRecipes(effect.kind).map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
                    </select>
                    <input type="text" maxLength={56} aria-label={`${effect.kind} preset name`} placeholder="Preset name"
                      value={presetName} onChange={event => setPresetName(event.target.value)} />
                    <button type="button" aria-label={`Save ${effect.kind} preset`} onClick={() => storeRecipe(effect.id)}>Save</button>
                  </div>
                  <label className="studio-toggle">
                    <input type="checkbox" checked={effect.enabled}
                      onChange={event => change(effect.id, { enabled: event.target.checked })} /> Enabled
                  </label>
                  <ResponsiveSlider key={`${effect.id}-amount`} label={`${effect.kind} ${descriptor.label}`}
                    value={effect.amount} min={descriptor.min} max={descriptor.max} step={descriptor.step}
                    unit={descriptor.unit}
                    onPreview={amount => change(effect.id, { amount }, true)}
                    onFinish={amount => finishSlider(effect.id, { amount })} />
                  {showAdvanced && <EffectAdvancedEditors effect={effect} preview={parameters => change(effect.id, { parameters }, true)} commit={commitEditor} />}
                  {(EFFECT_PARAMETERS[effect.kind] ?? []).filter((control, controlIndex) =>
                    (showAdvanced || controlIndex < 3) &&
                    !(effect.kind === 'glow' && control.key === 'threshold' && effect.parameters?.glowMode !== 'bloom') &&
                    !(effect.kind === 'backdrop' && control.key === 'angle' && effect.parameters?.backdropMode !== 'gradient')
                  ).map(control => {
                    const raw = (effect.parameters as Record<string, unknown> | undefined)?.[control.key];
                    const value = typeof raw === 'number' ? raw : control.initial;
                    return (
                      <ResponsiveSlider key={`${effect.id}-${control.key}`} label={`${effect.kind} ${control.label}`}
                        value={value} min={control.min} max={control.max} step={control.step ?? 1}
                        unit={control.unit ?? ''}
                        onPreview={amount => change(effect.id, { parameters: { [control.key]: amount } }, true)}
                        onFinish={amount => finishSlider(effect.id, { parameters: { [control.key]: amount } })} />
                    );
                  })}
                  {showAdvanced && (['chromatic', 'glitch', 'vhs', 'sig_4', 'sig_8', 'sig_13'].includes(effect.kind)) && (
                    <div className="studio-color-pair" aria-label="Distortion color palette">
                      <label>First channel
                        <PreviewColorInput label={`${effect.kind} first channel color`}
                          value={effect.parameters?.colorA ?? '#ff355e'}
                          onPreview={color => change(effect.id, { parameters: { colorA: color } }, true)} onCommit={commitEditor} />
                      </label>
                      <label>Second channel
                        <PreviewColorInput label={`${effect.kind} second channel color`}
                          value={effect.parameters?.colorB ?? '#2caaff'}
                          onPreview={color => change(effect.id, { parameters: { colorB: color } }, true)} onCommit={commitEditor} />
                      </label>
                    </div>
                  )}
                  {showAdvanced && effect.kind === 'sig_0' && (
                    <label className="studio-mask-mode">Outline subject detection
                      <select aria-label="Outline subject detection" value={effect.parameters?.silhouetteMode ?? 'auto'}
                        onChange={event => change(effect.id, { parameters: { silhouetteMode: event.target.value as 'auto' | 'alpha' | 'edge' } })}>
                        <option value="auto">Auto: subject or visible edges</option>
                        <option value="alpha">Transparency only</option>
                        <option value="edge">Image edges</option>
                      </select>
                    </label>
                  )}
                  {(['glow', 'outline', 'backdrop', 'neonedge', 'radiance', 'miasma', 'foil', 'chromaticsilk'].includes(effect.kind) || effect.kind.startsWith('sig_')) && (
                    <label className="fx-customize-row"><span>Color</span>
                      <PreviewColorInput label={`${effect.kind} color`} value={effect.color ?? '#986dff'}
                        onPreview={color => change(effect.id, { color }, true)} onCommit={commitEditor} />
                    </label>
                  )}
                </section>
              );
            })}
          </div>
          <div className="studio-editor-footer">
            <button type="button" onClick={cancel}>Cancel</button>
            <button type="button" className="studio-apply" onClick={apply}>Apply</button>
          </div>
        </div>
      ) : (
        <>
          <div className="fx-studio-tabs" role="tablist" aria-label="Spectrum Studio categories">
            {(['creativity', 'effects', 'fx'] as const).map(tab => (
              <button key={tab} type="button" role="tab" aria-selected={category === tab}
                className={category === tab ? 'active' : ''} onClick={() => { setCategory(tab); setQuery(''); }}>
                {tab === 'creativity' ? <Tune fontSize="small" /> : tab === 'effects'
                  ? <Palette fontSize="small" /> : <AutoAwesome fontSize="small" />}
                <span>{STUDIO_CATEGORIES[tab]}</span>
              </button>
            ))}
          </div>
          <label className="fx-search"><Search fontSize="small" />
            <input type="search" aria-label="Search Studio library" placeholder="Find a creative tool…"
              value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <div className="fx-overlay-body studio-library-body">
            {warning && <p role="alert" className="fx-notice">{warning}</p>}
            {!active && <p className="fx-notice">Select a layer to work on.</p>}
            {active?.locked && <p className="fx-notice">Unlock this layer to edit its appearance.</p>}
            {category !== 'fx' && <div className="fx-filter-groups">
              {(category === 'creativity' ? groupNames : ['Stylize', 'Creative effects']).map(group => {
                const entries = shownLibrary.filter(item => (item.group === group || (category === 'effects' && group === 'Stylize' && item.group === 'Stylize')) && matches(item.label));
                if (!entries.length) return null;
                return <section key={group}>
                  <h3>{group}</h3><div className="fx-filter-grid">
                    {entries.map(item => <button key={item.kind} type="button" className="fx-filter-card"
                      disabled={!writable || (active?.effects?.length ?? 0) >= 64} onClick={() => {
                        const effect = createStudioFilter(item.kind);
                        begin(item.kind === 'cutout' ? 'Remove background' : item.label, category, effect.id, [effect]);
                      }} title={`Open ${item.label} editor`}>
                      <EffectIcon kind={item.kind} className="fx-filter-mark" />
                      <EffectPreview kind={item.kind} className="fx-filter-live-preview" />
                      <span>{item.kind === 'cutout' ? 'Remove background' : item.label}</span>
                    </button>)}
                  </div>
                </section>;
              })}
            </div>}
            {category === 'fx' && <div className="fx-presets"><h3>Spectrum signature FX</h3>
              <p className="fx-subtle">Dedicated Spectrum FX renderers with independently editable parameters. Old chain-based projects still work.</p>
              <div className="fx-preset-grid">
                {Object.keys(FX_PRESETS).filter(matches).map(name => <button type="button"
                  className="fx-preset-card" key={name}
                  disabled={!writable || (active?.effects?.length ?? 0) + FX_PRESETS[name].length > 64} onClick={() => {
                    const effects = createStudioPreset(name);
                    begin(name, 'fx', effects[0].studioGroupId!, effects);
                  }}>
                  <div className="fx-preset-visual"><EffectIcon kind={name} className="fx-preset-art" />
                    <EffectPreview preset={name} className="fx-preset-live-preview" /></div>
                  <strong>{name}</strong><small>Editable preset</small>
                </button>)}
              </div>
            </div>}
            <section className="studio-applied-section">
              <div className="fx-applied-heading"><h3>Applied {category === 'creativity' ? 'Filters' : STUDIO_CATEGORIES[category]}</h3><span>{relevant.length}</span></div>
              <div className="studio-applied-grid">
                {relevant.map(item => <div key={item.id} className="studio-applied-tile">
                  <button type="button" className="studio-app-icon" onClick={() => reopen(item)}
                    aria-label={`Edit ${item.title}`} disabled={!writable}>
                    <EffectIcon kind={item.icon} />
                  </button><span title={item.title}>{item.title}</span>
                  <div className="studio-app-actions">
                    <button type="button" disabled={!writable || item.startIndex === 0}
                      title="Move earlier" aria-label={`Move ${item.title} earlier`}
                      onClick={() => active && state.mutate(doc => {
                        const layer = layerById(doc, active.id);
                        if (layer?.effects) layer.effects = moveStudioItem(layer.effects, item.id, -1);
                      })}>↑</button>
                    <button type="button" disabled={!writable || item.startIndex === (active?.effects?.length ?? 0) - item.effects.length}
                      title="Move later" aria-label={`Move ${item.title} later`}
                      onClick={() => active && state.mutate(doc => {
                        const layer = layerById(doc, active.id);
                        if (layer?.effects) layer.effects = moveStudioItem(layer.effects, item.id, 1);
                      })}>↓</button>
                    <button type="button" disabled={!writable} title="Toggle" aria-label={`Toggle ${item.title}`}
                      onClick={() => active && state.mutate(doc => {
                        const layer = layerById(doc, active.id);
                        if (layer) for (const fx of layer.effects ?? []) {
                          if (item.effects.some(current => current.id === fx.id)) fx.enabled = !item.effects[0].enabled;
                        }
                      })}>{item.effects.every(fx => fx.enabled) ? '◉' : '○'}</button>
                    <button type="button" disabled={!writable} title="Remove" aria-label={`Remove ${item.title}`}
                      onClick={() => active && state.mutate(doc => {
                        const layer = layerById(doc, active.id);
                        if (layer) layer.effects = layer.effects?.filter(fx => !item.effects.some(current => current.id === fx.id));
                      })}>×</button>
                  </div>
                </div>)}
                {!relevant.length && <p className="fx-subtle">Nothing applied yet.</p>}
              </div>
            </section>
            {category === 'effects' && <section className="fx-customize studio-customize">
              <h3>Layer / vector customization</h3>
              {activeShape && <>
                <label className="fx-customize-row"><span>Fill</span><BufferedColorPicker label="Object fill"
                  value={activeShape.fill === 'none' ? '#ffffff' : activeShape.fill}
                  onCommit={fill => state.updateShape(activeShape.id, shape => { shape.fill = fill; })} /></label>
                <label className="fx-customize-row"><span>Stroke</span><BufferedColorPicker label="Object stroke"
                  value={activeShape.stroke === 'none' ? '#000000' : activeShape.stroke}
                  onCommit={stroke => state.updateShape(activeShape.id, shape => { shape.stroke = stroke; })} /></label>
              </>}
              {active && <label className="fx-customize-row"><span>Blend mode</span>
                <select disabled={!writable} value={active.blend} aria-label="Layer blending"
                  onChange={event => state.setLayerBlend(active.id, event.target.value as BlendMode)}>
                  {blendModes.map(blend => <option key={blend} value={blend}>{blend === 'source-over' ? 'Normal' : blend}</option>)}
                </select>
              </label>}
            </section>}
          </div>
          <div className="fx-overlay-footer"><button type="button" className="fx-compare"
            disabled={!active || !(active.effects?.length)}
            onPointerDown={() => active && state.setFxBypassLayer(active.id)}
            onPointerUp={() => state.setFxBypassLayer(null)} onPointerLeave={() => state.setFxBypassLayer(null)}>
            ◉ Hold to compare
          </button><button type="button" onClick={dismiss}>Done</button></div>
        </>
      )}
    </div>
  );
}
