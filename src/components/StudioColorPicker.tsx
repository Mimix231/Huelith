import { useEffect, useMemo, useState } from 'react';
import { Popover } from '@mui/material';
import type { MouseEvent, ReactNode } from 'react';
import './StudioColorPicker.css';

function rgbToHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta) {
    switch (max) { case r: hue = ((g - b) / delta) % 6; break; case g: hue = (b - r) / delta + 2; break; default: hue = (r - g) / delta + 4; }
  }
  return [((hue * 60) + 360) % 360, max ? delta / max : 0, max] as const;
}
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const triplets = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const channels = triplets[Math.min(5, Math.floor(((h + 360) % 360) / 60))];
  return `#${channels.map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}
function storedColors(): string[] {
  try { return JSON.parse(localStorage.getItem('huelith-recent-colors') ?? '[]') as string[]; } catch { return []; }
}
export default function StudioColorPicker({ value, onChange, children, label, alpha, onAlpha }: {
  value: string; onChange: (value: string) => void; label: string; children?: ReactNode;
  alpha?: number; onAlpha?: (value: number) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState(value);
  const [recent, setRecent] = useState<string[]>(storedColors);
  const [saved, setSaved] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('huelith-saved-colors') ?? '[]') as string[]; } catch { return []; }
  });
  useEffect(() => setDraft(value), [value]);
  const valid = /^#[a-f0-9]{6}$/i.test(draft);
  const [h, s, v] = useMemo(() => rgbToHsv(valid ? draft : '#000000'), [draft, valid]);
  function commit(color: string) {
    if (!/^#[a-f0-9]{6}$/i.test(color)) return;
    setDraft(color); onChange(color);
    const next = [color.toLowerCase(), ...recent.filter(item => item.toLowerCase() !== color.toLowerCase())].slice(0, 12);
    setRecent(next);
    try { localStorage.setItem('huelith-recent-colors', JSON.stringify(next)); } catch { /* optional preference */ }
  }
  function onSV(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    commit(hsvToHex(h, Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))));
  }
  const channel = (i: number) => parseInt((valid ? draft : '#000000').slice(i, i + 2), 16);
  const setChannel = (index: number, next: number) => {
    const rgb = [channel(1), channel(3), channel(5)]; rgb[index] = Math.max(0, Math.min(255, next || 0));
    commit(`#${rgb.map(n => n.toString(16).padStart(2, '0')).join('')}`);
  };
  return <>
    <button type="button" className="huelith-color-trigger" title={label} aria-label={label}
      onClick={e => setAnchor(e.currentTarget)}>{children ?? <span className="huelith-color-chip" style={{ background: value }} />}</button>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'center', horizontal: 'right' }}>
      <div className="huelith-picker" aria-label={`${label} color picker`}>
        <header><strong>{label}</strong><button onClick={() => setAnchor(null)} aria-label="Close color picker">×</button></header>
        <div className="huelith-sv" role="slider" aria-label="Saturation and brightness"
          style={{ backgroundColor: hsvToHex(h, 1, 1) }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onSV(e); }}
          onPointerMove={e => { if (e.buttons) onSV(e); }}>
          <div className="huelith-sv-white"/><div className="huelith-sv-black"/>
          <span className="huelith-sv-handle" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}/>
        </div>
        <label>Hue <input aria-label="Hue" type="range" min="0" max="360" value={Math.round(h)} onChange={e => commit(hsvToHex(+e.target.value, s, v))} className="huelith-hue"/></label>
        {onAlpha && <label>Opacity <input aria-label="Color opacity" type="range" min="0" max="100" value={Math.round((alpha ?? 1) * 100)} onChange={e => onAlpha(+e.target.value / 100)} /></label>}
        <label>HEX <input aria-label="HEX color" value={draft} onChange={e => { setDraft(e.target.value); if (/^#[a-f0-9]{6}$/i.test(e.target.value)) commit(e.target.value); }} /></label>
        <div className="huelith-picker-rgb">{['R', 'G', 'B'].map((name, i) => <label key={name}>{name}<input type="number" min="0" max="255" value={channel(i * 2 + 1)} onChange={e => setChannel(i, +e.target.value)} /></label>)}</div>
        <button className="huelith-save-color" onClick={() => {
          const next=[...new Set([...saved,draft.toLowerCase()])].slice(-24);setSaved(next);
          try {localStorage.setItem('huelith-saved-colors',JSON.stringify(next));}catch{/* optional */}
        }}>☆ Save color to palette</button>
        <div className="huelith-picker-presets" aria-label="Saved colors">{saved.map(color => <button key={color} title={color} aria-label={`Use saved ${color}`} onClick={() => commit(color)} style={{backgroundColor:color}}/>)}</div>
        <div className="huelith-picker-presets" aria-label="Recent colors">{recent.map(color => <button key={color} title={color} aria-label={`Use ${color}`} onClick={() => commit(color)} style={{ backgroundColor: color }}/>)}</div>
      </div>
    </Popover>
  </>;
}
