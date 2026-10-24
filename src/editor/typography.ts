import type { VectorShape } from './types';

/** Measure real font metrics rather than estimating widths from character count. */
export function textMetrics(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  lineHeight: number,
  letterSpacing = 0,
  fontStyle = 'normal',
  transform = 'none',
  padding = 0,
): { width: number; height: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = Math.max(4, fontSize);
  if (ctx) ctx.font = `${fontStyle} ${fontWeight} ${font}px ${fontFamily}`;
  const lines = transformText(text, transform as TextFormat['textTransform']).split('\n');
  const widths = lines.map(line => {
    const measured = ctx?.measureText(line).width ?? line.length * font * 0.62;
    return measured + Math.max(0, line.length - 1) * letterSpacing;
  });
  return {
    width: Math.max(20, ...widths) + 8 + padding * 2,
    height: Math.max(font, lines.length * font * lineHeight) + padding * 2,
  };
}

export function reflowTextShape(shape: VectorShape): void {
  if (shape.kind !== 'text') return;
  const metrics = textMetrics(
    shape.text ?? '',
    shape.fontSize ?? 48,
    shape.fontFamily ?? 'Arial, sans-serif',
    shape.fontWeight ?? '400',
    shape.lineHeight ?? 1.25,
    shape.letterSpacing ?? 0,
    shape.fontStyle ?? 'normal',
    shape.textTransform ?? 'none',
    shape.textPadding ?? 0,
  );
  shape.width = metrics.width * (shape.textScaleX ?? 1);
  shape.height = metrics.height;
}

/** A non-destructive draft. Every keystroke stays out of document history until commit. */
export interface TextFormat {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  lineHeight: number;
  letterSpacing: number;
  textAlign: 'left' | 'center' | 'right';
  color: string;
  textDecoration: 'none' | 'underline' | 'line-through' | 'overline';
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  fontVariant: 'normal' | 'small-caps';
  textBackground: string;
  textPadding: number;
  textShadowColor: string;
  textShadowBlur: number;
  textShadowX: number;
  textShadowY: number;
}

export interface TextDraft extends TextFormat {
  sessionId: string;
  id: string | null;
  layerId: string | null;
  documentId: string;
  x: number;
  y: number;
  value: string;
}

export const DEFAULT_TEXT_FORMAT: TextFormat = {
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: '400',
  fontStyle: 'normal',
  lineHeight: 1.25,
  letterSpacing: 0,
  textAlign: 'left',
  color: '#222222',
  textDecoration: 'none', textTransform: 'none', fontVariant: 'normal',
  textBackground: 'none', textPadding: 0, textShadowColor: '#111827',
  textShadowBlur: 0, textShadowX: 0, textShadowY: 0,
};

export function normalizeTextFormat(format: TextFormat): TextFormat {
  return {
    ...format,
    fontFamily: format.fontFamily.trim().slice(0, 150) || 'Arial',
    fontSize: Math.max(4, Math.min(600, Number.isFinite(format.fontSize) ? format.fontSize : 48)),
    lineHeight: Math.max(0.6, Math.min(4, Number.isFinite(format.lineHeight) ? format.lineHeight : 1.25)),
    letterSpacing: Math.max(-30, Math.min(100, Number.isFinite(format.letterSpacing) ? format.letterSpacing : 0)),
    textPadding: Math.max(0, Math.min(100, format.textPadding || 0)),
    textShadowBlur: Math.max(0, Math.min(100, format.textShadowBlur || 0)),
    textShadowX: Math.max(-100, Math.min(100, format.textShadowX || 0)),
    textShadowY: Math.max(-100, Math.min(100, format.textShadowY || 0)),
  };
}

/** Display-only transformation; source text remains editable and unchanged. */
export function transformText(value: string, transform: TextFormat['textTransform'] = 'none'): string {
  switch (transform) {
    case 'uppercase': return value.toLocaleUpperCase();
    case 'lowercase': return value.toLocaleLowerCase();
    case 'capitalize': return value.replace(/\p{L}[^\s]*/gu, word => word[0].toLocaleUpperCase() + word.slice(1));
    default: return value;
  }
}
