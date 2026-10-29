import { INK_PRESETS } from './ink-engine';
import {pixelSelection,clearPixelSelection} from './selection-mask';
import { newCreative, type CreativeKind, type CreativeObject } from './creative';
import { create } from 'zustand';
import { clampEffectAmount, forgetLayerEffectPreview, newEffect, queueLayerEffectPreview } from './fx';
import { boundedNumber } from './effect-schema';
import { setInteractiveEffectPreview } from './preview-quality';
import { syncActiveCel, enableAnimation, insertFrame, deleteFrame, reorderFrame, changeFps, changeOnion, changeFrameDuration, ensureTrackEffects, ensureTrackGradients, resolveTrackLayers, setTrackGradient, setTrackEffects, exposedLayers, releaseModifiedHolds,
  holdLayer, releaseHold, clearLayerCel, setFrameLabel, setPlaybackRegion, setFrameDurations, duplicateFrameRange,
  holdFrameRange, deleteFrameRange } from './animation';
import { DEFAULT_TEXT_FORMAT, normalizeTextFormat, reflowTextShape, type TextDraft, type TextFormat } from './typography';
import {
  createDocument, layerById, makeRaster, makeVector, makeGradient, uid,
  type Document, type Layer, type Tool, type GradientMode, type VectorShape, type Workspace, type Point, type SelectionRect, type BlendMode, type Effect, type EffectKind, type AppearanceMode, type OnionSkinSettings,
} from './types';

const HISTORY_LIMIT = 40;
const HISTORY_BUDGET = 48 * 1024 * 1024;
const historySizes = new WeakMap<Document, number>();

function historySize(doc: Document): number {
  const cached = historySizes.get(doc);
  if (cached !== undefined) return cached;
  const bytes = JSON.stringify(doc).length * 2;
  historySizes.set(doc, bytes);
  return bytes;
}

export function trimHistory(history: Document[]): Document[] {
  let size = 0;
  const retained: Document[] = [];
  for (let index = history.length - 1; index >= 0 && retained.length < HISTORY_LIMIT; index--) {
    const bytes = historySize(history[index]);
    if (retained.length && size + bytes > HISTORY_BUDGET) break;
    size += bytes;
    retained.unshift(history[index]);
  }
  return retained;
}

interface WorkspaceSettings {
  theme: Workspace;
  appearanceMode: AppearanceMode;
  inspectorOpen: boolean;
  toolsOpen: boolean;
  inspectorWidth: number;
}

function savedWorkspace(): WorkspaceSettings {
  const defaults: WorkspaceSettings = {
    theme: 'glass',
    appearanceMode: 'dark',
    inspectorOpen: true,
    toolsOpen: true,
    inspectorWidth: 236,
  };
  try {
    const theme = (localStorage.getItem('huelith-theme') ?? localStorage.getItem('spectrum-theme'));
    const raw = (localStorage.getItem('huelith-layout') ?? localStorage.getItem('spectrum-layout'));
    const layout = raw ? JSON.parse(raw) as Partial<WorkspaceSettings> : {};
    return {
      theme: ['glass', 'material', 'classic', 'midnight', 'studio', 'strawberry', 'melon', 'peach', 'lemon', 'mango', 'sakura', 'blossom', 'shadow'].includes(theme ?? '') ? theme as Workspace : defaults.theme,
      appearanceMode: layout.appearanceMode === 'light' || layout.appearanceMode === 'dark' ? layout.appearanceMode : defaults.appearanceMode,
      inspectorOpen: typeof layout.inspectorOpen === 'boolean' ? layout.inspectorOpen : defaults.inspectorOpen,
      toolsOpen: typeof layout.toolsOpen === 'boolean' ? layout.toolsOpen : defaults.toolsOpen,
      inspectorWidth: Number.isFinite(layout.inspectorWidth) ? Math.max(200, Math.min(420, layout.inspectorWidth!)) : defaults.inspectorWidth,
    };
  } catch {
    return defaults;
  }
}

function persistLayout(settings: Partial<WorkspaceSettings>): void {
  try {
    const previous = savedWorkspace();
    localStorage.setItem('huelith-layout', JSON.stringify({ ...previous, ...settings }));
  } catch { /* Offline and private mode remain usable. */ }
}

const clone = <T,>(value: T): T => structuredClone(value);

export interface EditorTab {
  doc: Document;
  past: Document[];
  future: Document[];
  dirty: boolean;
  path?: string;
  revision: number;
  savedRevision: number;
  savedDoc: Document;
}

export interface EditorStore {
  creativePanelOpen: boolean;
  selectedCreativeId: string | null;
  creativeDrawMode: boolean;
  creativePreview: CreativeObject | null;
  setCreativePanelOpen: (open: boolean) => void;
  selectCreative: (id: string | null) => void;
  setCreativeDrawMode: (on: boolean) => void;
  addCreative: (kind: CreativeKind) => void;
  updateCreative: (id: string, changes: Partial<CreativeObject>) => void;
  removeCreative: (id: string) => void;
  previewCreative: (preview: CreativeObject | null) => void;
  commitCreativePreview: () => void;
  tabs: EditorTab[];
  activeId: string;
  tool: Tool;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  fill: string;
  gradientMode: GradientMode;
  setGradientMode: (mode: GradientMode) => void;
  gradientSettings: Partial<VectorShape>;
  setGradientSettings: (changes: Partial<VectorShape>) => void;
  strokeWidth: number;
  opacity: number;
  hardness: number;
  smoothing: number;
  brushFlow: number;
  brushSpacing: number;
  inkTaper: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  brushPreset: string;
  rasterToolStrength: number;
  rasterToolTolerance: number;
  rasterToolContiguous: boolean;
  rasterPattern: 'star' | 'dots' | 'hatches';
  setRasterToolStrength: (value:number)=>void;
  setRasterToolTolerance: (value:number)=>void;
  setRasterToolContiguous: (value:boolean)=>void;
  setRasterPattern: (value:'star'|'dots'|'hatches')=>void;
  setBrushFlow: (value: number) => void;
  setBrushSpacing: (value: number) => void;
  setInkTaper: (value: number) => void;
  setPressureSize: (value: boolean) => void;
  setPressureOpacity: (value: boolean) => void;
  applyBrushPreset: (id: string) => void;
  symmetryX: boolean;
  setSymmetryX: (enabled: boolean) => void;
  zoom: number;
  pan: Point;
  workspace: Workspace;
  appearanceMode: AppearanceMode;
  grid: boolean;
  rulers: boolean;
  snap: boolean;
  setRulers: (enabled: boolean) => void;
  setSnap: (enabled: boolean) => void;
  selectedShapeId: string | null;
  textDefaults: TextFormat;
  textDraft: TextDraft | null;
  startTextDraft: (draft: TextDraft) => void;
  changeTextDraft: (patch: Partial<TextDraft>) => void;
  setTextFormat: (patch: Partial<TextFormat>) => void;
  commitTextDraft: () => void;
  cancelTextDraft: () => void;
  fxBypassLayerId: string | null;
  selectedNodeIndex: number | null;
  selection: SelectionRect | null;
  focusMode: boolean;
  inspectorOpen: boolean;
  toolsOpen: boolean;
  inspectorWidth: number;
  setHardness: (value: number) => void;
  setSmoothing: (value: number) => void;
  setSelection: (selection: SelectionRect | null) => void;
  selectNode: (index: number | null) => void;
  setFxBypassLayer: (id: string | null) => void;
  setFocusMode: (enabled: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setToolsOpen: (open: boolean) => void;
  setInspectorWidth: (width: number) => void;
  saveInspectorWidth: () => void;
  setLayerBlend: (id: string, blend: BlendMode) => void;
  applySelectionMask: (id: string) => void;
  clearLayerMask: (id: string) => void;
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  setBackgroundOpacity: (opacity: number) => void;
  swapColors: () => void;
  resetColors: () => void;
  setFill: (fill: string) => void;
  setStrokeWidth: (width: number) => void;
  setOpacity: (opacity: number) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setWorkspace: (workspace: Workspace) => void;
  setAppearanceMode: (mode: AppearanceMode) => void;
  reorderTabs: (sourceId: string, targetId: string) => void;
  renameDoc: (docId: string, name: string) => void;
  duplicateDoc: (docId: string) => void;
  setGrid: (grid: boolean) => void;
  selectShape: (id: string | null) => void;
  newDoc: (name?: string, width?: number, height?: number, background?: string, animation?: boolean) => void;
  makeAnimation: () => void;
  setActiveFrame: (index: number) => void;
  appendFrame: (duplicate?: boolean) => void;
  deleteActiveFrame: () => void;
  reorderAnimationFrames: (from: number, to: number) => void;
  setAnimationFps: (fps: number) => void;
  setOnion: (value: Partial<OnionSkinSettings>) => void;
  setFrameDuration: (index: number, ms: number) => void;
  setPlaybackRegion: (changes: Partial<NonNullable<import('./types').AnimationTrack['playback']>>) => void;
  setAnimationFrameLabel: (index: number, label: string) => void;
  setAnimationHold: (index: number, layerId: string, enabled: boolean) => void;
  clearAnimationCel: (index: number, layerId: string) => void;
  setAnimationFrameDurations: (indices: number[], ms: number) => void;
  duplicateAnimationFrames: (indices: number[]) => void;
  setAnimationHolds: (indices:number[], layerId:string, enabled:boolean) => void;
  deleteAnimationFrames: (indices:number[]) => void;
  openDoc: (doc: Document, path?: string) => void;
  closeDoc: (id: string) => void;
  activate: (id: string) => void;
  mutate: (edit: (doc: Document) => void) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (id: string, revision: number, path?: string) => void;
  addLayer: (type: 'raster' | 'vector') => void;
  addGradientLayer: (gradient: VectorShape) => void;
  updateGradientLayer: (layerId: string, update: (shape: VectorShape) => void) => void;
  addAdjustmentLayer: () => void;
  groupSelectedLayer: () => void;
  ungroupSelectedLayer: () => void;
  setClipToBelow: (id: string, enabled: boolean) => void;
  applyCutoutMask: (layerId: string, data: string, width: number, height: number,editable?: Extract<Extract<Layer,{type:'raster'}>['cutoutMask'],{editable?:unknown}>['editable']) => void;
  toggleCutoutMask: (layerId: string) => void;
  removeCutoutMask: (layerId: string) => void;
  duplicateLayer: () => void;
  removeLayer: () => void;
  selectLayer: (id: string) => void;
  moveLayer: (id: string, step: number) => void;
  toggleLayer: (id: string, field: 'visible' | 'locked') => void;
  renameLayer: (id: string, name: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  previewStudioEffects: (layerId: string, effects: Effect[]) => void;
  commitStudioEffects: (layerId: string, effects: Effect[]) => void;
  cancelStudioEffects: () => void;
  addEffect: (id: string, kind: EffectKind) => void;
  appendEffects: (id: string, effects: Effect[]) => void;
  updateEffect: (layerId: string, effectId: string, changes: Partial<Effect>) => void;
  previewEffect: (layerId: string, effectId: string, changes: Partial<Effect>) => void;
  finishEffectPreview: () => void;
  cancelEffectPreview: () => void;
  removeEffect: (layerId: string, effectId: string) => void;
  moveEffect: (layerId: string, effectId: string, direction: number) => void;
  addShape: (shape: VectorShape) => void;
  updateShape: (id: string, edit: (shape: VectorShape) => void) => void;
  removeShape: (id: string) => void;
}

function regenerateLayerIds(layer: Layer): void {
  layer.id = uid();
  if (layer.type === 'vector') {
    for (const shape of layer.shapes) shape.id = uid();
  }
  if (layer.type === 'gradient') layer.gradient.id = uid();
  if (layer.type === 'group') {
    for (const child of layer.children) regenerateLayerIds(child);
  }
}

function tabFor(doc: Document, path?: string): EditorTab {
  if (doc.animation) {
    // Open recovered and legacy files using the same persistent layer FX map
    // as playback/export. The active cel remains an exact document mirror.
    const stacks = ensureTrackEffects(doc);
    // Resolve both layer-wide payloads immediately on open; a legacy frame
    // mirror cannot override the Gradient Atelier recipe on first playback.
    const gradients = ensureTrackGradients(doc);
    doc.layers = resolveTrackLayers(exposedLayers(doc,doc.animation.currentFrame), stacks, gradients);
    const frame = doc.animation.frames[doc.animation.currentFrame];
    if (!frame.holdFrom || !Object.keys(frame.holdFrom).length) frame.layers = doc.layers;
    frame.activeLayerId = doc.activeLayerId;
  }
  return { doc, past: [], future: [], dirty: false, path, revision: 0, savedRevision: 0, savedDoc: doc };
}

/** Structural sharing keeps pasted raster pixel buffers out of every slider update. */
function copyEffectPath(layer: Layer, layerId: string, effectId: string): Layer {
  if (layer.id === layerId) {
    return {
      ...layer,
      effects: (layer.effects ?? []).map(effect => effect.id === effectId
        ? { ...effect, parameters: effect.parameters ? { ...effect.parameters } : undefined }
        : effect),
    };
  }
  return layer.type === 'group'
    ? { ...layer, children: layer.children.map(child => copyEffectPath(child, layerId, effectId)) }
    : layer;
}

interface StudioPreviewSession {
  documentId: string;
  layerId: string;
  original: Document;
  originalEffects: string;
}
let studioPreviewSession: StudioPreviewSession | null = null;

// Live Studio changes belong to the canvas preview, not the persisted Zustand
// document. Updating tabs on every slider tick caused App, the inspector, the
// timeline and every other store consumer to rerender unnecessarily.
let studioOverlay: { documentId: string; layerId: string; effects: Effect[] } | null = null;
const overlayCache = new WeakMap<Layer, { effects: Effect[]; result: Layer }>();

export function studioPreviewLayer(documentId: string, layer: Layer): Layer {
  if (!studioOverlay || studioOverlay.documentId !== documentId) return layer;
  const snapshot = overlayCache.get(layer);
  if (snapshot?.effects === studioOverlay.effects) return snapshot.result;
  const result = studioEffectPath(layer, studioOverlay.layerId, studioOverlay.effects, false);
  overlayCache.set(layer, { effects: studioOverlay.effects, result });
  return result;
}

function announceStudioPreview(layerId?: string, effects?: readonly Effect[]): void {
  // Worker previews can use their resident source directly; no need to redraw
  // every visible layer just to enqueue a new slider position.
  // Do not repaint the entire composition merely because the slider moved.
  // The exact worker completion repaints as soon as the next valid image is
  // available. An already completed exact image stays visible in the meantime.
  // A registered worker host can accept changes without a costly full-scene
  // Canvas2D repaint on every pointer event. Its exact-completion callback
  // schedules the repaint when new pixels genuinely exist. The first preview
  // and all non-worker fallbacks still paint immediately.
  const submitted = layerId && effects ? queueLayerEffectPreview(layerId, effects) : false;
  if (!submitted && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('huelith-studio-preview'));
  }
}

export function isStudioPreviewActive(layerId: string): boolean {
  return studioPreviewSession?.layerId === layerId;
}


/** Only the effected layer is copied while dragging. The previous document remains the undo baseline. */
function studioEffectPath(layer: Layer, layerId: string, effects: readonly Effect[], clone = true): Layer {
  // Temporary settings are already immutable per slider event. Cloning every
  // effect and its complex nested parameters on every paint frame caused a
  // measurable main-thread GC cost, especially in large historical FX stacks.
  if (layer.id === layerId) return { ...layer, effects: clone ? effects.map(effect => structuredClone(effect)) : effects as Effect[] };
  return layer.type === 'group'
    ? { ...layer, children: layer.children.map(child => studioEffectPath(child, layerId, effects, clone)) }
    : layer;
}

interface FxPreviewSession {
  documentId: string;
  layerId: string;
  effectId: string;
  original: Document;
  originalEffectJson: string;
}
let fxPreviewSession: FxPreviewSession | null = null;

/** One canonical stack per animation track/layer. No per-frame copying. */
function shareLayerEffectsAcrossFrames(doc: Document, layerId: string): void {
  if (!doc.animation) return;
  const layer = layerById(doc, layerId);
  if (layer) setTrackEffects(doc, layerId, layer.effects ?? []);
}

function applyEffectChanges(doc: Document, layerId: string, effectId: string, changes: Partial<Effect>): void {
  const layer = layerById(doc, layerId);
  if (!layer || layer.locked) return;
  const effect = layer.effects?.find(item => item.id === effectId);
  if (!effect) return;
  if (changes.enabled !== undefined) effect.enabled = changes.enabled;
  if (changes.amount !== undefined) effect.amount = clampEffectAmount(effect.kind, changes.amount);
  if (typeof changes.color === 'string') effect.color = changes.color;
  if (changes.parameters) {
    const parameters = { ...(effect.parameters ?? {}) };
    for (const [key, value] of Object.entries(changes.parameters)) {
      if (key === 'glowMode' && (value === 'outer' || value === 'inner' || value === 'both' || value === 'bloom')) {
        parameters.glowMode = value;
      } else if (key === 'backdropMode' && (value === 'solid' || value === 'gradient')) {
        parameters.backdropMode = value;
      } else if (key === 'stops' && Array.isArray(value) && value.length >= 2 && value.length <= 32) {
        parameters.stops = structuredClone(value);
      } else if (key === 'curvePoints' && Array.isArray(value) && value.length >= 2 && value.length <= 32) {
        parameters.curvePoints = structuredClone(value);
      } else if (key === 'shadows' && Array.isArray(value) && value.length <= 12) {
        parameters.shadows = structuredClone(value);
      } else if (key === 'maskStrokes' && Array.isArray(value) && value.length <= 4000) {
        // Never deserialize arbitrary or unbounded editable mask payloads.
        parameters.maskStrokes = value.filter(item => item && typeof item === 'object'
          && (item.mode === 'keep' || item.mode === 'remove')
          && Number.isFinite(item.x) && item.x >= 0 && item.x <= 1
          && Number.isFinite(item.y) && item.y >= 0 && item.y <= 1
          && Number.isFinite(item.radius) && item.radius >= 1 && item.radius <= 500);
      } else if (typeof value === 'number') {
        const bounded = boundedNumber(effect.kind, key, value);
        if (bounded !== undefined) (parameters as unknown as Record<string, number>)[key] = bounded;
      }
    }
    effect.parameters = parameters;
  }
}

const first = createDocument('Welcome canvas');
const layout = savedWorkspace();

export const useEditor = create<EditorStore>((set, get) => ({
  creativePanelOpen: false,
  selectedCreativeId: null,
  creativeDrawMode: false,
  creativePreview: null,
  setCreativePanelOpen: creativePanelOpen => set({
    creativePanelOpen,
    ...(!creativePanelOpen ? { creativePreview: null, creativeDrawMode: false } : {}),
  }),
  selectCreative: selectedCreativeId => set({ selectedCreativeId, creativeDrawMode: false, creativePreview: null }),
  setCreativeDrawMode: creativeDrawMode => set({ creativeDrawMode }),
  addCreative: kind => {
    const doc = activeTab(get()).doc;
    const id = doc.activeLayerId ?? undefined;
    const item = newCreative(kind, doc.width, doc.height, id);
    if (kind === 'timeSculptor' || kind === 'sceneCards') item.intensity = 100;
    get().mutate(current => { current.creative ??= []; current.creative.push(item); });
    set({ selectedCreativeId: item.id, creativePanelOpen: true, creativeDrawMode: false });
  },
  updateCreative: (id, changes) => get().mutate(doc => {
    const object = doc.creative?.find(item => item.id === id);
    if (object) Object.assign(object, changes);
  }),
  removeCreative: id => {
    get().mutate(doc => { doc.creative = doc.creative?.filter(item => item.id !== id); });
    if (get().selectedCreativeId === id) set({ selectedCreativeId: null, creativePreview: null });
  },
  previewCreative: creativePreview => set({ creativePreview }),
  commitCreativePreview: () => {
    const draft = get().creativePreview;
    if (!draft) return;
    set({ creativePreview: null });
    get().mutate(doc => {
      const index = doc.creative?.findIndex(item => item.id === draft.id) ?? -1;
      if (index >= 0 && doc.creative) doc.creative[index] = draft;
    });
  },
  tabs: [tabFor(first)],
  activeId: first.id,
  tool: 'brush',
  color: '#8e83ff',
  backgroundColor: '#ffffff',
  backgroundOpacity: 1,
  fill: '#8e83ff',
  gradientMode: 'linear',
  gradientSettings: {gradientTransform:'none',gradientTransformAmount:100,gradientTransformFrequency:2,gradientTransformCount:14,gradientTransformPhase:0,gradientTransformSeed:12},
  strokeWidth: 12,
  opacity: 1,
  hardness: 0.85,
  smoothing: 0.72,
  brushFlow: 1,
  brushSpacing: .13,
  inkTaper: .12,
  pressureSize: true,
  pressureOpacity: false,
  brushPreset: 'round-brush',
  rasterToolStrength:.55,
  rasterToolTolerance:18,
  rasterToolContiguous:true,
  rasterPattern:'star',
  setRasterToolStrength:value=>set({rasterToolStrength:Math.max(.01,Math.min(1,value))}),
  setRasterToolTolerance:value=>set({rasterToolTolerance:Math.max(0,Math.min(100,value))}),
  setRasterToolContiguous:value=>set({rasterToolContiguous:value}),
  setRasterPattern:value=>set({rasterPattern:value}),
  setBrushFlow: brushFlow => set({brushFlow: Math.max(.02,Math.min(1,brushFlow))}),
  setBrushSpacing: brushSpacing => set({brushSpacing:Math.max(.03,Math.min(1,brushSpacing))}),
  setInkTaper: inkTaper => set({inkTaper:Math.max(0,Math.min(.48,inkTaper))}),
  setPressureSize: pressureSize => set({pressureSize}),
  setPressureOpacity: pressureOpacity => set({pressureOpacity}),
  applyBrushPreset: id => {
    const preset = INK_PRESETS.find(item=>item.id===id);
    if(!preset)return;
    set({tool:preset.engine==='ink'?'ink':'brush',brushPreset:id,
      strokeWidth:preset.settings.size ?? get().strokeWidth,
      opacity:preset.settings.opacity ?? get().opacity,
      brushFlow:preset.settings.flow ?? get().brushFlow,
      brushSpacing:preset.settings.spacing ?? get().brushSpacing,
      inkTaper:preset.settings.taper ?? get().inkTaper,
      pressureSize:preset.settings.pressureSize ?? get().pressureSize,
      pressureOpacity:preset.settings.pressureOpacity ?? get().pressureOpacity,
      hardness:preset.hardness,smoothing:preset.smoothing});
  },
  symmetryX: false,
  setSymmetryX: symmetryX => set({ symmetryX }),
  zoom: 0.8,
  pan: { x: 0, y: 0 },
  workspace: layout.theme,
  appearanceMode: layout.appearanceMode,
  grid: false,
  rulers: false,
  snap: true,
  setRulers: rulers => set({ rulers }),
  setSnap: snap => set({ snap }),
  selectedShapeId: null,
  textDefaults: DEFAULT_TEXT_FORMAT,
  textDraft: null,
  fxBypassLayerId: null,
  selectedNodeIndex: null,
  selection: null,
  focusMode: false,
  inspectorOpen: layout.inspectorOpen,
  toolsOpen: layout.toolsOpen,
  inspectorWidth: layout.inspectorWidth,

  setHardness: hardness => set({ hardness: Math.max(0.02, Math.min(1, hardness)) }),
  setSmoothing: smoothing => set({ smoothing: Math.max(0, Math.min(0.95, smoothing)) }),
  setSelection: selection => {
    const id=get().activeId,precise=pixelSelection(id);
    if(!selection || (precise && (selection.x!==precise.bounds.x||selection.y!==precise.bounds.y||
      selection.width!==precise.bounds.width||selection.height!==precise.bounds.height)))clearPixelSelection(id);
    set({selection});
  },
  selectNode: selectedNodeIndex => set({ selectedNodeIndex }),
  setFxBypassLayer: fxBypassLayerId => set({ fxBypassLayerId }),
  setFocusMode: focusMode => set({ focusMode }),
  setInspectorOpen: inspectorOpen => {
    persistLayout({ inspectorOpen });
    set({ inspectorOpen });
  },
  setToolsOpen: toolsOpen => {
    persistLayout({ toolsOpen });
    set({ toolsOpen });
  },
  setInspectorWidth: inspectorWidth => {
    const clamped = Math.max(200, Math.min(420, inspectorWidth));
    // Width is persisted at the end of a resize gesture, not during each pointer move.
    set({ inspectorWidth: clamped });
  },

  saveInspectorWidth: () => persistLayout({ inspectorWidth: get().inspectorWidth }),

  startTextDraft: textDraft => set({ textDraft, selectedShapeId: textDraft.id }),
  changeTextDraft: patch => set(state => ({
    textDraft: state.textDraft ? { ...state.textDraft, ...patch } : null,
  })),
  cancelTextDraft: () => set({ textDraft: null }),
  setTextFormat: patch => {
    const state = get();
    const active = activeLayer(state);
    const selected = active?.type === 'vector'
      ? active.shapes.find(item => item.id === state.selectedShapeId && item.kind === 'text') : undefined;
    const base = state.textDraft ?? (selected ? {
      ...state.textDefaults, fontFamily: selected.fontFamily ?? 'Arial',
      fontSize: selected.fontSize ?? 48, fontWeight: selected.fontWeight ?? '400',
      fontStyle: selected.fontStyle ?? 'normal', lineHeight: selected.lineHeight ?? 1.25,
      letterSpacing: selected.letterSpacing ?? 0,
      textAlign: selected.textAlign ?? 'left', color: selected.fill,
      textDecoration: selected.textDecoration ?? 'none', textTransform: selected.textTransform ?? 'none',
      fontVariant: selected.fontVariant ?? 'normal', textBackground: selected.textBackground ?? 'none',
      textPadding: selected.textPadding ?? 0, textShadowColor: selected.textShadowColor ?? '#111827',
      textShadowBlur: selected.textShadowBlur ?? 0, textShadowX: selected.textShadowX ?? 0, textShadowY: selected.textShadowY ?? 0,
    } : state.textDefaults);
    const next = normalizeTextFormat({ ...base, ...patch });
    set({ textDefaults: next });
    if (state.textDraft) {
      set({ textDraft: { ...state.textDraft, ...next } });
      return;
    }
    const shape = selected;
    if (!shape) return;
    get().updateShape(shape.id, target => {
      if (patch.color !== undefined) target.fill = next.color;
      if (patch.fontFamily !== undefined) target.fontFamily = next.fontFamily;
      if (patch.fontSize !== undefined) target.fontSize = next.fontSize;
      if (patch.fontWeight !== undefined) target.fontWeight = next.fontWeight;
      if (patch.fontStyle !== undefined) target.fontStyle = next.fontStyle;
      if (patch.lineHeight !== undefined) target.lineHeight = next.lineHeight;
      if (patch.letterSpacing !== undefined) target.letterSpacing = next.letterSpacing;
      if (patch.textAlign !== undefined) target.textAlign = next.textAlign;
      if (patch.textDecoration !== undefined) target.textDecoration = next.textDecoration;
      if (patch.textTransform !== undefined) target.textTransform = next.textTransform;
      if (patch.fontVariant !== undefined) target.fontVariant = next.fontVariant;
      if (patch.textBackground !== undefined) target.textBackground = next.textBackground;
      if (patch.textPadding !== undefined) target.textPadding = next.textPadding;
      if (patch.textShadowColor !== undefined) target.textShadowColor = next.textShadowColor;
      if (patch.textShadowBlur !== undefined) target.textShadowBlur = next.textShadowBlur;
      if (patch.textShadowX !== undefined) target.textShadowX = next.textShadowX;
      if (patch.textShadowY !== undefined) target.textShadowY = next.textShadowY;
      reflowTextShape(target);
    });
  },
  commitTextDraft: () => {
    const draft = get().textDraft;
    if (!draft) return;
    const format = normalizeTextFormat(draft);
    const text = draft.value;
    const shapeId = draft.id ?? uid();
    set(state => ({
      textDraft: null,
      selectedShapeId: state.activeId === draft.documentId && text.trim()
        ? shapeId : state.activeId === draft.documentId ? null : state.selectedShapeId,
      tabs: state.tabs.map(tab => {
        if (tab.doc.id !== draft.documentId) return tab;
        if (!text.trim() && !draft.id) return tab;
        const doc = clone(tab.doc);
        let layer = doc.layers.find(item => item.id === draft.layerId);
        if (draft.id) {
          if (layer?.type !== 'vector' || layer.locked) return tab;
          const shape = layer.shapes.find(item => item.id === draft.id && item.kind === 'text');
          if (!shape) return tab;
          if (!text.trim()) layer.shapes = layer.shapes.filter(item => item.id !== draft.id);
          else {
            Object.assign(shape, {
              text, fontFamily: format.fontFamily, fontSize: format.fontSize,
              fontWeight: format.fontWeight, fontStyle: format.fontStyle, lineHeight: format.lineHeight,
              letterSpacing: format.letterSpacing, textAlign: format.textAlign, fill: format.color,
              textDecoration: format.textDecoration, textTransform: format.textTransform,
              fontVariant: format.fontVariant, textBackground: format.textBackground,
              textPadding: format.textPadding, textShadowColor: format.textShadowColor,
              textShadowBlur: format.textShadowBlur, textShadowX: format.textShadowX, textShadowY: format.textShadowY,
            });
            reflowTextShape(shape);
          }
        } else {
          if (layer?.type !== 'vector' || layer.locked || !layer.visible) {
            layer = makeVector('Text layer');
            doc.layers.push(layer);
          }
          doc.activeLayerId = layer.id;
          const shape: VectorShape = {
            id: shapeId, kind: 'text', x: draft.x - layer.x, y: draft.y - layer.y,
            width: 0, height: 0, fill: format.color, stroke: 'none', strokeWidth: 0,
            text, fontFamily: format.fontFamily, fontSize: format.fontSize,
            fontWeight: format.fontWeight, fontStyle: format.fontStyle, textAlign: format.textAlign,
            lineHeight: format.lineHeight, letterSpacing: format.letterSpacing,
            textDecoration: format.textDecoration, textTransform: format.textTransform,
            fontVariant: format.fontVariant, textBackground: format.textBackground,
            textPadding: format.textPadding, textShadowColor: format.textShadowColor,
            textShadowBlur: format.textShadowBlur, textShadowX: format.textShadowX, textShadowY: format.textShadowY,
          };
          reflowTextShape(shape);
          layer.shapes.push(shape);
        }
        if (JSON.stringify(doc) === JSON.stringify(tab.doc)) return tab;
        syncActiveCel(doc);
        doc.updatedAt = new Date().toISOString();
        return {
          ...tab, doc, past: trimHistory([...tab.past, tab.doc]), future: [],
          dirty: true, revision: tab.revision + 1,
        };
      }),
    }));
  },
  setTool: tool => {
    if (get().textDraft) get().commitTextDraft();
    set({ tool });
  },
  setColor: color => { if (/^#[0-9a-f]{6}$/i.test(color)) set({ color }); },
  setBackgroundColor: backgroundColor => { if (/^#[0-9a-f]{6}$/i.test(backgroundColor)) set({ backgroundColor }); },
  setBackgroundOpacity: backgroundOpacity => set({ backgroundOpacity: Math.max(0, Math.min(1, backgroundOpacity)) }),
  swapColors: () => set(state => ({ color: state.backgroundColor, backgroundColor: state.color })),
  resetColors: () => set({ color: '#000000', backgroundColor: '#ffffff', backgroundOpacity: 1 }),
  setFill: fill => set({ fill }),
  setGradientMode: gradientMode => set({ gradientMode }),
  setGradientSettings: changes => set(state => ({ gradientSettings: { ...state.gradientSettings, ...changes } })),
  setStrokeWidth: strokeWidth => set({ strokeWidth: Math.max(1, Math.min(2000, strokeWidth)) }),
  setOpacity: opacity => set({ opacity: Math.max(0, Math.min(1, opacity)) }),
  setZoom: zoom => set({ zoom: Math.max(0.05, Math.min(32, zoom)) }),
  setPan: pan => set({ pan }),
  setAppearanceMode: appearanceMode => {
    persistLayout({ appearanceMode });
    set({ appearanceMode });
  },
  reorderTabs: (sourceId, targetId) => set(state => {
    if (sourceId === targetId) return state;
    const source = state.tabs.findIndex(tab => tab.doc.id === sourceId);
    const target = state.tabs.findIndex(tab => tab.doc.id === targetId);
    if (source < 0 || target < 0) return state;
    const tabs = [...state.tabs];
    const [moving] = tabs.splice(source, 1);
    tabs.splice(target, 0, moving);
    return { tabs };
  }),
  renameDoc: (docId, name) => set(state => ({
    tabs: state.tabs.map(tab => {
      if (tab.doc.id !== docId || !name.trim() || tab.doc.name === name.trim()) return tab;
      const doc = clone(tab.doc);
      doc.name = name.trim();
      doc.updatedAt = new Date().toISOString();
      return {
        ...tab, doc, past: trimHistory([...tab.past, tab.doc]), future: [],
        dirty: true, revision: tab.revision + 1,
      };
    }),
  })),
  duplicateDoc: docId => {
    if (get().textDraft) get().commitTextDraft();
    set(state => {
      const source = state.tabs.find(tab => tab.doc.id === docId);
      if (!source) return state;
      const duplicated = clone(source.doc);
      duplicated.id = uid();
      duplicated.name = `${duplicated.name} copy`;
      const position = state.tabs.indexOf(source);
      const tabs = [...state.tabs];
      tabs.splice(position + 1, 0, tabFor(duplicated));
      return { tabs, activeId: duplicated.id, selectedShapeId: null };
    });
  },

  setWorkspace: workspace => {
    try { localStorage.setItem('huelith-theme', workspace); } catch { /* Keep working offline. */ }
    set({ workspace });
  },
  setGrid: grid => set({ grid }),
  selectShape: selectedShapeId => set({ selectedShapeId, selectedNodeIndex: null }),

  newDoc: (name, width, height, background, animation = false) => {
    if (get().textDraft) get().commitTextDraft();
    const doc = createDocument(name, width, height, background);
    if (animation) enableAnimation(doc);
    set(state => ({
      tabs: [...state.tabs, tabFor(doc)], activeId: doc.id,
      pan: { x: 0, y: 0 }, selectedShapeId: null, selectedCreativeId: null, creativePreview: null, selection: null,
    }));
  },

  openDoc: (doc, path) => {
    if (get().textDraft) get().commitTextDraft();
    const opened = clone(doc);
    // An already open copy must never share a tab identity with another document.
    opened.id = uid();
    set(state => ({
      tabs: [...state.tabs, tabFor(opened, path)], activeId: opened.id,
      pan: { x: 0, y: 0 }, selectedShapeId: null, selectedCreativeId: null, creativePreview: null, selection: null,
    }));
  },

  closeDoc: id => {
    if (get().textDraft) get().commitTextDraft();
    set(state => {
      const tabs = state.tabs.filter(tab => tab.doc.id !== id);
      if (tabs.length === 0) {
        const doc = createDocument();
        return {
          tabs: [tabFor(doc)], activeId: doc.id,
          selectedShapeId: null,
        };
      }
      return {
        tabs,
        activeId: state.activeId === id ? tabs[tabs.length - 1].doc.id : state.activeId,
        selectedShapeId: null,
      };
    });
  },

  activate: activeId => {
    if (get().textDraft) get().commitTextDraft();
    set({ activeId, selectedShapeId: null });
  },

  mutate: edit => set(state => ({
    tabs: state.tabs.map(tab => {
      if (tab.doc.id !== state.activeId) return tab;
      const doc = clone(tab.doc);
      edit(doc);
      releaseModifiedHolds(tab.doc,doc);
      syncActiveCel(doc);
      // Do not fill undo history with no-op clicks or edits to locked layers.
      if (JSON.stringify(doc) === JSON.stringify(tab.doc)) return tab;
      doc.updatedAt = new Date().toISOString();
      return {
        ...tab, doc, past: trimHistory([...tab.past, tab.doc]), future: [],
        dirty: true, revision: tab.revision + 1,
      };
    }),
  })),

  undo: () => {
    if (get().textDraft) get().commitTextDraft();
    set(state => ({
      tabs: state.tabs.map(tab => {
        if (tab.doc.id !== state.activeId || tab.past.length === 0) return tab;
        const doc = tab.past[tab.past.length - 1];
        return {
          ...tab, doc, past: tab.past.slice(0, -1), future: [tab.doc, ...tab.future],
          revision: tab.revision + 1, dirty: doc !== tab.savedDoc,
        };
      }),
      selectedShapeId: null,
    }));
  },

  redo: () => {
    if (get().textDraft) get().commitTextDraft();
    set(state => ({
      tabs: state.tabs.map(tab => {
        if (tab.doc.id !== state.activeId || tab.future.length === 0) return tab;
        const [doc, ...future] = tab.future;
        return {
          ...tab, doc, past: trimHistory([...tab.past, tab.doc]), future,
          revision: tab.revision + 1, dirty: doc !== tab.savedDoc,
        };
      }),
      selectedShapeId: null,
    }));
  },

  markSaved: (id, revision, path) => set(state => ({
    tabs: state.tabs.map(tab => tab.doc.id === id ? {
      ...tab, path: path ?? tab.path, savedRevision: revision,
      savedDoc: tab.revision === revision ? tab.doc : tab.savedDoc,
      dirty: tab.revision !== revision,
    } : tab),
  })),

  makeAnimation: () => get().mutate(doc => enableAnimation(doc)),
  setActiveFrame: index => {
    if (get().textDraft) get().commitTextDraft();
    if (fxPreviewSession) get().finishEffectPreview();
    set(state => ({
      tabs: state.tabs.map(tab => {
        if (tab.doc.id !== state.activeId || !tab.doc.animation) return tab;
        const track = tab.doc.animation;
        if (track.currentFrame === index || !Number.isInteger(index) || index < 0 || index >= track.frames.length) return tab;
        // A playhead move is navigation, NOT a new artwork edit. Mutations
        // already synchronize the cel; rebuilding frame arrays and thumbnails
        // on each tick used to cause enormous layout and effect-cache churn.
        const target = track.frames[index];
        const canonical = track.trackEffects ?? ensureTrackEffects(tab.doc);
        const layers = resolveTrackLayers(exposedLayers(tab.doc,index), canonical, track.trackGradients ?? ensureTrackGradients(tab.doc));
        const doc: Document = { ...tab.doc, layers, activeLayerId: target.activeLayerId,
          animation: {...track,currentFrame:index} };
        return {...tab,doc};
      }),
      selectedShapeId: null,
      selectedNodeIndex: null,
      selection: null,
    }));
  },
  appendFrame: duplicate => {
    if (get().textDraft) get().commitTextDraft();
    get().mutate(doc => { insertFrame(doc, duplicate); });
    set({ selectedShapeId: null, selectedNodeIndex: null, selection: null });
  },
  deleteActiveFrame: () => {
    if (get().textDraft) get().commitTextDraft();
    get().mutate(doc => { deleteFrame(doc); });
    set({ selectedShapeId: null, selectedNodeIndex: null, selection: null });
  },
  reorderAnimationFrames: (from, to) => get().mutate(doc => { reorderFrame(doc, from, to); }),
  setAnimationFps: fps => get().mutate(doc => { changeFps(doc, fps); }),
  setOnion: value => get().mutate(doc => { changeOnion(doc, value); }),
  setFrameDuration: (index, ms) => get().mutate(doc => { changeFrameDuration(doc, index, ms); }),
  setPlaybackRegion: changes => get().mutate(doc => setPlaybackRegion(doc,changes)),
  setAnimationFrameLabel: (index,label) => get().mutate(doc => setFrameLabel(doc,index,label)),
  setAnimationHold: (index,layerId,enabled) => get().mutate(doc => {
    if(enabled)holdLayer(doc,index,layerId);else releaseHold(doc,index,layerId);
  }),
  clearAnimationCel: (index,layerId) => get().mutate(doc => clearLayerCel(doc,index,layerId)),
  setAnimationFrameDurations: (indices,ms) => get().mutate(doc => setFrameDurations(doc,indices,ms)),
  duplicateAnimationFrames: indices => get().mutate(doc => duplicateFrameRange(doc,indices)),
  setAnimationHolds: (indices,layerId,enabled) => get().mutate(doc => holdFrameRange(doc,indices,layerId,enabled)),
  deleteAnimationFrames: indices => get().mutate(doc => deleteFrameRange(doc,indices)),

  addLayer: type => get().mutate(doc => {
    const layer = type === 'raster' ? makeRaster() : makeVector();
    doc.layers.push(layer);
    doc.activeLayerId = layer.id;
  }),

  addGradientLayer: gradient => get().mutate(doc => {
    const next = makeGradient(structuredClone(gradient), `Gradient ${doc.layers.filter(layer => layer.type === 'gradient').length + 1}`);
    const index = doc.layers.findIndex(layer => layer.id === doc.activeLayerId);
    const insertAt = index < 0 ? doc.layers.length : index + 1;
    doc.layers.splice(insertAt, 0, next);
    if (doc.animation) {
      // A Gradient is persistent procedural content, not a painted frame.
      // Insert the same stable layer ID in *every* cel; otherwise an Atelier
      // creation mid-animation vanishes as soon as the user presses Play.
      const animation = doc.animation;
      for (let i = 0; i < animation.frames.length; i++) {
        if (i === animation.currentFrame) continue;
        const layers = animation.frames[i].layers;
        layers.splice(Math.min(insertAt, layers.length), 0, structuredClone(next));
      }
      ensureTrackGradients(doc)[next.id] = structuredClone(next.gradient);
      ensureTrackEffects(doc)[next.id] = [];
    }
    doc.activeLayerId = next.id;
  }),
  updateGradientLayer: (layerId, update) => get().mutate(doc => {
    const visit = (layers: Layer[]): boolean => {
      for (const layer of layers) {
        if (layer.id === layerId && layer.type === 'gradient' && !layer.locked) { update(layer.gradient); return true; }
        if (layer.type === 'group' && visit(layer.children)) return true;
      }
      return false;
    };
    if (visit(doc.layers)) {
      const layer = layerById(doc,layerId);
      if (layer?.type === 'gradient') setTrackGradient(doc, layerId, layer.gradient);
    }
  }),
  addAdjustmentLayer: () => get().mutate(doc => {
    const position = doc.layers.findIndex(layer => layer.id === doc.activeLayerId);
    const layer = makeVector('Adjustment layer');
    layer.adjustment = true;
    layer.effects = [{ id: uid(), kind: 'brightness', enabled: true, amount: 100,
      studioCategory: 'creativity' }];
    doc.layers.splice(Math.max(0, position + 1), 0, layer);
    doc.activeLayerId = layer.id;
  }),
  // A group with its own editable effects is a non-destructive adjustment
  // container. Effects are applied to its children, not the source layers.
  groupSelectedLayer: () => get().mutate(doc => {
    const index = doc.layers.findIndex(layer => layer.id === doc.activeLayerId);
    if (index < 0) return;
    const item = doc.layers[index];
    const group: Layer = { id: uid(), type: 'group', name: `Group · ${item.name}`,
      visible: true, locked: false, opacity: 1, blend: 'source-over', x: 0, y: 0,
      children: [item], effects: [] };
    doc.layers.splice(index, 1, group);
    doc.activeLayerId = group.id;
  }),
  ungroupSelectedLayer: () => get().mutate(doc => {
    const index = doc.layers.findIndex(layer => layer.id === doc.activeLayerId);
    const item = doc.layers[index];
    if (!item || item.type !== 'group') return;
    doc.layers.splice(index, 1, ...item.children);
    doc.activeLayerId = item.children[0]?.id ?? null;
  }),
  setClipToBelow: (id, enabled) => get().mutate(doc => {
    const index = doc.layers.findIndex(layer => layer.id === id);
    if (index <= 0 || doc.layers[index].locked) return;
    doc.layers[index].clipToBelow = enabled;
  }),

  applyCutoutMask: (layerId, data, width, height,editable) => get().mutate(doc => {
    const layer = layerById(doc, layerId);
    if (layer?.type !== 'raster' || layer.locked || !/^data:image\/png;base64,/i.test(data)) return;
    layer.cutoutMask = { data, width, height, enabled: true, ...(editable?{editable:structuredClone(editable)}:{}) };
    // Cutout is not an effect. Remove obsolete cutout steps on this layer
    // when the user explicitly applies a new Inspector mask.
    layer.effects = (layer.effects ?? []).filter(effect => effect.kind !== 'cutout');
    if (doc.animation) {
      const track = ensureTrackEffects(doc);
      track[layerId] = (track[layerId] ?? []).filter(effect => effect.kind !== 'cutout');
      for (const frame of doc.animation.frames) {
        const cel = layerById({ ...doc, layers: frame.layers }, layerId);
        if (cel?.type === 'raster') cel.cutoutMask = structuredClone(layer.cutoutMask);
      }
    }
  }),
  toggleCutoutMask: layerId => get().mutate(doc => {
    const layer = layerById(doc, layerId);
    if (layer?.type !== 'raster' || layer.locked || !layer.cutoutMask) return;
    const enabled = !layer.cutoutMask.enabled;
    layer.cutoutMask.enabled = enabled;
    for (const frame of doc.animation?.frames ?? []) {
      const cel = layerById({ ...doc, layers: frame.layers }, layerId);
      if (cel?.type === 'raster' && cel.cutoutMask) cel.cutoutMask.enabled = enabled;
    }
  }),
  removeCutoutMask: layerId => get().mutate(doc => {
    const layer = layerById(doc, layerId);
    if (layer?.type !== 'raster' || layer.locked) return;
    delete layer.cutoutMask;
    for (const frame of doc.animation?.frames ?? []) {
      const cel = layerById({ ...doc, layers: frame.layers }, layerId);
      if (cel?.type === 'raster') delete cel.cutoutMask;
    }
  }),
  duplicateLayer: () => get().mutate(doc => {
    const index = doc.layers.findIndex(layer => layer.id === doc.activeLayerId);
    if (index < 0) return;
    const duplicated = clone(doc.layers[index]);
    regenerateLayerIds(duplicated);
    duplicated.name += ' copy';
    doc.layers.splice(index + 1, 0, duplicated);
    doc.activeLayerId = duplicated.id;
  }),

  removeLayer: () => get().mutate(doc => {
    if (doc.layers.length <= 1) return;
    const removedId = doc.activeLayerId;
    const removed = layerById(doc, removedId);
    doc.layers = doc.layers.filter(layer => layer.id !== removedId);
    if (removed?.type === 'gradient' && doc.animation) {
      // Removing a procedural track removes it from every cel. It cannot
      // spontaneously reappear when the playhead reaches an old frame.
      for (const frame of doc.animation.frames) frame.layers = frame.layers.filter(layer => layer.id !== removedId);
      if (doc.animation.trackGradients && removedId) delete doc.animation.trackGradients[removedId];
      if (doc.animation.trackEffects && removedId) delete doc.animation.trackEffects[removedId];
    }
    doc.activeLayerId = doc.layers.at(-1)?.id ?? null;
  }),

  selectLayer: id => set(state => ({
    tabs: state.tabs.map(tab => tab.doc.id === state.activeId ? {
      ...tab, doc: (() => {
        const doc = { ...tab.doc, activeLayerId: id };
        syncActiveCel(doc);
        return doc;
      })(),
    } : tab),
    selectedShapeId: null,
  })),

  moveLayer: (id, step) => get().mutate(doc => {
    const index = doc.layers.findIndex(layer => layer.id === id);
    const target = index + step;
    if (index < 0 || target < 0 || target >= doc.layers.length) return;
    [doc.layers[index], doc.layers[target]] = [doc.layers[target], doc.layers[index]];
  }),

  toggleLayer: (id, field) => get().mutate(doc => {
    const layer = layerById(doc, id);
    if (layer) layer[field] = !layer[field];
  }),

  renameLayer: (id, name) => get().mutate(doc => {
    const layer = layerById(doc, id);
    if (layer && name.trim()) layer.name = name.trim();
  }),

  setLayerOpacity: (id, opacity) => get().mutate(doc => {
    const layer = layerById(doc, id);
    if (layer) layer.opacity = Math.max(0, Math.min(1, opacity));
  }),

  setLayerBlend: (id, blend) => get().mutate(doc => {
    const layer = layerById(doc, id);
    if (layer && !layer.locked) layer.blend = blend;
  }),

  applySelectionMask: id => {
    const selection = get().selection;
    if (!selection || selection.width <= 0 || selection.height <= 0) return;
    get().mutate(doc => {
      const layer = layerById(doc, id);
      if (layer && !layer.locked) layer.mask = { ...selection };
    });
  },

  clearLayerMask: id => get().mutate(doc => {
    const layer = layerById(doc, id);
    if (layer && !layer.locked) delete layer.mask;
  }),

  previewStudioEffects: (layerId, effects) => {
    const tab = activeTab(get());
    const layer = layerById(tab.doc, layerId);
    if (!layer || layer.locked) return;
    if (!studioPreviewSession || studioPreviewSession.documentId !== tab.doc.id || studioPreviewSession.layerId !== layerId) {
      get().cancelStudioEffects();
      get().finishEffectPreview();
      forgetLayerEffectPreview(layerId);
      const baseline = activeTab(get()).doc;
      studioPreviewSession = {
        documentId: baseline.id, layerId, original: baseline,
        originalEffects: JSON.stringify(layerById(baseline, layerId)?.effects ?? []),
      };
      setInteractiveEffectPreview(true, layerId);
    }
    studioOverlay = { documentId: tab.doc.id, layerId, effects };
    announceStudioPreview(layerId, effects);
  },
  commitStudioEffects: (layerId, effects) => {
    get().previewStudioEffects(layerId, effects);
    const session = studioPreviewSession;
    if (!session || session.layerId !== layerId) return;
    studioPreviewSession = null;
    studioOverlay = null;
    forgetLayerEffectPreview(layerId);
    setInteractiveEffectPreview(false);
    const modified = session.originalEffects !== JSON.stringify(effects);
    if (modified) {
      set(state => ({
        tabs: state.tabs.map(tab => {
          if (tab.doc.id !== session.documentId) return tab;
          const layers = tab.doc.layers.map(layer => studioEffectPath(layer, layerId, effects));
          const doc: Document = { ...tab.doc, layers, updatedAt: new Date().toISOString() };
          if (doc.animation) {
            // This is the only authoritative write, not one copy per cel.
            doc.animation = { ...doc.animation, frames: [...doc.animation.frames] };
            setTrackEffects(doc, layerId, effects);
          }
          return {
            ...tab, doc, past: trimHistory([...tab.past, session.original]), future: [],
            dirty: true, revision: tab.revision + 1,
          };
        }),
      }));
    }
    announceStudioPreview();
  },
  cancelStudioEffects: () => {
    if (!studioPreviewSession) return;
    forgetLayerEffectPreview(studioPreviewSession.layerId);
    studioPreviewSession = null;
    studioOverlay = null;
    setInteractiveEffectPreview(false);
    announceStudioPreview();
  },

  addEffect: (id, kind) => get().mutate(doc => {
    const layer = layerById(doc, id);
    if (layer && !layer.locked) {
      layer.effects = [...(layer.effects ?? []), newEffect(kind)];
      shareLayerEffectsAcrossFrames(doc, id);
    }
  }),

  appendEffects: (id, effects) => get().mutate(doc => {
    const layer = layerById(doc, id);
    if (layer && !layer.locked) {
      layer.effects = [...(layer.effects ?? []), ...effects.map(effect => ({ ...effect, id: uid() }))];
      shareLayerEffectsAcrossFrames(doc, id);
    }
  }),

  updateEffect: (layerId, effectId, changes) => {
    get().finishEffectPreview();
    get().mutate(doc => {
      applyEffectChanges(doc, layerId, effectId, changes);
      shareLayerEffectsAcrossFrames(doc, layerId);
    });
  },

  previewEffect: (layerId, effectId, changes) => {
    const tab = activeTab(get());
    if (!fxPreviewSession || fxPreviewSession.documentId !== tab.doc.id ||
      fxPreviewSession.layerId !== layerId || fxPreviewSession.effectId !== effectId) {
      get().finishEffectPreview();
      fxPreviewSession = {
        documentId: tab.doc.id, layerId, effectId, original: tab.doc,
        originalEffectJson: JSON.stringify(layerById(tab.doc, layerId)?.effects?.find(effect => effect.id === effectId)),
      };
      setInteractiveEffectPreview(true, layerId);
    }
    set(state => ({
      tabs: state.tabs.map(item => {
        if (item.doc.id !== tab.doc.id) return item;
        const layers = item.doc.layers.map(layer => copyEffectPath(layer, layerId, effectId));
        const doc: Document = { ...item.doc, layers };
        if (item.doc.animation) {
          const animation = item.doc.animation;
          doc.animation = {
            ...animation,
            frames: animation.frames.map((frame, index) => index === animation.currentFrame
              ? { ...frame, layers } : frame),
          };
        }
        applyEffectChanges(doc, layerId, effectId, changes);
        return { ...item, doc };
      }),
    }));
  },

  finishEffectPreview: () => {
    const session = fxPreviewSession;
    if (!session) return;
    fxPreviewSession = null;
    setInteractiveEffectPreview(false);
    set(state => ({
      tabs: state.tabs.map(tab => {
        if (tab.doc.id !== session.documentId || JSON.stringify(layerById(tab.doc, session.layerId)?.effects?.find(effect => effect.id === session.effectId)) === session.originalEffectJson) return tab;
        return {
          ...tab, past: trimHistory([...tab.past, session.original]), future: [],
          dirty: true, revision: tab.revision + 1,
          doc: (() => {
            const updated = structuredClone(tab.doc);
            shareLayerEffectsAcrossFrames(updated, session.layerId);
            updated.updatedAt = new Date().toISOString();
            return updated;
          })(),
        };
      }),
    }));
  },

  cancelEffectPreview: () => {
    const session = fxPreviewSession;
    if (!session) return;
    fxPreviewSession = null;
    setInteractiveEffectPreview(false);
    set(state => ({
      tabs: state.tabs.map(tab => tab.doc.id === session.documentId ? { ...tab, doc: session.original } : tab),
    }));
  },

  removeEffect: (layerId, effectId) => get().mutate(doc => {
    const layer = layerById(doc, layerId);
    if (layer && !layer.locked) {
      layer.effects = layer.effects?.filter(effect => effect.id !== effectId);
      shareLayerEffectsAcrossFrames(doc, layerId);
    }
  }),

  moveEffect: (layerId, effectId, direction) => get().mutate(doc => {
    const layer = layerById(doc, layerId);
    if (!layer || layer.locked || !layer.effects) return;
    const index = layer.effects.findIndex(effect => effect.id === effectId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layer.effects.length) return;
    [layer.effects[index], layer.effects[target]] = [layer.effects[target], layer.effects[index]];
    shareLayerEffectsAcrossFrames(doc, layerId);
  }),

  addShape: shape => get().mutate(doc => {
    let layer = layerById(doc, doc.activeLayerId);
    if (layer?.type !== 'vector' || layer.locked || !layer.visible) {
      const fresh = makeVector();
      doc.layers.push(fresh);
      doc.activeLayerId = fresh.id;
      layer = fresh;
    }
    if (layer.type === 'vector') {
      const movePoint = (point: Point): Point => ({ x: point.x - layer.x, y: point.y - layer.y });
      layer.shapes.push({
        ...shape,
        x: shape.x - layer.x,
        y: shape.y - layer.y,
        points: shape.points?.map(movePoint),
        controls: shape.controls?.map(movePoint) as [Point, Point] | undefined,
        nodes: shape.nodes?.map(node => ({
          ...movePoint(node),
          in: node.in ? movePoint(node.in) : undefined,
          out: node.out ? movePoint(node.out) : undefined,
        })),
      });
    }
  }),

  updateShape: (id, edit) => get().mutate(doc => {
    for (const layer of doc.layers) {
      if (layer.type !== 'vector' || layer.locked) continue;
      const shape = layer.shapes.find(item => item.id === id);
      if (shape) {
        edit(shape);
        break;
      }
    }
  }),

  removeShape: id => get().mutate(doc => {
    for (const layer of doc.layers) {
      if (layer.type === 'vector' && !layer.locked) {
        layer.shapes = layer.shapes.filter(shape => shape.id !== id);
      }
    }
  }),
}));

export function activeTab(state: EditorStore): EditorTab {
  return state.tabs.find(tab => tab.doc.id === state.activeId) ?? state.tabs[0];
}

export function activeLayer(state: EditorStore): Layer | undefined {
  const doc = activeTab(state).doc;
  return layerById(doc, doc.activeLayerId);
}
