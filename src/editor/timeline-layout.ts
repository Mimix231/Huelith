/** UI-only timeline sizing: never part of the editable project/undo history. */
export const TIMELINE_HEIGHT_KEY = 'huelith-animation-timeline-height-v1';
export const TIMELINE_DEFAULT_HEIGHT = 305;
export const TIMELINE_MIN_HEIGHT = 190;
export const TIMELINE_MAX_HEIGHT = 680;

/** Reserve a usable canvas above the exposure sheet even on short windows. */
export function timelineHeightBounds(editorHeight: number): { min: number; max: number } {
  const max = Math.min(TIMELINE_MAX_HEIGHT, Math.max(116, Math.floor(editorHeight) - 175));
  return { min: Math.min(TIMELINE_MIN_HEIGHT, max), max };
}

export function clampTimelineHeight(height: number, editorHeight: number): number {
  const { min, max } = timelineHeightBounds(editorHeight);
  return Math.max(min, Math.min(max, Number.isFinite(height) ? height : TIMELINE_DEFAULT_HEIGHT));
}

export function readTimelineHeight(): number {
  try {
    const stored = localStorage.getItem(TIMELINE_HEIGHT_KEY);
    const n = stored === null ? NaN : Number(stored);
    return Number.isFinite(n) && n >= 100 && n <= 1200 ? n : TIMELINE_DEFAULT_HEIGHT;
  } catch { return TIMELINE_DEFAULT_HEIGHT; }
}

export function saveTimelineHeight(value: number): void {
  try { localStorage.setItem(TIMELINE_HEIGHT_KEY, String(Math.round(value))); }
  catch { /* Preferences are optional in private / restricted WebViews. */ }
}
