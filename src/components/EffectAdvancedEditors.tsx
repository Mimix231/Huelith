import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Effect, EffectParameters, GradientStop, CurvePoint, ShadowEntry } from '../editor/types';
import { DEFAULT_CURVE_POINTS, DEFAULT_DUOTONE_STOPS, DEFAULT_GRADIENT_STOPS, DEFAULT_GLOW_STOPS, DEFAULT_SHADOWS } from '../editor/effect-schema';

interface EditorProps {
  effect: Effect;
  preview: (parameters: EffectParameters) => void;
  commit: () => void;
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

export default function EffectAdvancedEditors(props: EditorProps) {
  if (props.effect.kind === 'gradientmap' || props.effect.kind === 'duotone') return <GradientEditor {...props} />;
  if (props.effect.kind === 'curves') return <CurveEditor {...props} />;
  if (props.effect.kind === 'shadow') return <ShadowEditor {...props} />;
  if (props.effect.kind === 'glow') return <GlowEditor {...props} />;
  if (props.effect.kind === 'outline') return <OutlineEditor {...props} />;
  if (props.effect.kind === 'backdrop') return <BackdropEditor {...props} />;
  return null;
}
