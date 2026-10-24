import { loadPreferences, PREFERENCES_EVENT } from '../settings/preferences';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { activeLayer, activeTab, studioPreviewLayer, useEditor } from '../editor/store';
import { decodeImage, drawChecker, drawShape, renderLayer } from '../editor/render';
import { contains, normalizeRect, rotate, shapeBounds, smoothPath } from '../editor/geometry';
import { previewDrag, type DragOperation } from '../editor/operations';
import { uid, type Layer, type Point, type SelectionRect, type VectorShape } from '../editor/types';
import { drawBrushDab, stabilizedPoint, strokeSamples } from '../editor/brush';
import FocusTextEditor from './FocusTextEditor';
import { renderCreative, renderMotionEcho, paintCreativeLayer } from '../editor/creative-render';
import { evaluatedCreative, setCreativeKeyframe } from '../editor/creative';
import { handleAt, handleCursor, selectableShape, transformHandles } from '../editor/interaction';
import './Canvas.css';

type DrawGesture = {
  kind: 'draw';
  start: Point;
  last: Point;
  layerId: string;
  documentId: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  erase: boolean;
  lastPressure: number;
  lastRaw: Point;
  beforeLast: Point;
};

type Gesture =
  | { kind: 'pan'; start: Point; original: Point }
  | { kind: 'creative-move'; start: Point; last: Point; id: string }
  | { kind: 'creative-ink'; points: Point[]; id: string }
  | { kind: 'creative-ink-node'; id: string; index: number; last: Point }
  | { kind: 'marquee'; start: Point; last: Point }
  | { kind: 'move'; start: Point; last: Point; layerId: string; shapeId: string | null }
  | { kind: 'transform'; mode: 'rotate' | 'scale'; handle: string; start: Point; last: Point;
      layerId: string; shapeId: string | null; bounds: SelectionRect; rotation: number }
  | { kind: 'line-point'; layerId: string; shapeId: string; index: number; start: Point; last: Point }
  | { kind: 'pen-node'; nodeIndex: number; start: Point; last: Point }
  | { kind: 'node'; layerId: string; shapeId: string; index: number; handle: 'anchor' | 'in' | 'out'; start: Point; last: Point }
  | { kind: 'shape'; start: Point; last: Point; shape: VectorShape }
  | { kind: 'loading'; start: Point; last: Point; layerId: string; documentId: string;
      erase: boolean; pressure: number; finish: boolean }
  | DrawGesture;

interface CanvasProps {
  onError?: (error: unknown) => void;
}

function layerBounds(layer: Layer, docWidth: number, docHeight: number): SelectionRect {
  if (layer.type === 'raster') {
    return {
      x: layer.x,
      y: layer.y,
      width: (layer.imageWidth ?? docWidth) * (layer.scaleX ?? 1),
      height: (layer.imageHeight ?? docHeight) * (layer.scaleY ?? 1),
    };
  }
  return { x: layer.x, y: layer.y, width: docWidth, height: docHeight };
}

function shapeHit(point: Point, shape: VectorShape, layer: Layer, zoom: number): boolean {
  const bounds = shapeBounds(shape, layer);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const unrotated = shape.rotation ? rotate(point, center, -shape.rotation) : point;
  const tolerance = Math.max(4 / zoom, shape.strokeWidth / 2);
  return contains({
    x: bounds.x - tolerance,
    y: bounds.y - tolerance,
    width: bounds.width + tolerance * 2,
    height: bounds.height + tolerance * 2,
  }, unrotated);
}

function corners(bounds: SelectionRect): Record<string, Point> {
  return transformHandles(bounds);
}

export default function Canvas({ onError }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const raf = useRef<number>(0);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hoverCursor, setHoverCursor] = useState('crosshair');
  const [draft, setDraft] = useState<VectorShape | null>(null);
  const [drawing, setDrawing] = useState<HTMLCanvasElement | null>(null);
  const paintFrame = useRef<() => void>(() => {});
  const [diagnostics, setDiagnostics] = useState(() => loadPreferences().diagnostics);
  const [checkerSize, setCheckerSize] = useState(() => loadPreferences().canvasCheckerSize);
  useEffect(() => {
    const updateSettings = (): void => {
      const current = loadPreferences();
      setDiagnostics(current.diagnostics);
      setCheckerSize(current.canvasCheckerSize);
    };
    window.addEventListener(PREFERENCES_EVENT, updateSettings);
    return () => window.removeEventListener(PREFERENCES_EVENT, updateSettings);
  }, []);
  const perf = useRef<{ node: HTMLDivElement | null; paints: number; paintMs: number;
    exact: number; lastLatencyMs: number; lastProcessingMs: number; aborted: number;
    cacheHits: number; stages: number; slowest: string; slowestMs: number; queueDepth: number;
    uiFrames: number }>({
    node: null, paints: 0, paintMs: 0, exact: 0,
    lastLatencyMs: 0, lastProcessingMs: 0, aborted: 0,
    cacheHits: 0, stages: 0, slowest: '-', slowestMs: 0, queueDepth: 0,
    uiFrames: 0,
  });
  // Diagnostics are enabled in Settings → Performance. The completed exact
  // FX image throughput is measured separately from the canvas paint rate.
  useEffect(() => {
    if (!diagnostics) return;
    const node = document.createElement('div');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-label', 'Spectrum rendering performance');
    Object.assign(node.style, {
      position: 'fixed', right: '12px', bottom: '12px', zIndex: '10000',
      background: '#141325ed', color: '#c8f5ee', padding: '8px 12px',
      borderRadius: '10px', font: '12px monospace', pointerEvents: 'none',
    });
    document.body.appendChild(node);
    perf.current.node = node;
    const completed = (): void => { perf.current.exact++; };
    const metric = (event: Event): void => {
      const data = (event as CustomEvent<{ aborted: boolean; latencyMs: number; processingMs: number;
        queueDepth?: number; metrics?: { stages: number; reused: number;
          timing: Array<{ kind: string; ms: number; cached: boolean }> } }>).detail;
      if (!data) return;
      perf.current.lastLatencyMs = data.latencyMs;
      perf.current.lastProcessingMs = data.processingMs;
      if (data.aborted) perf.current.aborted++;
      if (data.metrics) {
        perf.current.stages = data.metrics.stages;
        perf.current.cacheHits = data.metrics.reused;
        const slowest = data.metrics.timing.filter(stage => !stage.cached)
          .sort((a, b) => b.ms - a.ms)[0];
        if (slowest) {
          perf.current.slowest = slowest.kind;
          perf.current.slowestMs = slowest.ms;
        }
      }
      perf.current.queueDepth = data.queueDepth ?? 0;
    };
    window.addEventListener('spectrum-exact-fx-frame', completed);
    window.addEventListener('spectrum-aurora-render-metric', metric);
    let frameId = 0;
    const sampleInterfaceFrame = (): void => {
      perf.current.uiFrames++;
      frameId = requestAnimationFrame(sampleInterfaceFrame);
    };
    frameId = requestAnimationFrame(sampleInterfaceFrame);
    const timer = window.setInterval(() => {
      const { paints, paintMs, exact, lastLatencyMs, lastProcessingMs, aborted,
        stages, cacheHits, slowest, slowestMs, queueDepth, uiFrames } = perf.current;
      node.textContent = `UI ${uiFrames} FPS · Canvas ${paints} repaints/s · ${paints ? (paintMs / paints).toFixed(1) : '0'} ms/paint · exact FX ${exact}/s · queue+render ${lastLatencyMs.toFixed(0)}ms · compute ${lastProcessingMs.toFixed(0)}ms · canceled ${aborted}/s · cache ${cacheHits}/${stages} · slowest ${slowest} ${slowestMs.toFixed(0)}ms · pending ${queueDepth}`;
      perf.current.paints = 0;
      perf.current.uiFrames = 0;
      perf.current.paintMs = 0;
      perf.current.exact = 0;
      perf.current.aborted = 0;
    }, 1000);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frameId);
      window.removeEventListener('spectrum-exact-fx-frame', completed);
      window.removeEventListener('spectrum-aurora-render-metric', metric);
      perf.current.node = null;
      node.remove();
    };
  }, [diagnostics]);
  const textEdit = useEditor(state => state.textDraft);
  const penDraft = useRef<VectorShape | null>(null);
  const penDocumentId = useRef<string | null>(null);

  const doc = useEditor(state => activeTab(state).doc);
  const tool = useEditor(state => state.tool);
  const zoom = useEditor(state => state.zoom);
  const pan = useEditor(state => state.pan);
  const grid = useEditor(state => state.grid);
  const color = useEditor(state => state.color);
  const fill = useEditor(state => state.fill);
  const strokeWidth = useEditor(state => state.strokeWidth);
  const selectedShapeId = useEditor(state => state.selectedShapeId);
  const selectedNodeIndex = useEditor(state => state.selectedNodeIndex);
  const selection = useEditor(state => state.selection);
  const smoothing = useEditor(state => state.smoothing);
  const focusMode = useEditor(state => state.focusMode);
  const fxBypassLayerId = useEditor(state => state.fxBypassLayerId);
  const creativePanelOpen = useEditor(state => state.creativePanelOpen);
  const selectedCreativeId = useEditor(state => state.selectedCreativeId);
  const creativePreview = useEditor(state => state.creativePreview);
  const creativeDrawMode = useEditor(state => state.creativeDrawMode);

  const invalidate = useCallback((): void => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      // Preview pixels change independently of React/document state.
      // Repaint the existing canvas, never rerender the entire Canvas tree.
      paintFrame.current();
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // A failed OffscreenCanvas worker must trigger a complete synchronous repaint
  // instead of leaving the preview frozen on the previous bitmap.
  useEffect(() => {
    window.addEventListener('spectrum-worker-fallback', invalidate);
    window.addEventListener('spectrum-studio-preview', invalidate);
    return () => {
      window.removeEventListener('spectrum-worker-fallback', invalidate);
      window.removeEventListener('spectrum-studio-preview', invalidate);
    };
  }, [invalidate]);

  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect;
      if (bounds) {
        setSize({ width: Math.max(1, Math.floor(bounds.width)), height: Math.max(1, Math.floor(bounds.height)) });
      }
    });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  const position = useCallback((event: { clientX: number; clientY: number }): Point => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left - bounds.width / 2 - pan.x) / zoom + doc.width / 2,
      y: (event.clientY - bounds.top - bounds.height / 2 - pan.y) / zoom + doc.height / 2,
    };
  }, [doc.height, doc.width, pan.x, pan.y, zoom]);

  function operationFromGesture(current: Gesture | null): { layerId: string; action: DragOperation } | null {
    if (!current) return null;
    if (current.kind === 'move' || current.kind === 'node' || current.kind === 'line-point') {
      const { x: dx, y: dy } = {
        x: current.last.x - current.start.x,
        y: current.last.y - current.start.y,
      };
      if (current.kind === 'line-point') {
        return { layerId: current.layerId, action: {
          kind: 'line-point', shapeId: current.shapeId, index: current.index, dx, dy,
        } };
      }
      if (current.kind === 'move') {
        return { layerId: current.layerId, action: { kind: 'move', shapeId: current.shapeId, dx, dy } };
      }
      return {
        layerId: current.layerId,
        action: {
          kind: 'node', shapeId: current.shapeId, index: current.index,
          handle: current.handle, dx, dy,
        },
      };
    }
    if (current.kind === 'transform') {
      return {
        layerId: current.layerId,
        action: {
          kind: 'transform', shapeId: current.shapeId, mode: current.mode,
          handle: current.handle, bounds: current.bounds,
          start: current.start, last: current.last,
        },
      };
    }
    return null;
  }

  useEffect(() => {
    paintFrame.current = () => {
    const startPaint = perf.current.node ? performance.now() : 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.round(size.width * dpr);
    const targetHeight = Math.round(size.height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.translate(size.width / 2 + pan.x - doc.width * zoom / 2, size.height / 2 + pan.y - doc.height * zoom / 2);
    ctx.scale(zoom, zoom);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 24 / zoom;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(0, 0, doc.width, doc.height);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, doc.width, doc.height);
    ctx.clip();
    if (doc.background === 'transparent') drawChecker(ctx, doc.width, doc.height, checkerSize);
    else {
      ctx.fillStyle = doc.background;
      ctx.fillRect(0, 0, doc.width, doc.height);
    }

    // Ghost cels are reference-only: never recorded into the active frame or exported.
    if (doc.animation?.onion.enabled) {
      const { frames, currentFrame, onion } = doc.animation;
      const ghost = (index: number, distance: number): void => {
        const frame = frames[index];
        if (!frame) return;
        ctx.save();
        ctx.globalAlpha *= onion.opacity / Math.pow(1.6, distance - 1);
        for (const ghostLayer of frame.layers) renderLayer(ctx, ghostLayer, invalidate, doc.width, doc.height);
        ctx.restore();
      };
      for (let distance = onion.previous; distance >= 1; distance--) {
        ghost(currentFrame - distance, distance);
      }
      for (let distance = onion.next; distance >= 1; distance--) {
        ghost(currentFrame + distance, distance);
      }
    }

    const working = gesture.current?.kind === 'draw' ? gesture.current : null;
    const operation = operationFromGesture(gesture.current);
    const layers = doc.layers.map(original => {
      const layer = studioPreviewLayer(doc.id, original);
      const preview = operation && layer.id === operation.layerId
        ? previewDrag(layer, operation.action, doc.width, doc.height) : layer;
      const withoutEditingText = textEdit?.id && textEdit.layerId === preview.id && preview.type === 'vector'
        ? { ...preview, shapes: preview.shapes.filter(shape => shape.id !== textEdit.id) } : preview;
      return withoutEditingText.id === fxBypassLayerId
        ? { ...withoutEditingText, effects: [] } : withoutEditingText;
    });
    const creativeDoc = creativePreview && doc.creative?.some(item => item.id === creativePreview.id)
      ? { ...doc, creative: doc.creative.map(item => item.id === creativePreview.id ? creativePreview : item) }
      : doc;
    renderMotionEcho(ctx, creativeDoc, (target, layer) => renderLayer(target, layer, invalidate, doc.width, doc.height));
    for (const layer of layers) {
      if (drawing && working && layer.id === working.layerId && layer.type === 'raster' && layer.visible) {
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blend;
        if (layer.mask) {
          ctx.beginPath();
          ctx.rect(layer.mask.x, layer.mask.y, layer.mask.width, layer.mask.height);
          ctx.clip();
        }
        ctx.drawImage(drawing, layer.x, layer.y);
        ctx.restore();
      } else paintCreativeLayer(ctx, layer, creativeDoc, (target, adjusted) =>
        renderLayer(target, adjusted, invalidate, doc.width, doc.height));
    }

    renderCreative(ctx, creativeDoc);
    if (draft) drawShape(ctx, draft);
    const selectedCreative = creativePanelOpen && selectedCreativeId
      ? creativeDoc.creative?.find(item => item.id === selectedCreativeId) : undefined;
    if (selectedCreative) {
      if (selectedCreative.kind === 'livingInk') {
        ctx.save();
        ctx.fillStyle = '#fff4bf'; ctx.strokeStyle = '#704edc'; ctx.lineWidth = 1.5 / zoom;
        for (const p of selectedCreative.points ?? []) {
          ctx.fillRect(p.x - 5 / zoom, p.y - 5 / zoom, 10 / zoom, 10 / zoom);
          ctx.strokeRect(p.x - 5 / zoom, p.y - 5 / zoom, 10 / zoom, 10 / zoom);
        }
        ctx.restore();
      }
      const marker = evaluatedCreative(selectedCreative, doc.animation?.currentFrame ?? 0);
      ctx.save();
      ctx.strokeStyle = '#f8d76e';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 13 / zoom, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(marker.x - 18 / zoom, marker.y);
      ctx.lineTo(marker.x + 18 / zoom, marker.y);
      ctx.moveTo(marker.x, marker.y - 18 / zoom);
      ctx.lineTo(marker.x, marker.y + 18 / zoom); ctx.stroke();
      ctx.restore();
    }
    if (gesture.current?.kind === 'creative-ink') {
      const points = gesture.current.points;
      ctx.save(); ctx.strokeStyle = '#ffcf6f'; ctx.lineWidth = 2 / zoom;
      ctx.beginPath(); points.forEach((point, i) => { if (i) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y); });
      ctx.stroke(); ctx.restore();
    }
    if (grid && zoom >= 0.6) {
      ctx.strokeStyle = 'rgba(150,160,185,.22)';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      for (let x = 0; x <= doc.width; x += 50) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, doc.height);
      }
      for (let y = 0; y <= doc.height; y += 50) {
        ctx.moveTo(0, y);
        ctx.lineTo(doc.width, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    const active = layers.find(layer => layer.id === doc.activeLayerId);
    const selected = active?.type === 'vector' ? active.shapes.find(shape => shape.id === selectedShapeId) : undefined;
    const bounds = selected && active ? shapeBounds(selected, active) : tool === 'move' && active && !selectedShapeId
      ? layerBounds(active, doc.width, doc.height) : null;
    const drag = gesture.current;

    if (bounds && !active?.locked && (tool === 'move' || tool === 'node' || tool === 'text' || selected?.kind === 'text')) {
      const outline = bounds;
      const rotation = selected?.rotation ?? (active?.type === 'raster' ? active.rotation ?? 0 : 0);
      const center = { x: outline.x + outline.width / 2, y: outline.y + outline.height / 2 };
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.translate(-center.x, -center.y);
      ctx.strokeStyle = '#8adfff';
      ctx.fillStyle = '#f7fcff';
      ctx.lineWidth = 1.4 / zoom;
      ctx.setLineDash([5 / zoom, 3 / zoom]);
      ctx.strokeRect(outline.x, outline.y, outline.width, outline.height);
      ctx.setLineDash([]);
      if (tool === 'move' || tool === 'text' || selected?.kind === 'text') {
        for (const [key, point] of Object.entries(corners(outline))) {
          const radius = key === 'rotate' ? 5 : 4;
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        const upper = corners(outline);
        ctx.beginPath();
        ctx.moveTo(outline.x + outline.width / 2, outline.y);
        ctx.lineTo(upper.rotate.x, upper.rotate.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (tool === 'node' && selected?.kind === 'line' && selected.controls && active) {
      const targets = [
        { x: selected.x, y: selected.y },
        selected.controls[0], selected.controls[1],
        { x: selected.x + selected.width, y: selected.y + selected.height },
      ];
      ctx.save();
      ctx.lineWidth = 1.25 / zoom;
      ctx.strokeStyle = '#ffb060';
      ctx.beginPath();
      ctx.moveTo(targets[0].x + active.x, targets[0].y + active.y);
      ctx.lineTo(targets[1].x + active.x, targets[1].y + active.y);
      ctx.moveTo(targets[2].x + active.x, targets[2].y + active.y);
      ctx.lineTo(targets[3].x + active.x, targets[3].y + active.y);
      ctx.stroke();
      targets.forEach((target, index) => {
        ctx.fillStyle = index === 0 || index === 3 ? '#ebf6ff' : '#ffb96e';
        ctx.strokeStyle = '#28507a';
        ctx.fillRect(target.x + active.x - 5 / zoom, target.y + active.y - 5 / zoom, 10 / zoom, 10 / zoom);
        ctx.strokeRect(target.x + active.x - 5 / zoom, target.y + active.y - 5 / zoom, 10 / zoom, 10 / zoom);
      });
      ctx.restore();
    }

    if (tool === 'node' && selected?.nodes?.length && active) {
      ctx.save();
      ctx.lineWidth = 1.2 / zoom;
      selected.nodes.forEach((node, index) => {
        for (const key of ['in', 'out'] as const) {
          const handle = node[key];
          if (!handle) continue;
          ctx.strokeStyle = '#ffc68b';
          ctx.beginPath();
          ctx.moveTo(node.x + active.x, node.y + active.y);
          ctx.lineTo(handle.x + active.x, handle.y + active.y);
          ctx.stroke();
          ctx.fillStyle = '#f4bf74';
          ctx.fillRect(handle.x + active.x - 3 / zoom, handle.y + active.y - 3 / zoom, 6 / zoom, 6 / zoom);
        }
        ctx.fillStyle = selectedNodeIndex === index ? '#f5b461' : '#f1faff';
        ctx.strokeStyle = '#2a92d6';
        ctx.fillRect(node.x + active.x - 4 / zoom, node.y + active.y - 4 / zoom, 8 / zoom, 8 / zoom);
        ctx.strokeRect(node.x + active.x - 4 / zoom, node.y + active.y - 4 / zoom, 8 / zoom, 8 / zoom);
      });
      ctx.restore();
    }

    const rectangle = drag?.kind === 'marquee' ? normalizeRect(drag.start, drag.last) : selection;
    if (rectangle) {
      ctx.save();
      ctx.strokeStyle = '#70d9ff';
      ctx.lineWidth = 1.4 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
      ctx.restore();
    }
    if (perf.current.node) {
      perf.current.paints++;
      perf.current.paintMs += performance.now() - startPaint;
    }
    };
    paintFrame.current();
    return () => { paintFrame.current = () => {}; };
  }, [doc, size, zoom, pan, grid, checkerSize, draft, drawing, selectedShapeId, selectedNodeIndex, selection, tool, fxBypassLayerId, creativePanelOpen, selectedCreativeId, creativePreview, creativeDrawMode, textEdit?.id, textEdit?.layerId, invalidate]);

  function dab(current: DrawGesture, point: Point, pressure: number, finalize = false): void {
    const editor = useEditor.getState();
    const document = activeTab(editor).doc;
    const layer = document.layers.find(item => item.id === current.layerId);
    if (document.id !== current.documentId || !layer || layer.type !== 'raster') return;
    const last = current.last;
    const filtered = stabilizedPoint(last, point, editor.smoothing, finalize);
    const distance = Math.hypot(filtered.x - last.x, filtered.y - last.y);
    const radius = editor.strokeWidth / 2;
    const steps = Math.max(0.7, radius * 0.3);
    const ctx = current.ctx;
    ctx.save();
    const mask = editor.selection;
    if (mask) {
      ctx.beginPath();
      ctx.rect(mask.x - layer.x, mask.y - layer.y, mask.width, mask.height);
      ctx.clip();
    }
    if (layer.mask) {
      ctx.beginPath();
      ctx.rect(layer.mask.x - layer.x, layer.mask.y - layer.y, layer.mask.width, layer.mask.height);
      ctx.clip();
    }
    const path = distance === 0 ? [filtered] : strokeSamples(current.beforeLast, last, filtered, steps);
    for (const sample of path) {
      const position = { x: sample.x - layer.x, y: sample.y - layer.y };
      const opacityAtPoint = editor.opacity * Math.max(0.1, pressure || 1);
      drawBrushDab(ctx, position, {
        radius: radius * Math.max(0.2, pressure || 1),
        hardness: editor.hardness,
        opacity: opacityAtPoint,
        color: editor.color,
        erase: current.erase,
      });
    }
    ctx.restore();
    current.beforeLast = last;
    current.last = filtered;
    current.lastRaw = point;
    current.lastPressure = pressure;
    invalidate();
  }

  function commitDrawing(current: DrawGesture): void {
    const image = current.canvas.toDataURL('image/png');
    const state = useEditor.getState();
    if (activeTab(state).doc.id === current.documentId) {
      state.mutate(document => {
        const layer = document.layers.find(item => item.id === current.layerId);
        if (layer?.type === 'raster' && !layer.locked) {
          layer.image = image;
          layer.imageWidth = current.canvas.width;
          layer.imageHeight = current.canvas.height;
        }
      });
    }
    if (gesture.current === current) gesture.current = null;
    setDrawing(null);
  }

  function startDrawing(start: Point, layerId: string, source: string, erase: boolean, pressure: number): void {
    const documentId = activeTab(useEditor.getState()).doc.id;
    const pending: Extract<Gesture, { kind: 'loading' }> = {
      kind: 'loading', start, last: start, layerId, documentId, erase, pressure, finish: false,
    };
    gesture.current = pending;
    void decodeImage(source).then(image => {
      if (gesture.current !== pending) return;
      const document = activeTab(useEditor.getState()).doc;
      const layer = document.layers.find(item => item.id === layerId);
      if (document.id !== documentId || layer?.type !== 'raster' || layer.locked) {
        gesture.current = null;
        return;
      }
      const working = window.document.createElement('canvas');
      working.width = document.width;
      working.height = document.height;
      const ctx = working.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is unavailable.');
      if (image) ctx.drawImage(image, 0, 0);
      const current: DrawGesture = {
        kind: 'draw', start, last: start, lastRaw: start, beforeLast: start, layerId, documentId, canvas: working, ctx, erase, lastPressure: pressure,
      };
      gesture.current = current;
      dab(current, start, pressure);
      if (pending.last.x !== start.x || pending.last.y !== start.y) dab(current, pending.last, pressure);
      setDrawing(working);
      if (pending.finish) {
        dab(current, current.lastRaw, current.lastPressure, true);
        commitDrawing(current);
      }
    }).catch(error => {
      gesture.current = null;
      setDrawing(null);
      onError?.(error);
    });
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0 && event.button !== 1) return;
    const point = position(event);
    setCursor(point);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    const state = useEditor.getState();
    // A second canvas click commits the previous text edit before starting a new operation.
    if (state.textDraft) state.commitTextDraft();
    const layer = activeLayer(useEditor.getState());

    if (event.button === 1 || tool === 'hand' || event.altKey) {
      gesture.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, original: { ...pan } };
      return;
    }
    const activeCreative = state.creativePanelOpen && state.selectedCreativeId
      ? doc.creative?.find(item => item.id === state.selectedCreativeId) : undefined;
    if (activeCreative && activeCreative.kind === 'livingInk' && !state.creativeDrawMode) {
      const index = (activeCreative.points ?? []).findIndex(vertex =>
        Math.hypot(vertex.x - point.x, vertex.y - point.y) < 10 / zoom);
      if (index >= 0) {
        gesture.current = { kind: 'creative-ink-node', id: activeCreative.id, index, last: point };
        return;
      }
    }
    if (activeCreative && state.creativeDrawMode && activeCreative.kind === 'livingInk') {
      gesture.current = { kind: 'creative-ink', id: activeCreative.id, points: [point] };
      return;
    }
    if (activeCreative && Math.hypot(point.x - activeCreative.x, point.y - activeCreative.y) < 24 / zoom) {
      gesture.current = { kind: 'creative-move', id: activeCreative.id, start: point, last: point };
      return;
    }
    // Text is selectable even when a painting or shape tool is active. Ctrl+click
    // deliberately bypasses text hit-testing for users who want to paint over it.
    if (!event.ctrlKey) {
      const selectedLayer = activeLayer(state);
      const selectedText = selectedLayer?.type === 'vector'
        ? selectedLayer.shapes.find(shape => shape.id === state.selectedShapeId && shape.kind === 'text') : undefined;
      if (selectedText && selectedLayer && !selectedLayer.locked) {
        const bounds = shapeBounds(selectedText, selectedLayer);
        const handle = handleAt(point, bounds, selectedText.rotation ?? 0, zoom);
        if (handle) {
          gesture.current = {
            kind: 'transform', mode: handle === 'rotate' ? 'rotate' : 'scale', handle,
            start: point, last: point, layerId: selectedLayer.id, shapeId: selectedText.id,
            bounds, rotation: selectedText.rotation ?? 0,
          };
          return;
        }
      }
      const textHit = selectableShape(point, doc.layers, zoom, true);
      if (textHit) {
        state.selectLayer(textHit.layer.id);
        state.selectShape(textHit.shape.id);
        gesture.current = {
          kind: 'move', start: point, last: point,
          layerId: textHit.layer.id, shapeId: textHit.shape.id,
        };
        return;
      }
    }
    if (tool === 'marquee') {
      gesture.current = { kind: 'marquee', start: point, last: point };
      state.setSelection(null);
      return;
    }
    if (tool === 'eyedropper') {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const bounds = canvas?.getBoundingClientRect();
      if (!canvas || !ctx || !bounds) return;
      const x = Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width);
      const y = Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
      const sample = ctx.getImageData(x, y, 1, 1).data;
      state.setColor(`#${[...sample.slice(0, 3)].map(value => value.toString(16).padStart(2, '0')).join('')}`);
      return;
    }
    if (tool === 'node') {
      const vectorLayer = layer?.type === 'vector' ? layer : null;
      const selected = vectorLayer?.shapes.find(shape => shape.id === selectedShapeId);
      if (selected?.kind === 'line' && selected.controls && vectorLayer) {
        const targets = [
          { x: selected.x, y: selected.y },
          selected.controls[0], selected.controls[1],
          { x: selected.x + selected.width, y: selected.y + selected.height },
        ];
        for (let index = 0; index < 4; index++) {
          const target = targets[index];
          if (Math.hypot(point.x - target.x - vectorLayer.x, point.y - target.y - vectorLayer.y) <= 12 / zoom) {
            gesture.current = {
              kind: 'line-point', layerId: vectorLayer.id,
              shapeId: selected.id, index, start: point, last: point,
            };
            return;
          }
        }
      }
      if (selected?.nodes && vectorLayer) {
        for (let index = selected.nodes.length - 1; index >= 0; index--) {
          const node = selected.nodes[index];
          for (const handle of ['in', 'out', 'anchor'] as const) {
            const target = handle === 'anchor' ? node : node[handle];
            if (!target || Math.hypot(point.x - target.x - vectorLayer.x, point.y - target.y - vectorLayer.y) > 9 / zoom) continue;
            gesture.current = { kind: 'node', layerId: vectorLayer.id, shapeId: selected.id, index, handle, start: point, last: point };
            state.selectNode(index);
            return;
          }
        }
      }
      const hit = [...doc.layers].reverse().flatMap(item => item.type === 'vector' && !item.locked && item.visible
        ? [...item.shapes].reverse().map(shape => ({ layer: item, shape })) : [])
        .find(entry => shapeHit(point, entry.shape, entry.layer, zoom));
      if (hit) state.selectLayer(hit.layer.id);
      state.selectShape(hit?.shape.id ?? null);
      return;
    }
    if (tool === 'move') {
      if (layer && !layer.locked) {
        const shape = layer.type === 'vector' ? layer.shapes.find(item => item.id === selectedShapeId) : undefined;
        const bounds = shape ? shapeBounds(shape, layer) : layerBounds(layer, doc.width, doc.height);
        const rotation = shape?.rotation ?? (layer.type === 'raster' ? layer.rotation ?? 0 : 0);
        const handle = handleAt(point, bounds, rotation, zoom);
        if (handle) {
          gesture.current = {
            kind: 'transform', mode: handle === 'rotate' ? 'rotate' : 'scale', handle,
            start: point, last: point, layerId: layer.id, shapeId: shape?.id ?? null, bounds, rotation,
          };
          return;
        }
      }
      const hit = [...doc.layers].reverse().flatMap(item => item.type === 'vector' && !item.locked && item.visible
        ? [...item.shapes].reverse().map(shape => ({ layer: item, shape })) : [])
        .find(entry => shapeHit(point, entry.shape, entry.layer, zoom));
      if (hit) {
        state.selectLayer(hit.layer.id);
        state.selectShape(hit.shape.id);
        gesture.current = { kind: 'move', start: point, last: point, layerId: hit.layer.id, shapeId: hit.shape.id };
      } else if (layer && !layer.locked && layer.visible) {
        state.selectShape(null);
        gesture.current = { kind: 'move', start: point, last: point, layerId: layer.id, shapeId: null };
      }
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      if (layer?.locked || (layer && !layer.visible)) return;
      if (layer?.type === 'raster' && ((layer.scaleX ?? 1) !== 1 || (layer.scaleY ?? 1) !== 1 || layer.rotation)) {
        onError?.(new Error('Rasterize transformed layers or paint on a new layer.'));
        return;
      }
      if (layer?.type !== 'raster') state.addLayer('raster');
      const target = activeLayer(useEditor.getState());
      if (target?.type === 'raster') startDrawing(point, target.id, target.image, tool === 'eraser', event.pointerType === 'pen' ? event.pressure || 1 : 1);
      return;
    }
    if (tool === 'pen') {
      if (!penDraft.current) {
        penDocumentId.current = doc.id;
        penDraft.current = {
          id: uid(), kind: 'path', x: point.x, y: point.y, width: 0, height: 0,
          fill: 'none', stroke: color, strokeWidth: Math.max(1, strokeWidth / 3), nodes: [],
        };
      }
      const nodes = penDraft.current.nodes!;
      if (nodes.length && Math.hypot(nodes[nodes.length - 1].x - point.x, nodes[nodes.length - 1].y - point.y) < 1) {
        return;
      }
      nodes.push({ x: point.x, y: point.y });
      gesture.current = { kind: 'pen-node', nodeIndex: nodes.length - 1, start: point, last: point };
      setDraft(structuredClone(penDraft.current));
      return;
    }
    if (tool === 'text') {
      const hit = selectableShape(point, doc.layers, zoom, true);
      if (hit) {
        // Single click selects and drags. Only a double click enters editing mode.
        state.selectLayer(hit.layer.id);
        state.selectShape(hit.shape.id);
        gesture.current = {
          kind: 'move', start: point, last: point, layerId: hit.layer.id, shapeId: hit.shape.id,
        };
      } else {
        state.startTextDraft({
          ...state.textDefaults, sessionId: uid(), id: null,
          layerId: layer?.id ?? null, documentId: doc.id,
          x: point.x, y: point.y, value: '',
        });
      }
      return;
    }
    if (['rectangle', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'line', 'freehand'].includes(tool)) {
      const kind = tool === 'rectangle' ? 'rect' : tool === 'freehand' ? 'path' : tool;
      const shape: VectorShape = {
        id: uid(), kind: kind as VectorShape['kind'], x: point.x, y: point.y, width: 0, height: 0,
        fill: kind === 'line' || kind === 'path' ? 'none' : fill,
        stroke: color, strokeWidth: Math.max(1, strokeWidth / 3),
        points: kind === 'path' ? [point] : undefined,
        sides: kind === 'star' ? 5 : kind === 'polygon' ? 6 : undefined,
        cornerRadius: kind === 'roundedRect' ? 16 : undefined,
        innerRatio: kind === 'star' ? 0.45 : kind === 'ring' ? 0.58 : undefined,
      };
      gesture.current = { kind: 'shape', start: point, last: point, shape };
      setDraft(shape);
    }
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const point = position(event);
    setCursor(point);
    const current = gesture.current;
    if (!current) {
      const activeState = useEditor.getState();
      const selectedLayer = activeLayer(activeState);
      const selectedShape = selectedLayer?.type === 'vector'
        ? selectedLayer.shapes.find(shape => shape.id === activeState.selectedShapeId) : undefined;
      const activeCreative = activeState.creativePanelOpen && activeState.selectedCreativeId
        ? doc.creative?.find(o => o.id === activeState.selectedCreativeId) : undefined;
      if (activeCreative?.kind === 'livingInk' && activeCreative.points?.some(vertex =>
        Math.hypot(vertex.x - point.x, vertex.y - point.y) < 10 / zoom)) {
        setHoverCursor('crosshair');
        return;
      }
      if (activeCreative && Math.hypot(point.x - activeCreative.x, point.y - activeCreative.y) < 24 / zoom) {
        setHoverCursor('move');
        return;
      }
      let nextCursor = tool === 'hand' ? 'grab' : tool === 'move' ? 'default' : 'crosshair';
      if ((tool === 'move' || tool === 'text' || selectedShape?.kind === 'text') && selectedLayer && !selectedLayer.locked) {
        const bounds = selectedShape ? shapeBounds(selectedShape, selectedLayer)
          : layerBounds(selectedLayer, doc.width, doc.height);
        const handle = handleAt(point, bounds, selectedShape?.rotation ?? 0, zoom);
        if (handle) nextCursor = handleCursor(handle, selectedShape?.rotation ?? 0);
      }
      if (nextCursor === 'default' || nextCursor === 'crosshair') {
        if (selectableShape(point, doc.layers, zoom, true) ||
          ((tool === 'move' || tool === 'text') && selectableShape(point, doc.layers, zoom, false))) {
          nextCursor = 'move';
        } else if (tool === 'text') nextCursor = 'text';
      }
      setHoverCursor(previous => previous === nextCursor ? previous : nextCursor);
      return;
    }
    if (current.kind === 'creative-move') {
      current.last = point;
      const original = doc.creative?.find(item => item.id === current.id);
      if (original) {
        const shifted = {
          ...original,
          x: original.x + point.x - current.start.x,
          y: original.y + point.y - current.start.y,
        };
        if (doc.animation) {
          setCreativeKeyframe(shifted, 'x', doc.animation.currentFrame);
          setCreativeKeyframe(shifted, 'y', doc.animation.currentFrame);
        }
        useEditor.getState().previewCreative(shifted);
      }
      invalidate();
    } else if (current.kind === 'creative-ink-node') {
      current.last = point;
      const original = doc.creative?.find(item => item.id === current.id);
      if (original?.points?.[current.index]) {
        const updated = structuredClone(original);
        updated.points![current.index] = point;
        useEditor.getState().previewCreative(updated);
      }
      invalidate();
    } else if (current.kind === 'creative-ink') {
      const last = current.points[current.points.length - 1];
      if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 2 / zoom) current.points.push(point);
      invalidate();
    } else if (current.kind === 'pan') {
      useEditor.getState().setPan({
        x: current.original.x + event.clientX - current.start.x,
        y: current.original.y + event.clientY - current.start.y,
      });
    } else if (current.kind === 'loading') {
      current.last = point;
    } else if (current.kind === 'draw') {
      const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
      if (samples.length) {
        for (const sample of samples) {
          dab(current, position(sample), event.pointerType === 'pen' ? sample.pressure || 1 : 1);
        }
      } else {
        dab(current, point, event.pointerType === 'pen' ? event.pressure || 1 : 1);
      }
    } else if (current.kind === 'pen-node') {
      const shape = penDraft.current;
      const node = shape?.nodes?.[current.nodeIndex];
      if (node) {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        node.in = { x: node.x - dx, y: node.y - dy };
        node.out = { x: point.x, y: point.y };
        setDraft(structuredClone(shape!));
      }
      current.last = point;
    } else if (current.kind === 'node' || current.kind === 'line-point' || current.kind === 'move' || current.kind === 'transform' || current.kind === 'marquee') {
      current.last = point;
      invalidate();
    } else if (current.kind === 'shape') {
      const shape = current.shape;
      if (shape.kind === 'path') {
        shape.points?.push(point);
        const bounds = shapeBounds(shape);
        Object.assign(shape, bounds);
      } else if (shape.kind === 'line') {
        shape.width = point.x - current.start.x;
        shape.height = point.y - current.start.y;
        shape.controls = [
          { x: current.start.x + shape.width / 3, y: current.start.y + shape.height / 3 },
          { x: current.start.x + shape.width * 2 / 3, y: current.start.y + shape.height * 2 / 3 },
        ];
      } else {
        Object.assign(shape, normalizeRect(current.start, point));
      }
      current.last = point;
      setDraft({ ...shape, points: shape.points ? [...shape.points] : undefined });
    }
  }

  function editText(event: ReactMouseEvent<HTMLCanvasElement>): void {
    // Double-click edits text regardless of the current drawing tool.
    const point = position(event);
    const state = useEditor.getState();
    for (const layer of [...doc.layers].reverse()) {
      if (layer.type !== 'vector' || !layer.visible || layer.locked) continue;
      const shape = [...layer.shapes].reverse().find(item =>
        item.kind === 'text' && shapeHit(point, item, layer, zoom));
      if (!shape) continue;
      state.selectLayer(layer.id);
      state.selectShape(shape.id);
      state.startTextDraft({
        sessionId: uid(), id: shape.id, layerId: layer.id, documentId: doc.id,
        x: shape.x + layer.x, y: shape.y + layer.y, value: shape.text ?? '',
        fontSize: shape.fontSize ?? 48, color: shape.fill,
        fontFamily: shape.fontFamily ?? 'Arial', fontWeight: shape.fontWeight ?? '400',
        fontStyle: shape.fontStyle ?? 'normal', lineHeight: shape.lineHeight ?? 1.25, letterSpacing: shape.letterSpacing ?? 0,
        textAlign: shape.textAlign ?? 'left',
        textDecoration: shape.textDecoration ?? 'none', textTransform: shape.textTransform ?? 'none',
        fontVariant: shape.fontVariant ?? 'normal', textBackground: shape.textBackground ?? 'none',
        textPadding: shape.textPadding ?? 0, textShadowColor: shape.textShadowColor ?? '#111827',
        textShadowBlur: shape.textShadowBlur ?? 0, textShadowX: shape.textShadowX ?? 0,
        textShadowY: shape.textShadowY ?? 0,
      });
      return;
    }
  }

  function pointerUp(): void {
    const current = gesture.current;
    if (!current) return;
    if (current.kind === 'loading') {
      current.finish = true;
      return;
    }
    gesture.current = null;
    const state = useEditor.getState();
    if (current.kind === 'creative-move' || current.kind === 'creative-ink-node') {
      state.commitCreativePreview();
      return;
    }
    if (current.kind === 'creative-ink') {
      if (current.points.length > 1) state.updateCreative(current.id, { points: current.points });
      state.setCreativeDrawMode(false);
      return;
    }
    if (current.kind === 'draw') {
      if (Math.hypot(current.lastRaw.x - current.last.x, current.lastRaw.y - current.last.y) > 0.25) {
        dab(current, current.lastRaw, current.lastPressure, true);
      }
      commitDrawing(current);
    }
    if (current.kind === 'marquee') {
      const bounds = normalizeRect(current.start, current.last);
      state.setSelection(bounds.width > 2 && bounds.height > 2 ? bounds : null);
    }
    if (current.kind === 'pen-node') return;
    if (current.kind === 'shape') {
      const shape = current.shape;
      if (shape.kind === 'path' && shape.points && shape.points.length >= 2) {
        if (smoothing > 0) {
          shape.nodes = smoothPath(shape.points, smoothing);
          delete shape.points;
        }
        Object.assign(shape, shapeBounds(shape));
      }
      const valid = shape.kind === 'path' ? (shape.nodes?.length ?? shape.points?.length ?? 0) >= 2
        : Math.abs(shape.width) > 2 || Math.abs(shape.height) > 2;
      if (valid) {
        state.addShape(shape);
        state.selectShape(shape.id);
        state.setTool(shape.kind === 'line' ? 'node' : 'move');
      }
      setDraft(null);
    }
    const operation = operationFromGesture(current);
    if (operation) {
      const action = operation.action;
      const moved = action.kind === 'transform'
        ? Math.hypot(action.last.x - action.start.x, action.last.y - action.start.y) > 0.1
        : Math.hypot(action.dx, action.dy) > 0.1;
      if (!moved) return;
      state.mutate(document => {
        const index = document.layers.findIndex(layer => layer.id === operation.layerId);
        if (index < 0) return;
        document.layers[index] = previewDrag(document.layers[index], action, document.width, document.height);
      });
    }
  }

  useEffect(() => {
    const cancel = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (gesture.current) {
        gesture.current = null;
        setDrawing(null);
        setDraft(null);
        invalidate();
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [invalidate]);

  useEffect(() => {
    const finalizePen = (): void => {
      const shape = penDraft.current;
      penDraft.current = null;
      const originDocument = penDocumentId.current;
      penDocumentId.current = null;
      setDraft(null);
      if (!shape || originDocument !== activeTab(useEditor.getState()).doc.id || (shape.nodes?.length ?? 0) < 2) return;
      Object.assign(shape, shapeBounds(shape));
      useEditor.getState().addShape(shape);
      useEditor.getState().selectShape(shape.id);
      useEditor.getState().setTool('node');
    };
    const keyHandler = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (!penDraft.current) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        finalizePen();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        penDraft.current = null;
        penDocumentId.current = null;
        setDraft(null);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        penDraft.current.nodes?.pop();
        setDraft(structuredClone(penDraft.current));
      }
    };
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('spectrum-finish-pen', finalizePen);
    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('spectrum-finish-pen', finalizePen);
    };
  }, []);

  useEffect(() => {
    const shape = penDraft.current;
    if (!shape) return;
    const belongsToActiveDocument = penDocumentId.current === doc.id;
    if (tool !== 'pen' || !belongsToActiveDocument) {
      penDraft.current = null;
      penDocumentId.current = null;
      setDraft(null);
      if (belongsToActiveDocument && (shape.nodes?.length ?? 0) >= 2) {
        Object.assign(shape, shapeBounds(shape));
        const editor = useEditor.getState();
        editor.addShape(shape);
        editor.selectShape(shape.id);
      }
    }
  }, [tool, doc.id, doc.animation?.currentFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const editor = useEditor.getState();
      if (event.ctrlKey || event.metaKey) editor.setZoom(editor.zoom * Math.exp(-event.deltaY * 0.0015));
      else if (event.shiftKey) editor.setPan({ x: editor.pan.x - event.deltaY, y: editor.pan.y });
      else editor.setPan({ x: editor.pan.x - event.deltaX, y: editor.pan.y - event.deltaY });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div ref={hostRef} className="canvas-host">
      <canvas
        ref={canvasRef}
        className="artboard-canvas"
        aria-label="Spectrum artwork canvas"
        tabIndex={0}
        style={{ cursor: gesture.current?.kind === 'pan' ? 'grabbing'
          : gesture.current?.kind === 'move' ? 'grabbing' : hoverCursor }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerLeave={() => setHoverCursor(tool === 'move' ? 'default' : tool === 'text' ? 'text' : 'crosshair')}
        onPointerUp={pointerUp}
        onPointerCancel={() => { gesture.current = null; useEditor.getState().previewCreative(null); setDraft(null); setDrawing(null); invalidate(); }}
        onDoubleClick={event => {
          if (selectableShape(position(event), doc.layers, zoom, true)) editText(event);
          else if (tool === 'pen') window.dispatchEvent(new Event('spectrum-finish-pen'));
        }}
        onContextMenu={event => event.preventDefault()}
      />
      {focusMode && (
        <button className="focus-exit" type="button"
          onClick={() => useEditor.getState().setFocusMode(false)}
          title="Exit Focus Mode (or press Tab while canvas is focused)">Exit focus</button>
      )}
      <FocusTextEditor />
      <div className="canvas-hint">
        {cursor ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)}` : 'Canvas'}
        {' · '}{Math.round(zoom * 100)}%{' · '}{doc.width} × {doc.height}
      </div>
    </div>
  );
}

