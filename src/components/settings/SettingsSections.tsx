import { useEffect, useState, type ReactNode } from 'react';
import { Button, Slider, Switch } from '@mui/material';
import { activeTab, useEditor } from '../../editor/store';
import type { Tool, Workspace } from '../../editor/types';
import { cpuBackendInfo, testCpuBackend, type CpuBackendInfo } from '../../settings/native-cpu';
import { BACKEND_EVENT, nativeBackendStatus, nativeGraphSelfTest, type AuroraBackendStatus } from '../../settings/native-aurora';
import type { AuroraPreferences } from '../../settings/preferences';
import { certifyNativeEffectParity } from '../../settings/aurora-parity';

export type Category = 'appearance' | 'performance' | 'canvas' | 'editing' | 'effects' | 'animation' | 'storage' | 'shortcuts' | 'about';
export const CATEGORIES: { id: Category; icon: string; label: string; keywords: string }[] = [
  { id: 'appearance', icon: '◐', label: 'Appearance', keywords: 'theme transparency density motion light dark colors' },
  { id: 'performance', icon: '⚡', label: 'Performance', keywords: 'gpu acceleration cpu threads native speed rendering hardware' },
  { id: 'canvas', icon: '▦', label: 'Canvas', keywords: 'checkerboard guides grid backdrop transparency' },
  { id: 'editing', icon: '✎', label: 'Editing', keywords: 'brush stabilization smoothing' },
  { id: 'effects', icon: '✧', label: 'Effects', keywords: 'rendering caching fx filters performance' },
  { id: 'animation', icon: '◇', label: 'Animation', keywords: 'onion ghost frames previous next opacity' },
  { id: 'storage', icon: '▣', label: 'Storage', keywords: 'autosave recovery local disk preferences' },
  { id: 'shortcuts', icon: '⌘', label: 'Shortcuts', keywords: 'keyboard tools hotkeys bindings' },
  { id: 'about', icon: 'ⓘ', label: 'About', keywords: 'version license donations open source rendering' },
];
export interface ShortcutItem { id: Tool; label: string; shortcut: string }
export interface SettingsSectionProps {
  settings: AuroraPreferences;
  update: (patch: Partial<AuroraPreferences>) => void;
  shortcuts: Record<string, string>;
  setShortcuts: (value: Record<string, string>) => void;
  shortcutTools: ShortcutItem[];
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="aurora-setting-row">
    <div><strong>{title}</strong><small>{description}</small></div>
    <div className="aurora-setting-control">{children}</div>
  </div>;
}
function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="aurora-section-heading"><h3>{title}</h3><p>{subtitle}</p></header>;
}
function Toggle({ value, onChange, title }: { value: boolean; onChange: (enabled: boolean) => void; title: string }) {
  return <Switch checked={value} size="small" inputProps={{ 'aria-label': title }} onChange={(_, enabled) => onChange(enabled)} />;
}
const THEMES: Workspace[] = ['glass', 'material', 'classic', 'midnight', 'studio', 'strawberry', 'melon', 'peach', 'lemon', 'mango', 'sakura', 'blossom', 'shadow'];
export function AppearanceSection({ settings, update }: SettingsSectionProps) {
  const workspace = useEditor(state => state.workspace);
  const mode = useEditor(state => state.appearanceMode);
  const store = useEditor.getState;
  return <>
    <Heading title="Appearance" subtitle="Make Huelith feel like your own creative workspace." />
    <SettingRow title="Theme" description="Each theme has its own visual identity and stylesheet.">
      <select aria-label="Theme" value={workspace} onChange={event => store().setWorkspace(event.target.value as Workspace)}>
        {THEMES.map(theme => <option key={theme} value={theme}>{theme[0].toUpperCase() + theme.slice(1)}</option>)}
      </select>
    </SettingRow>
    <SettingRow title="Color scheme" description="Light or dark interface.">
      <select aria-label="Color scheme" value={mode} onChange={event => store().setAppearanceMode(event.target.value as 'light' | 'dark')}>
        <option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </SettingRow>
    <SettingRow title="Interface density" description="Compact gives more room to your artwork.">
      <select aria-label="Interface density" value={settings.interfaceDensity} onChange={event => update({ interfaceDensity: event.target.value as AuroraPreferences['interfaceDensity'] })}>
        <option value="compact">Compact</option><option value="comfortable">Comfortable</option>
      </select>
    </SettingRow>
    <SettingRow title="Translucent surfaces" description="Turn off transparency for a more solid interface.">
      <Toggle title="Translucent surfaces" value={settings.interfaceTransparency} onChange={value => update({ interfaceTransparency: value })} />
    </SettingRow>
    <SettingRow title="Reduce interface motion" description="Minimize decorative transitions and entrance effects.">
      <Toggle title="Reduce interface motion" value={settings.reduceMotion} onChange={value => update({ reduceMotion: value })} />
    </SettingRow>
  </>;
}

export function PerformanceSection({ settings, update }: SettingsSectionProps) {
  const [info, setInfo] = useState<CpuBackendInfo | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<AuroraBackendStatus | null>(null);
  useEffect(() => {
    let active = true;
    void nativeBackendStatus().then(result => { if (active) setBackend(result); }).catch(() => {});
    const onBackend = (event: Event): void => setBackend((event as CustomEvent<AuroraBackendStatus>).detail);
    window.addEventListener(BACKEND_EVENT, onBackend);
    return () => { active = false; window.removeEventListener(BACKEND_EVENT, onBackend); };
  }, []);
  async function graphTest(): Promise<void> {
    setBusy(true);
    try { setMessage(await nativeGraphSelfTest(settings)); }
    catch (error) { setMessage(`Native graph self-test failed: ${String(error)}`); }
    finally { setBusy(false); }
  }
  async function inspect(): Promise<void> {
    setBusy(true);
    try {
      const result = await cpuBackendInfo();
      setInfo(result);
      setMessage(result ? `Rust CPU available · ${result.availableThreads} logical threads · ${result.supportedOperations.length} foundational operations` : 'Native CPU backend is available in the Tauri desktop app, not the browser preview.');
    } catch (error) { setMessage(`CPU backend unavailable: ${String(error)}`); }
    finally { setBusy(false); }
  }
  async function selfTest(): Promise<void> {
    setBusy(true);
    try { setMessage(await testCpuBackend(settings)); }
    catch (error) { setMessage(`Native CPU test failed: ${String(error)}`); }
    finally { setBusy(false); }
  }
  return <>
    <Heading title="Performance" subtitle="Quality-first rendering with optional GPU compute acceleration." />
    <div className="aurora-staged" role="note">22 full-resolution signature FX, seven additional Creativity styles and adjustable worker budget profiles. GPU compute still covers only certified native operations; other FX retain exact CPU processing.</div>
    <SettingRow title="GPU acceleration" description="Controls native acceleration for supported operations. Off = CPU; unavailable GPUs automatically fall back without losing capabilities.">
      <Toggle title="GPU acceleration" value={settings.gpuAcceleration} onChange={value => update({ gpuAcceleration: value })} />
    </SettingRow>
    <div className="aurora-info-card" role="status">
      <strong>Active rendering device: {backend ? `${backend.active.toUpperCase()} · ${backend.device}` : 'Checking native backend…'}</strong>
      {backend?.fallbackReason && <p>GPU fallback: {backend.fallbackReason}</p>}
      {backend && <p>GPU kernels: {backend.gpuSupportedOperations.join(', ')}. All six foundational operations are available on CPU. Blur currently uses the CPU even in GPU mode.</p>}
    </div>
    <SettingRow title="CPU multithreading" description="Controls native CPU work, not the existing JavaScript workers.">
      <Toggle title="CPU multithreading" value={settings.cpuMultithreading} onChange={value => update({ cpuMultithreading: value })} />
    </SettingRow>
    <SettingRow title="CPU threads" description="0 = automatic; maximum 32. Single-thread mode always uses one.">
      <select aria-label="CPU threads" disabled={!settings.cpuMultithreading} value={settings.cpuThreads} onChange={event => update({ cpuThreads: Number(event.target.value) })}>
        <option value={0}>Automatic</option>
        {Array.from({ length: 32 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
      </select>
    </SettingRow>
    <SettingRow title="Rendering diagnostics" description="Show canvas FPS and completed exact FX processing measurements.">
      <Toggle title="Rendering diagnostics" value={settings.diagnostics} onChange={value => update({ diagnostics: value })} />
    </SettingRow>
    <div className="aurora-test-buttons">
      <Button size="small" variant="outlined" onClick={() => void inspect()} disabled={busy}>Detect native CPU</Button>
      <Button size="small" variant="contained" onClick={() => void selfTest()} disabled={busy}>Run CPU self-test</Button>
      <Button size="small" variant="outlined" onClick={() => void graphTest()} disabled={busy}>Test CPU/GPU graph & cache</Button>
    </div>
    {message && <p className="aurora-result" role="status">{message}</p>}
    {info && <p className="aurora-hint">Detected: {info.availableThreads} logical cores. Native CPU processing supports: {info.supportedOperations.join(', ')}.</p>}
  </>;
}

export function CanvasSection({ settings, update }: SettingsSectionProps) {
  const grid = useEditor(state => state.grid);
  return <>
    <Heading title="Canvas" subtitle="Choose a comfortable backdrop for transparent artwork." />
    <SettingRow title="Grid" description="Display alignment guides over the canvas.">
      <Toggle title="Show canvas grid" value={grid} onChange={value => useEditor.getState().setGrid(value)} />
    </SettingRow>
    <SettingRow title="Checkerboard cell size" description="Size of the transparent-background checker pattern.">
      <select aria-label="Checkerboard cell size" value={settings.canvasCheckerSize} onChange={event => update({ canvasCheckerSize: Number(event.target.value) as 8 | 16 | 32 })}>
        <option value={8}>Small — 8 px</option><option value={16}>Standard — 16 px</option><option value={32}>Large — 32 px</option>
      </select>
    </SettingRow>
  </>;
}
export function EditingSection({ settings, update }: SettingsSectionProps) {
  return <>
    <Heading title="Editing" subtitle="Precision controls for drawing and selection." />
    <SettingRow title="Brush stabilization" description="Default smoothing for freehand brush movement.">
      <Slider size="small" min={0} max={95} value={settings.brushStabilization} aria-label="Brush stabilization"
        valueLabelDisplay="auto" onChange={(_, value) => update({ brushStabilization: value as number })} />
    </SettingRow>
    <Button size="small" onClick={() => useEditor.getState().setSmoothing(settings.brushStabilization / 100)}>Apply stabilization to current brush</Button>
  </>;
}
export function EffectsSection({ settings, update }: SettingsSectionProps) {
  const [certification, setCertification] = useState('');
  const [certifying, setCertifying] = useState(false);
  async function certify(): Promise<void> {
    setCertifying(true);
    try {
      const result = await certifyNativeEffectParity(settings);
      setCertification(`${result.backend} · ${result.passedKinds.length}/5 native candidates within ±${result.tolerance} RGBA levels on all 25 samples. ${result.blockedKinds.length ? `Not certified: ${result.blockedKinds.join(', ')}.` : 'All sampled operations passed.'} The editor retains its authoritative algorithms regardless of this diagnostic.`);
    } catch (error) { setCertification(`Certification could not complete: ${String(error)}`); }
    finally { setCertifying(false); }
  }
  return <>
    <Heading title="Effects & caching" subtitle="Non-destructive effects remain intact in both CPU and GPU modes." />
    <div className="aurora-staged">Rendering improvements: cancellation between completed effect stages, exact intermediate previews, retained silhouette geometry for Glow and Hyper Outline, and animation-cel source reuse. Native color operations must pass parity certification before user-visible migration; unsupported FX retain the original full-quality processor.</div>
    <div className="aurora-test-buttons">
      <Button size="small" variant="outlined" disabled={certifying} onClick={() => void certify()}>
        {certifying ? 'Comparing actual pixels…' : 'Test native/Studio visual parity'}
      </Button>
    </div>
    {certification && <p className="aurora-result" role="status">{certification}</p>}
    <SettingRow title="CPU cache budget" description="Planned maximum image processing cache, in MiB.">
      <select aria-label="CPU cache budget" value={settings.memoryCacheMb} onChange={event => update({ memoryCacheMb: Number(event.target.value) })}>
        {[64,128,192,256,512,1024,2048].map(value => <option key={value} value={value}>{value} MiB</option>)}
      </select>
    </SettingRow>
    <SettingRow title="Live FX budget profile" description="Changes full-resolution cache retention and cancellation policy, NEVER effect quality or image resolution. Responsive uses more RAM to reuse expensive masks; Economy minimizes RAM.">
      <select aria-label="Live FX budget profile" value={settings.budgetProfile}
        onChange={event => update({ budgetProfile: event.target.value as 'economy' | 'balanced' | 'responsive' })}>
        <option value="economy">Economy — lower RAM use</option>
        <option value="balanced">Balanced — default</option>
        <option value="responsive">Responsive — retain more effect stages</option>
      </select>
    </SettingRow>
    <SettingRow title="GPU texture budget" description="Planned GPU cache limit, in MiB.">
      <select aria-label="GPU texture budget" value={settings.gpuCacheMb} onChange={event => update({ gpuCacheMb: Number(event.target.value) })}>
        {[64,128,256,512,1024,2048].map(value => <option key={value} value={value}>{value} MiB</option>)}
      </select>
    </SettingRow>
  </>;
}
export function AnimationSection() {
  const animation = useEditor(state => activeTab(state).doc.animation);
  return <>
    <Heading title="Animation" subtitle="Frame-by-frame tools share Huelith's non-destructive document model." />
    {!animation ? <p className="aurora-hint">Open an animation project to edit onion-skin settings.</p> : <>
      <SettingRow title="Onion skin" description="Ghost frames before and after the active frame.">
        <Toggle title="Onion skin enabled" value={animation.onion.enabled} onChange={value => useEditor.getState().setOnion({ enabled: value })} />
      </SettingRow>
      {(['previous', 'next'] as const).map(key => <SettingRow key={key} title={`${key === 'previous' ? 'Previous' : 'Next'} frames`} description="Number of adjacent ghost frames.">
        <select aria-label={`${key} onion frames`} value={animation.onion[key]} onChange={event => useEditor.getState().setOnion({ [key]: Number(event.target.value) })}>
          {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </SettingRow>)}
      <SettingRow title="Ghost opacity" description="Transparency of surrounding animation frames.">
        <Slider size="small" aria-label="Onion skin opacity" min={0.05} max={0.8} step={0.05} value={animation.onion.opacity}
          valueLabelDisplay="auto" onChange={(_, value) => useEditor.getState().setOnion({ opacity: value as number })} />
      </SettingRow>
    </>}
  </>;
}
export function StorageSection() {
  return <>
    <Heading title="Storage & recovery" subtitle="Your work stays on your computer." />
    <div className="aurora-info-card"><strong>Local autosave and recovery</strong><p>Recovery snapshots are stored locally using IndexedDB and do not replace saving your .huelith files. Your artwork is never uploaded by Huelith.</p></div>
    <div className="aurora-info-card"><strong>Personal settings</strong><p>Appearance and performance preferences are stored locally, separately from project documents. You can reset them in the bottom bar.</p></div>
  </>;
}
export function ShortcutsSection({ shortcuts, setShortcuts, shortcutTools }: SettingsSectionProps) {
  function change(id: string, value: string): void {
    if (!/^[A-Z]?$/.test(value)) return;
    if (shortcutTools.some(other => other.id !== id && (shortcuts[other.id] ?? other.shortcut) === value)) return;
    const next = { ...shortcuts, [id]: value };
    setShortcuts(next);
    try { localStorage.setItem('huelith-shortcuts', JSON.stringify(next)); } catch { /* private browsing */ }
  }
  return <>
    <Heading title="Keyboard shortcuts" subtitle="Assign unique single-letter shortcuts to frequently used tools." />
    <div className="aurora-shortcuts">{shortcutTools.map(tool => <label key={tool.id}><span>{tool.label}</span>
      <input maxLength={1} aria-label={`${tool.label} shortcut`} value={shortcuts[tool.id] ?? tool.shortcut}
        onChange={event => change(tool.id, event.target.value.toUpperCase())} /></label>)}</div>
    <Button size="small" onClick={() => { localStorage.removeItem('huelith-shortcuts'); setShortcuts({}); }}>Restore shortcut defaults</Button>
  </>;
}
export function AboutSection() {
  return <>
    <Heading title="About Huelith" subtitle="Free, open source, and built for everyone." />
    <div className="aurora-info-card"><strong>Huelith 0.2 · Creative editor · Native rendering options</strong>
      <p>Settings, retained native images, multithreaded CPU processing, GPU compute, backend switching and cached effect graphs.</p>
      <p>No paid features, accounts, subscriptions, or cancellation fees. Donations are voluntary.</p></div>
    <p className="aurora-hint">Performance diagnostics and visual parity checks are included. Universal native acceleration still requires further effect-by-effect quality certification and Windows hardware benchmarking.</p>
  </>;
}
