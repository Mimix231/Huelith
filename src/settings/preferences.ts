/** Huelith preferences are local application configuration, never document data. */
export interface AuroraPreferences {
  gpuAcceleration: boolean;
  /** Resource/scheduling policy; NEVER downscales image or downgrades an algorithm. */
  budgetProfile: 'economy' | 'balanced' | 'responsive';
  cpuMultithreading: boolean;
  cpuThreads: number; // 0 = automatic
  diagnostics: boolean;
  memoryCacheMb: number;
  gpuCacheMb: number;
  interfaceDensity: 'compact' | 'comfortable';
  interfaceTransparency: boolean;
  reduceMotion: boolean;
  canvasCheckerSize: 8 | 16 | 32;
  brushStabilization: number;
}

export const DEFAULT_PREFERENCES: AuroraPreferences = {
  gpuAcceleration: true,
  budgetProfile: 'balanced',
  cpuMultithreading: true,
  cpuThreads: 0,
  diagnostics: false,
  memoryCacheMb: 192,
  gpuCacheMb: 256,
  interfaceDensity: 'compact',
  interfaceTransparency: true,
  reduceMotion: false,
  canvasCheckerSize: 16,
  brushStabilization: 72,
};
const STORAGE = 'huelith-aurora-preferences-v1';
const LEGACY_STORAGE = 'spectrum-aurora-preferences-v1';
export const PREFERENCES_EVENT = 'huelith-aurora-preferences-changed';
const finite = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;

export function normalizePreferences(input: unknown): AuroraPreferences {
  const source = input && typeof input === 'object' ? input as Partial<AuroraPreferences> : {};
  const defaults = DEFAULT_PREFERENCES;
  return {
    budgetProfile: source.budgetProfile === 'economy' || source.budgetProfile === 'responsive' ? source.budgetProfile : 'balanced',
    gpuAcceleration: typeof source.gpuAcceleration === 'boolean' ? source.gpuAcceleration : defaults.gpuAcceleration,
    cpuMultithreading: typeof source.cpuMultithreading === 'boolean' ? source.cpuMultithreading : defaults.cpuMultithreading,
    cpuThreads: finite(source.cpuThreads, 0, 32, defaults.cpuThreads),
    diagnostics: typeof source.diagnostics === 'boolean' ? source.diagnostics : defaults.diagnostics,
    memoryCacheMb: finite(source.memoryCacheMb, 64, 2048, defaults.memoryCacheMb),
    gpuCacheMb: finite(source.gpuCacheMb, 64, 2048, defaults.gpuCacheMb),
    interfaceDensity: source.interfaceDensity === 'comfortable' ? 'comfortable' : 'compact',
    interfaceTransparency: typeof source.interfaceTransparency === 'boolean' ? source.interfaceTransparency : defaults.interfaceTransparency,
    reduceMotion: typeof source.reduceMotion === 'boolean' ? source.reduceMotion : defaults.reduceMotion,
    canvasCheckerSize: source.canvasCheckerSize === 8 || source.canvasCheckerSize === 32 ? source.canvasCheckerSize : 16,
    brushStabilization: finite(source.brushStabilization, 0, 100, defaults.brushStabilization),
  };
}

export function loadPreferences(): AuroraPreferences {
  try {
    const previous = localStorage.getItem(LEGACY_STORAGE);
    const value = localStorage.getItem(STORAGE) ?? previous;
    if (value !== null && localStorage.getItem(STORAGE) === null) localStorage.setItem(STORAGE, value);
    return normalizePreferences(JSON.parse(value ?? 'null'));
  }
  catch { return normalizePreferences(null); }
}

export function applyPreferences(preferences: AuroraPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.huelithDensity = preferences.interfaceDensity;
  root.dataset.huelithTransparency = String(preferences.interfaceTransparency);
  root.dataset.huelithReduceMotion = String(preferences.reduceMotion);
  root.style.setProperty('--aurora-checker-size', `${preferences.canvasCheckerSize}px`);
  root.style.setProperty('--aurora-solid-surface', root.classList.contains('tone-light') ? '#f8f8fe' : '#242738');
  try { localStorage.setItem('huelith:perf', preferences.diagnostics ? '1' : '0'); } catch { /* private mode */ }
}

export function savePreferences(value: AuroraPreferences): AuroraPreferences {
  const preferences = normalizePreferences(value);
  try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); } catch { /* application still works */ }
  applyPreferences(preferences);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT, { detail: preferences }));
  return preferences;
}

export function resetPreferences(): AuroraPreferences { return savePreferences(DEFAULT_PREFERENCES); }
