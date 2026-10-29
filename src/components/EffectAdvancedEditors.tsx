import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Dialog } from '@mui/material';
import type { Effect, EffectParameters, GradientStop, CurvePoint, ShadowEntry, Layer, BackgroundMaskStroke } from '../editor/types';
import { activeTab, useEditor } from '../editor/store';
import { applyEffect } from '../editor/effect-ops';
import { DEFAULT_CURVE_POINTS, DEFAULT_DUOTONE_STOPS, DEFAULT_GRADIENT_STOPS, DEFAULT_GLOW_STOPS, DEFAULT_SHADOWS } from '../editor/effect-schema';

interface EditorProps {
  effect: Effect;
  preview: (parameters: EffectParameters) => void;
  commit: () => void;
  sourceLayer?: Layer;
}

const hex = /^#[\da-f]{6}$/i;
const number = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

/** Native color-wheel events reach React immediately; artwork is scheduled on
 * animation frames, never on a trailing 100ms debounce. This also handles
 * keyboard commits, blur, and closing the native color dialog. */
export function PreviewColorInput({ value, label, onPreview, onCommit }: {
  value: string;
  label: string;
  onPreview: (color: string) => void;
  onCommit: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  const lastSubmitted = useRef(value);
  const frame = useRef<number | null>(null);
  const previewRef = useRef(onPreview);
  const commitRef = useRef(onCommit);
  previewRef.current = onPreview;
  commitRef.current = onCommit;
  useEffect(() => {
    latest.current = value;
    lastSubmitted.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  const send = (): void => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (latest.current !== lastSubmitted.current) {
      lastSubmitted.current = latest.current;
      previewRef.current(latest.current);
    }
  };
  const commit = (): void => { send(); commitRef.current(); };
  return <input aria-label={label} title={label} type="color"
    value={hex.test(draft) ? draft : '#986dff'}
    onChange={event => {
      latest.current = event.target.value;
      setDraft(latest.current);
      if (frame.current === null) frame.current = requestAnimationFrame(send);
    }}
    onPointerUp={commit} onKeyUp={commit} onBlur={commit} />;
}

function GradientEditor({ effect, preview, commit }: EditorProps) {
  const fallback = effect.kind === 'duotone' ? DEFAULT_DUOTONE_STOPS : effect.kind === 'glow' ? DEFAULT_GLOW_STOPS : DEFAULT_GRADIENT_STOPS;
  const [stops, setStops] = useState<GradientStop[]>(() => [...(effect.parameters?.stops ?? fallback)].sort((a, b) => a.position - b.position));
  const live = useRef(stops);
  useEffect(() => {
    const next = [...(effect.parameters?.stops ?? fallback)].sort((a, b) => a.position - b.position);
    live.current = next;
    setStops(next);
  }, [effect.id]);
  const update = (updated: GradientStop[]): void => {
    const next = [...updated].sort((a, b) => a.position - b.position);
    live.current = next;
    setStops(next);
    preview({ stops: next });
  };
  const gradient = `linear-gradient(90deg, ${stops.map(stop => `${stop.color} ${stop.position * 100}%`).join(', ')})`;
  return (
    <div className="fx-complex-editor" aria-label={`${effect.kind} gradient editor`}>
      <div className="fx-complex-header"><strong>Editable color stops</strong>
        <button type="button" disabled={stops.length >= 16} onClick={() => {
          const middle = stops[Math.floor(stops.length / 2)];
          update([...stops, { id: crypto.randomUUID(), position: Math.max(0, middle.position - 0.07), color: middle.color, opacity: 1 }]);
          commit();
        }}>+ Stop</button>
      </div>
      <div className="fx-gradient-preview" style={{ background: gradient }} aria-label="Gradient preview" />
      {stops.map(stop => (
        <div className="fx-gradient-stop" key={stop.id}>
          <PreviewColorInput label={`Stop ${Math.round(stop.position * 100)}% color`} value={stop.color}
            onPreview={color => update(live.current.map(item => item.id === stop.id ? { ...item, color } : item))} onCommit={commit} />
          <label><span>Position</span><input type="range" min={0} max={100} step={1} value={stop.position * 100}
            aria-label="Stop position" onChange={event => update(live.current.map(item => item.id === stop.id
              ? { ...item, position: number(Number(event.target.value), 0, 100) / 100 } : item))}
            onPointerUp={commit} onKeyUp={commit} /></label>
          <output>{Math.round(stop.position * 100)}%</output>
          <button type="button" disabled={stops.length <= 2} aria-label="Remove gradient stop" onClick={() => {
            update(stops.filter(item => item.id !== stop.id)); commit();
          }}>×</button>
        </div>
      ))}
      <p className="fx-subtle">Dark pixels use the left colors; highlights use the right colors. Image transparency is preserved.</p>
    </div>
  );
}

/** Real luminance histogram from the unmodified raster layer (not a decorative graph). */
function LevelsHistogram({ sourceLayer }: { sourceLayer?: Layer }) {
  const [histogram, setHistogram] = useState<number[] | null>(null);
  const image = sourceLayer?.type === 'raster' ? sourceLayer.image : undefined;
  useEffect(() => {
    if (!image) { setHistogram(null); return; }
    let alive = true;
    const element = new Image();
    element.onload = () => {
      if (!alive) return;
      const canvas = document.createElement('canvas');
      // Fixed-size representative sampling prevents histogram preparation from
      // blocking interactive slider input on 4K images.
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      if (!ctx) return;
      ctx.drawImage(element,0,0,256,256);
      const data=ctx.getImageData(0,0,256,256).data;
      const bins=new Array<number>(64).fill(0);
      for(let i=0;i<data.length;i+=4){
        if(data[i+3]<8)continue;
        const lum=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
        bins[Math.min(63,Math.floor(lum/4))]++;
      }
      // Log scale prevents a huge white background peak hiding all midtones.
      setHistogram(bins.map(n=>Math.log1p(n)));
    };
    element.onerror = () => { if (alive) setHistogram(null); };
    element.src=image;
    return () => { alive=false; element.onload=null; element.onerror=null; };
  },[image]);
  return <div className="fx-levels-histogram" aria-label="Source luminance histogram">
    <strong>Luminance histogram · source image</strong>
    {histogram ? <svg viewBox="0 0 256 92" role="img" aria-label="Actual source luminance distribution">
      {histogram.map((value,index)=><rect key={index} x={index*4} width="3.2" y={92-value/Math.max(1,...histogram)*88}
        height={value/Math.max(1,...histogram)*88} fill="var(--accent,#9c7fff)"/>)}
    </svg> : <small>Select a raster layer to display its actual tone distribution.</small>}
  </div>;
}
function LevelsEditor(props: EditorProps) {
  return <div className="fx-complex-editor">
    <LevelsHistogram sourceLayer={props.sourceLayer}/>
    <p className="fx-subtle">Use Input Black, White and Midtone Gamma below to remap contrast. Output Black and White limit the final range; the histogram shows the unmodified source.</p>
  </div>;
}

function CurveEditor({ effect, preview, commit }: EditorProps) {
  const [points, setPoints] = useState<CurvePoint[]>(() => [...(effect.parameters?.curvePoints ?? DEFAULT_CURVE_POINTS)].sort((a, b) => a.x - b.x));
  const live = useRef(points);
  useEffect(() => {
    const next = [...(effect.parameters?.curvePoints ?? DEFAULT_CURVE_POINTS)].sort((a, b) => a.x - b.x);
    live.current = next;
    setPoints(next);
  }, [effect.id]);
  const update = (result: CurvePoint[]): void => {
    const next = [...result].sort((a, b) => a.x - b.x);
    live.current = next;
    setPoints(next);
    preview({ curvePoints: next });
  };
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const path = points.map(({ x, y }) => `${(x * 180).toFixed(2)},${((1 - y) * 180).toFixed(2)}`).join(' ');
  const pointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging.current === null || !svg.current) return;
    const bounds = svg.current.getBoundingClientRect();
    const index = dragging.current;
    const x = number((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = 1 - number((event.clientY - bounds.top) / bounds.height, 0, 1);
    update(live.current.map((point, i) => i === index ? {
      x: index === 0 || index === points.length - 1 ? point.x
        : number(x, (live.current[index - 1]?.x ?? 0) + 0.002, (live.current[index + 1]?.x ?? 1) - 0.002),
      y,
    } : point));
  };
  return (
    <div className="fx-complex-editor">
      <div className="fx-complex-header"><strong>Tonal curve</strong>
        <button type="button" disabled={points.length >= 12} onClick={() => {
          update([...points, { x: 0.5, y: 0.5 }].sort((a, b) => a.x - b.x)); commit();
        }}>+ Point</button>
      </div>
      <svg ref={svg} className="fx-curve" viewBox="0 0 180 180" role="group" aria-label="Editable tonal curve"
        onPointerMove={pointer} onPointerUp={event => { if (dragging.current !== null) { dragging.current = null; event.currentTarget.releasePointerCapture(event.pointerId); commit(); } }}
        onPointerCancel={() => { dragging.current = null; commit(); }}>
        <path d="M0 45 H180 M0 90 H180 M0 135 H180 M45 0 V180 M90 0 V180 M135 0 V180" fill="none" stroke="currentColor" opacity=".15" />
        <path d="M0 180 L180 0" fill="none" stroke="currentColor" opacity=".23" />
        <polyline points={path} fill="none" stroke="var(--accent, #9875ff)" strokeWidth="2.5" />
        {points.map((point, index) => <circle key={`${index}`} cx={point.x * 180} cy={(1 - point.y) * 180}
          r="5" fill="var(--accent, #9875ff)" stroke="white" strokeWidth="1.5" style={{ cursor: 'move' }}
          onPointerDown={event => {
            dragging.current = index;
            svg.current?.setPointerCapture(event.pointerId);
            event.stopPropagation();
          }} />)}
      </svg>
      {points.map((point, index) => <div className="fx-curve-numeric" key={`${index}`}>
        <span>P{index + 1}</span>
        <label>X <input aria-label={`Curve point ${index + 1} X`} type="number" min={0} max={100}
          value={Math.round(point.x * 100)} disabled={index === 0 || index === points.length - 1}
          onChange={event => update(points.map((item, i) => i === index ? { ...item, x: Number(event.target.value) / 100 } : item))} onBlur={commit} /></label>
        <label>Y <input aria-label={`Curve point ${index + 1} Y`} type="number" min={0} max={100}
          value={Math.round(point.y * 100)}
          onChange={event => update(points.map((item, i) => i === index ? { ...item, y: number(Number(event.target.value) / 100, 0, 1) } : item))} onBlur={commit} /></label>
        <button type="button" disabled={index === 0 || index === points.length - 1 || points.length <= 2}
          aria-label={`Remove curve point ${index + 1}`} onClick={() => { update(points.filter((_, i) => i !== index)); commit(); }}>×</button>
      </div>)}
    </div>
  );
}

function ShadowEditor({ effect, preview, commit }: EditorProps) {
  const [shadows, setShadows] = useState<ShadowEntry[]>(() => effect.parameters?.shadows ?? DEFAULT_SHADOWS);
  const live = useRef(shadows);
  useEffect(() => {
    const next = effect.parameters?.shadows ?? DEFAULT_SHADOWS;
    live.current = next;
    setShadows(next);
  }, [effect.id]);
  const update = (entries: ShadowEntry[]): void => {
    live.current = entries;
    setShadows(entries);
    preview({ shadows: entries });
  };
  return (
    <div className="fx-complex-editor">
      <div className="fx-complex-header"><strong>Shadow stack</strong><button type="button" disabled={shadows.length >= 8}
        onClick={() => { update([...shadows, { ...DEFAULT_SHADOWS[0], id: crypto.randomUUID() }]); commit(); }}>+ Shadow</button></div>
      {shadows.map((entry, index) => <div className="fx-shadow-entry" key={entry.id}>
        <div className="fx-complex-header"><label><input type="checkbox" checked={entry.enabled} onChange={event => {
          update(live.current.map(shadow => shadow.id === entry.id ? { ...shadow, enabled: event.target.checked } : shadow)); commit();
        }} /> Shadow {index + 1}</label><button type="button" aria-label="Remove shadow" onClick={() => {
          update(shadows.filter(item => item.id !== entry.id)); commit();
        }}>×</button></div>
        <label className="fx-customize-row"><span>Shadow style</span>
          <select aria-label={`Shadow ${index + 1} style`} value={entry.style ?? 'drop'}
            onChange={event => {
              update(live.current.map(item => item.id === entry.id ? {
                ...item, style: event.target.value as NonNullable<ShadowEntry['style']>,
              } : item));
              commit();
            }}>
            <option value="drop">Drop shadow</option>
            <option value="inner">Inner shadow</option>
            <option value="contact">Contact shadow</option>
            <option value="long">Long shadow</option>
            <option value="perspective">Perspective shadow</option>
          </select>
        </label>
        <PreviewColorInput label={`Shadow ${index + 1} color`} value={entry.color} onPreview={color =>
          update(live.current.map(item => item.id === entry.id ? { ...item, color } : item))} onCommit={commit} />
        {(['offsetX', 'offsetY', 'radius', 'spread', 'opacity'] as const).map(key => <label key={key} className="fx-level">
          <span>{key} <output>{key === 'opacity' ? Math.round(entry[key] * 100) : Math.round(entry[key])}</output></span>
          <input type="range" aria-label={`Shadow ${index + 1} ${key}`} min={key === 'offsetX' || key === 'offsetY' ? -250 : 0}
            max={key === 'opacity' ? 100 : 200}
            value={key === 'opacity' ? entry[key] * 100 : entry[key]}
            onChange={event => update(live.current.map(shadow => shadow.id === entry.id ? {
              ...shadow, [key]: key === 'opacity' ? Number(event.target.value) / 100 : Number(event.target.value),
            } : shadow))} onPointerUp={commit} onKeyUp={commit} />
        </label>)}
      </div>)}
    </div>
  );
}

function GlowEditor(props: EditorProps) {
  const { effect, preview, commit } = props;
  const [mode, setMode] = useState(effect.parameters?.glowMode ?? 'outer');
  const [palette, setPalette] = useState(effect.parameters?.glowPalette ?? 'single');
  useEffect(() => { setMode(effect.parameters?.glowMode ?? 'outer'); setPalette(effect.parameters?.glowPalette ?? 'single'); }, [effect.id]);
  return <div className="fx-complex-editor">
    <div className="fx-complex-header"><strong>Light behavior</strong><span>Non-destructive</span></div>
    <label className="fx-customize-row"><span>Illumination type</span>
      <select aria-label="Glow mode" value={mode}
        onChange={event => {
          setMode(event.target.value as NonNullable<EffectParameters['glowMode']>);
          preview({ glowMode: event.target.value as NonNullable<EffectParameters['glowMode']> });
          commit();
        }}>
        <option value="outer">Outer glow — silhouette</option>
        <option value="inner">Inner glow — edge lighting</option>
        <option value="both">Inner + outer glow</option>
        <option value="bloom">Bloom — luminous highlights</option>
        <option value="atmosphere">Atmospheric glow — wide diffusion</option>
        <option value="energy">Energy glow — concentrated aura</option>
      </select>
    </label>
    <label className="fx-customize-row"><span>Glow colors</span>
      <select aria-label="Glow color palette" value={palette}
        onChange={event => { setPalette(event.target.value as 'single' | 'spectrum'); props.preview({ glowPalette: event.target.value as 'single' | 'spectrum' }); props.commit(); }}>
        <option value="single">Single color</option>
        <option value="spectrum">Spectral gradient</option>
      </select>
    </label>
    {palette === 'spectrum' && <GradientEditor {...props} />}
    <p className="fx-subtle">Outer/inner glow follows transparency. Bloom responds to bright pixels.</p>
  </div>;
}

function BackdropEditor(props: EditorProps) {
  const [mode, setMode] = useState(props.effect.parameters?.backdropMode ?? 'solid');
  useEffect(() => setMode(props.effect.parameters?.backdropMode ?? 'solid'), [props.effect.id]);
  return <div className="fx-complex-editor">
    <div className="fx-complex-header"><strong>Backdrop fill</strong></div>
    <label className="fx-customize-row"><span>Fill type</span>
      <select aria-label="Backdrop fill mode" value={mode}
        onChange={event => {
          setMode(event.target.value as NonNullable<EffectParameters['backdropMode']>);
          props.preview({ backdropMode: event.target.value as NonNullable<EffectParameters['backdropMode']> });
          props.commit();
        }}>
        <option value="solid">Solid color</option>
        <option value="gradient">Editable gradient</option>
        <option value="radial">Radial color atmosphere</option>
      </select>
    </label>
    {(mode === 'gradient' || mode === 'radial') && <GradientEditor {...props} />}
    <p className="fx-subtle">X, Y, scale, angle, opacity and blur are in the controls below. Artwork stays in front.</p>
  </div>;
}

function OutlineEditor({ effect, preview, commit }: EditorProps) {
  const mode = effect.parameters?.outlineStyle ?? 'classic';
  return <div className="fx-complex-editor" aria-label="Hyper Outline advanced settings">
    <div className="fx-complex-header"><strong>Hyper Outline 2.0</strong><span>Silhouette-aware</span></div>
    <label className="fx-customize-row"><span>Outline treatment</span>
      <select aria-label="Outline style" value={mode} onChange={event => {
        preview({ outlineStyle: event.target.value as NonNullable<EffectParameters['outlineStyle']> }); commit();
      }}>
        <option value="classic">Classic outline (legacy)</option>
        <option value="neon">Neon double glow</option>
        <option value="double">Double colored border</option>
        <option value="electric">Electric edge</option>
        <option value="soft">Soft atmospheric edge</option>
        <option value="gradient">Two-tone gradient border</option>
      </select>
    </label>
    {mode !== 'classic' && <>
      <label className="fx-customize-row"><span>Secondary outline color</span>
        <PreviewColorInput label="Secondary outline color" value={effect.parameters?.secondaryColor ?? '#8d55ff'}
          onPreview={secondaryColor => preview({ secondaryColor })} onCommit={commit} />
      </label>
      <label className="fx-customize-row"><span>Subject detection</span>
        <select aria-label="Outline subject detection" value={effect.parameters?.silhouetteMode ?? 'auto'}
          onChange={event => { preview({ silhouetteMode: event.target.value as NonNullable<EffectParameters['silhouetteMode']> }); commit(); }}>
          <option value="auto">Auto: transparency, background or contours</option>
          <option value="alpha">Transparency only</option>
          <option value="edge">Interior image edges</option>
        </select>
      </label>
    </>}
    <p className="fx-subtle">New outlines detect subject silhouettes or image contours. Older projects retain Classic unless you change the treatment.</p>
  </div>;
}

/** Non-destructive manual corrections are stored as normalized positions,
 * independent of zoom and editor panel size. This does not mutate the image. */
function CutoutEditor({ effect, preview, commit, sourceLayer }: EditorProps) {
  const doc = useEditor(state => activeTab(state).doc);
  const [mode, setMode] = useState<'keep' | 'remove' | 'sample' | 'box'>('keep');
  const [expanded, setExpanded] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [showMatte, setShowMatte] = useState(false);
  const [draftBox, setDraftBox] = useState<EffectParameters['subjectBox']>();
  const boxStart = useRef<{x: number; y: number} | null>(null);
  const liveBox = useRef<EffectParameters['subjectBox']>(undefined);
  const [size, setSize] = useState(effect.parameters?.maskBrushSize ?? 24);
  const latest = useRef(effect.parameters?.maskStrokes ?? []);
  const [marks, setMarks] = useState(effect.parameters?.maskStrokes ?? []);
  const pointer = useRef<number | null>(null);
  const last = useRef<{x: number; y: number} | null>(null);
  const previewCanvas = useRef<HTMLCanvasElement | null>(null);
  const originalCanvas = useRef<HTMLCanvasElement | null>(null);
  const raster = sourceLayer?.type === 'raster' ? sourceLayer : null;
  useEffect(() => {
    if (!raster?.image || !previewCanvas.current) return;
    const canvas = previewCanvas.current;
    const image = new Image(); let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      // The inspector preview and the document use the SAME cutout processor.
      const ratio = Math.min(1, 900 / Math.max(doc.width,doc.height));
      const width = Math.max(1,Math.round(doc.width*ratio));
      const height = Math.max(1,Math.round(doc.height*ratio));
      const input = document.createElement('canvas');input.width=canvas.width=width;input.height=canvas.height=height;
      const context=input.getContext('2d'); const output=canvas.getContext('2d');
      if (!context || !output) return;
      context.save();
      context.translate((raster.x+(raster.imageWidth??doc.width)*(raster.scaleX??1)/2)*ratio,
        (raster.y+(raster.imageHeight??doc.height)*(raster.scaleY??1)/2)*ratio);
      context.rotate((raster.rotation??0)*Math.PI/180);
      context.drawImage(image,-(raster.imageWidth??doc.width)*(raster.scaleX??1)*ratio/2,
        -(raster.imageHeight??doc.height)*(raster.scaleY??1)*ratio/2,
        (raster.imageWidth??doc.width)*(raster.scaleX??1)*ratio,
        (raster.imageHeight??doc.height)*(raster.scaleY??1)*ratio);
      context.restore();
      originalCanvas.current = input;
      const scaled = {...effect,parameters:{...effect.parameters,maskStrokes:(effect.parameters?.maskStrokes??[]).map(stroke=>({...stroke,radius:stroke.radius*ratio}))}};
      const result = applyEffect(input,scaled);
      output.clearRect(0,0,width,height);
      if (showMatte) {
        const imageData = result.getContext('2d')?.getImageData(0,0,width,height);
        if (imageData) {
          for (let i=0; i<imageData.data.length; i+=4) {
            const alpha = imageData.data[i+3];
            imageData.data[i]=imageData.data[i+1]=imageData.data[i+2]=alpha;
            imageData.data[i+3]=255;
          }
          output.putImageData(imageData,0,0);
        }
      } else output.drawImage(result,0,0);
    };
    image.src = raster.image;
    return () => { cancelled=true;image.onload=null; };
  }, [raster?.image,raster?.x,raster?.y,raster?.rotation,raster?.scaleX,raster?.scaleY,doc.width,doc.height,effect,expanded,showMatte]);
  useEffect(() => {
    latest.current = effect.parameters?.maskStrokes ?? [];
    setMarks(latest.current);
  }, [effect.id, effect.parameters?.maskStrokes]);
  const publish = (strokes: BackgroundMaskStroke[], render = true): void => {
    latest.current = strokes;
    setMarks(strokes);
    if (render) preview({ maskStrokes: strokes });
  };
  const paint = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (pointer.current !== event.pointerId) return;
    if (mode === 'box') {
      const rect = event.currentTarget.getBoundingClientRect();
      const at = {x: number((event.clientX-rect.left)/rect.width,0,1),
        y: number((event.clientY-rect.top)/rect.height,0,1)};
      if (!boxStart.current) boxStart.current = at;
      const start=boxStart.current;
      const selection={x:Math.min(start.x,at.x),y:Math.min(start.y,at.y),
        width:Math.abs(at.x-start.x),height:Math.abs(at.y-start.y)};
      liveBox.current=selection;setDraftBox(selection);
      return;
    }
    if (mode === 'sample') {
      // Sample the original, transformation-aware *document* raster — the
      // exact same source used by the effect, never the processed mask.
      const input = originalCanvas.current;
      if (!input) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const sx = Math.min(input.width - 1,Math.max(0,Math.floor((event.clientX-bounds.left) / bounds.width * input.width)));
      const sy = Math.min(input.height - 1,Math.max(0,Math.floor((event.clientY-bounds.top) / bounds.height * input.height)));
      const pixel = input.getContext('2d', { willReadFrequently:true })?.getImageData(sx, sy, 1, 1).data;
      if (!pixel || pixel[3] < 16) return;
      const color = `#${Array.from(pixel.slice(0, 3)).map(v => v.toString(16).padStart(2, '0')).join('')}`;
      preview({ backgroundSampleColor: color, backgroundAuto: 1 }); commit(); setMode('keep'); pointer.current = null;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = number((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = number((event.clientY - bounds.top) / bounds.height, 0, 1);
    const prev = last.current;
    if (prev && Math.hypot((x - prev.x) * doc.width, (y - prev.y) * doc.height) < Math.max(2, size / 3)) return;
    last.current = { x, y };
    if (latest.current.length >= 4000) return;
    publish([...latest.current, { x, y, radius: size, mode }], false);
  };
  const workbench = <div className="fx-complex-editor cutout-editor">
    <div className="fx-complex-header"><strong>Subject isolation · editable mask</strong><span>Original kept · CPU</span></div>
    <p className="fx-subtle">Smart mode minimizes an edge-aware foreground/background graph cut locally (CPU). Draw a subject rectangle and paint Keep/Remove guidance for complex subjects; no image is erased. This is not a neural model.</p>
    <label className="fx-customize-row"><span>Automatic background selection</span>
      <input type="checkbox" aria-label="Automatic background selection"
        checked={effect.parameters?.backgroundAuto !== 0}
        onChange={event => { preview({ backgroundAuto: event.target.checked ? 1 : 0, segmentationMode: event.target.checked ? (effect.parameters?.segmentationMode === 'color' ? 'color' : 'smart') : 'manual' }); commit(); }} />
    </label>
    <label className="fx-customize-row"><span>Segmentation engine</span>
      <select aria-label="Segmentation engine" value={effect.parameters?.segmentationMode ?? 'color'}
        onChange={event => { preview({ segmentationMode: event.target.value as 'smart' | 'color' | 'manual', backgroundAuto: event.target.value==='manual'?0:1 }); commit(); }}>
        <option value="smart">Smart — guided graph cut (CPU)</option>
        <option value="color">Color — connected or global</option>
        <option value="manual">Manual — brush mask only</option>
      </select>
    </label>
    {(effect.parameters?.segmentationMode ?? 'color') === 'color' && <label className="fx-customize-row"><span>Color removal method</span><select aria-label="Background removal method"
      value={effect.parameters?.backgroundGlobal === 1 ? 'color' : 'connected'} onChange={event=>{preview({backgroundGlobal:event.target.value==='color'?1:0});commit();}}>
      <option value="connected">Connected background · safer</option>
      <option value="color">Similar color everywhere · logos</option>
    </select></label>}
    <div className="cutout-toolbar" role="group" aria-label="Mask correction brush">
      <button type="button" className={mode === 'keep' ? 'active' : ''} onClick={() => setMode('keep')}>✓ Keep subject</button>
      <button type="button" className={mode === 'remove' ? 'active' : ''} onClick={() => setMode('remove')}>✕ Remove background</button>
      <button type="button" className={mode === 'sample' ? 'active' : ''} onClick={() => setMode('sample')}>◉ Sample background</button>
      <button type="button" className={mode === 'box' ? 'active' : ''} onClick={() => setMode('box')}>▣ Subject rectangle</button>
      <button type="button" onClick={() => { preview({ subjectBox: undefined }); commit(); setDraftBox(undefined); }} disabled={!effect.parameters?.subjectBox}>Clear rectangle</button>
      <button type="button" onClick={() => { publish([]); commit(); }}>Clear marks</button>
    </div>
    <label className="fx-level"><span>Protect high-contrast edges <output>{effect.parameters?.backgroundEdgeGuard ?? 24}</output></span>
      <input aria-label="Background edge protection" type="range" min={0} max={100} value={effect.parameters?.backgroundEdgeGuard ?? 24}
        onChange={event => preview({ backgroundEdgeGuard: Number(event.target.value) })} onPointerUp={() => commit()} />
    </label>
    {effect.parameters?.backgroundSampleColor && <div className="fx-subtle">Sampled background: <b>{effect.parameters.backgroundSampleColor}</b> <button type="button" onClick={() => { preview({ backgroundSampleColor: undefined }); commit(); }}>Clear sample</button></div>}
    {(effect.parameters?.segmentationMode === 'smart') && <label className="fx-level"><span>Segmentation detail <output>{effect.parameters?.segmentationQuality ?? 152}</output></span>
      <input type="range" aria-label="Segmentation resolution" min="64" max="224" step="8" value={effect.parameters?.segmentationQuality ?? 152}
        onChange={event => preview({ segmentationQuality: Number(event.target.value) })} onPointerUp={commit} onKeyUp={commit}/>
    </label>}
    <label className="fx-level"><span>Brush radius <output>{size}px</output></span>
      <input aria-label="Mask brush radius" type="range" min={1} max={160} step={1} value={size}
        onChange={event => setSize(Number(event.target.value))}
        onPointerUp={() => { preview({maskBrushSize:size}); commit(); }}
        onKeyUp={() => { preview({maskBrushSize:size}); commit(); }} />
    </label>
    <div className="cutout-visibility"><label><input type="checkbox" checked={showGuides} onChange={event => setShowGuides(event.target.checked)} /> Show guides</label>
      <label><input type="checkbox" checked={showMatte} onChange={event => setShowMatte(event.target.checked)} /> Inspect grayscale alpha</label></div>
    <div className="cutout-paintboard" style={{ aspectRatio: `${doc.width} / ${doc.height}` }}
      role="img" aria-label="Paint a non-destructive subject mask; keep or remove"
      onPointerDown={event => { pointer.current = event.pointerId; last.current = null; if (mode !== 'sample') event.currentTarget.setPointerCapture(event.pointerId); paint(event); }}
      onPointerMove={paint}
      onPointerUp={event => {
        paint(event);
        if (mode === 'box') {
          const box = liveBox.current;
          if (box && box.width > .02 && box.height > .02) preview({subjectBox:box,segmentationMode:'smart',backgroundAuto:1});
          boxStart.current=null;liveBox.current=undefined;setDraftBox(undefined);
        } else if (mode !== 'sample') preview({maskStrokes:latest.current});
        pointer.current = null; last.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        commit();
      }}
      onPointerCancel={() => { pointer.current = null; last.current = null; boxStart.current=null;liveBox.current=undefined;setDraftBox(undefined);preview({maskStrokes:latest.current});commit(); }}>
      <canvas ref={previewCanvas} className="cutout-live-result" aria-label="Live transparency mask preview" />
      <svg aria-hidden="true" viewBox={`0 0 ${doc.width} ${doc.height}`} preserveAspectRatio="none">
        {showGuides && (draftBox ?? effect.parameters?.subjectBox) && <rect
          x={(draftBox ?? effect.parameters?.subjectBox)!.x * doc.width} y={(draftBox ?? effect.parameters?.subjectBox)!.y * doc.height}
          width={(draftBox ?? effect.parameters?.subjectBox)!.width * doc.width}
          height={(draftBox ?? effect.parameters?.subjectBox)!.height * doc.height}
          fill="#36db9120" stroke="#36db91" strokeWidth="3" strokeDasharray="12 7" />}
        {showGuides && marks.slice(-700).map((stroke, index) => <circle key={index}
          cx={stroke.x * doc.width} cy={stroke.y * doc.height} r={stroke.radius}
          fill={stroke.mode === 'keep' ? '#36db9180' : '#ff4c7090'} />)}
      </svg>
    </div>
    <p className="fx-subtle">Green = protected • Pink = removed • {marks.length} brush marks. Save/reopen and undo preserve the effect data. Hair, textured scenes and white-on-white details may require marked guidance.</p>
  </div>;
  return <div className="huelith-mask-host">
    {!expanded && <><button type="button" className="huelith-expand-mask" onClick={() => setExpanded(true)}>⛶ Open full Mask Workspace</button>{workbench}</>}
    <Dialog open={expanded} onClose={() => setExpanded(false)} fullWidth maxWidth="lg"
      data-huelith-mask-workspace="open"
      container={() => document.querySelector<HTMLElement>('.app') ?? document.body}
      aria-labelledby="huelith-mask-workspace-title" sx={{'& .MuiDialog-paper':{
        bgcolor:'var(--panel-bg, #202438)', color:'var(--text, #ffffff)', border:'1px solid var(--border)',
        width:'min(96vw, 1200px)', maxWidth:'none', maxHeight:'94vh', borderRadius:'12px',
      }}}>
      <div className="huelith-mask-workspace">
        <header><h2 id="huelith-mask-workspace-title">Huelith Mask Workspace</h2>
          <span>Non-destructive local foreground segmentation</span>
          <button type="button" aria-label="Close Mask Workspace" onClick={() => setExpanded(false)}>Done ✓</button>
        </header>
        {expanded && workbench}
      </div>
    </Dialog>
  </div>;
}

export default function EffectAdvancedEditors(props: EditorProps) {
  if (props.effect.kind === 'cutout') return <CutoutEditor {...props} />;
  if (props.effect.kind === 'gradientmap' || props.effect.kind === 'duotone') return <GradientEditor {...props} />;
  if (props.effect.kind === 'curves') return <CurveEditor {...props} />;
  if (props.effect.kind === 'levels') return <LevelsEditor {...props} />;
  if (props.effect.kind === 'shadow') return <ShadowEditor {...props} />;
  if (props.effect.kind === 'glow') return <GlowEditor {...props} />;
  if (props.effect.kind === 'outline') return <OutlineEditor {...props} />;
  if (props.effect.kind === 'backdrop') return <BackdropEditor {...props} />;
  return null;
}
