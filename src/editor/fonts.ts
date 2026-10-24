/** System font discovery. Tauri enumerates installed families in Rust; the web preview
 * deliberately shows only known fallbacks because browsers cannot enumerate fonts reliably. */
export const FALLBACK_FONTS = [
  'Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia',
  'Impact', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

export interface FontCatalog {
  families: string[];
  source: 'system' | 'fallback';
}

let pending: Promise<FontCatalog> | undefined;

export function normalizeFontFamilies(families: string[]): string[] {
  return [...new Set(families.map(value => value.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function discover(): Promise<FontCatalog> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const families = await invoke<string[]>('list_system_fonts');
      if (families.length) return { families: normalizeFontFamilies(families), source: 'system' };
    } catch (error) {
      console.warn('Installed font discovery failed:', error);
    }
  }
  return { families: normalizeFontFamilies(FALLBACK_FONTS), source: 'fallback' };
}

export function systemFonts(refresh = false): Promise<FontCatalog> {
  if (refresh) pending = undefined;
  pending ??= discover();
  return pending;
}

/** A font-family value safely wrapped for use in CSS fontFamily. */
export function fontCssFamily(name: string): string {
  return `"${name.replace(/[\\"\r\n]/g, '')}", sans-serif`;
}
