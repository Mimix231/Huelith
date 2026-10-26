import { useState } from 'react';
import { DEFAULT_TEXT_FORMAT } from '../editor/typography';
import type { TextDraft, TextFormat } from '../editor/typography';
import { useEditor } from '../editor/store';
import BufferedColorPicker from './BufferedColorPicker';
import './FocusTextTools.css';

type ToolGroup = 'Type' | 'Paragraph' | 'Decorate' | 'Shadow' | 'Transform' | 'Presets';
interface Action {
  label: string;
  title: string;
  active?: boolean;
  run: () => void;
}

export default function FocusTextTools({ draft }: { draft: TextDraft }) {
  const [group, setGroup] = useState<ToolGroup>('Type');
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<Record<string, TextFormat>>(() => {
    try {
      const input: unknown = JSON.parse(localStorage.getItem('huelith-text-presets-v1') ?? '{}');
      return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, TextFormat> : {};
    } catch { return {}; }
  });
  const savePreset = (): void => {
    const name = presetName.trim().slice(0, 48); if (!name) return;
    const clean: TextFormat = Object.fromEntries(Object.keys(DEFAULT_TEXT_FORMAT).map(key =>
      [key, draft[key as keyof TextFormat]])) as unknown as TextFormat;
    const next = { ...presets, [name]: clean }; setPresets(next);
    try { localStorage.setItem('huelith-text-presets-v1', JSON.stringify(next)); } catch { /* Private browsing */ }
  };
  const set = (patch: Partial<TextFormat>): void => useEditor.getState().setTextFormat(patch);
  const toggle = <K extends keyof TextFormat>(key: K, value: TextFormat[K], fallback: TextFormat[K]): void => {
    set({ [key]: draft[key] === value ? fallback : value });
  };
  const adjust = (key: 'fontSize' | 'letterSpacing' | 'lineHeight' | 'textPadding' | 'textShadowBlur' | 'textShadowX' | 'textShadowY', increment: number): void => {
    set({ [key]: draft[key] + increment });
  };
  const action = (label: string, title: string, run: () => void, active = false): Action => ({ label, title, run, active });
  const controls: Record<ToolGroup, Action[]> = {
    Type: [
      ...[300, 400, 500, 600, 700, 800, 900].map(weight => action(`${weight}`, `Font weight ${weight}`,
        () => set({ fontWeight: String(weight) }), draft.fontWeight === String(weight))),
      action('Italic', 'Toggle italic', () => toggle('fontStyle', 'italic', 'normal'), draft.fontStyle === 'italic'),
      action('Small caps', 'Toggle small capitals', () => toggle('fontVariant', 'small-caps', 'normal'), draft.fontVariant === 'small-caps'),
      action('A+', 'Increase font size', () => adjust('fontSize', 2)),
      action('A−', 'Decrease font size', () => adjust('fontSize', -2)),
      action('Aa', 'Normal capitalization', () => set({ textTransform: 'none' }), draft.textTransform === 'none'),
      action('ABC', 'Uppercase display', () => set({ textTransform: 'uppercase' }), draft.textTransform === 'uppercase'),
      action('abc', 'Lowercase display', () => set({ textTransform: 'lowercase' }), draft.textTransform === 'lowercase'),
      action('Title', 'Title-style capitalization', () => set({ textTransform: 'capitalize' }), draft.textTransform === 'capitalize'),
    ],
    Paragraph: [
      action('Left', 'Align text left', () => set({ textAlign: 'left' }), draft.textAlign === 'left'),
      action('Center', 'Center text', () => set({ textAlign: 'center' }), draft.textAlign === 'center'),
      action('Right', 'Align text right', () => set({ textAlign: 'right' }), draft.textAlign === 'right'),
      action('Track +', 'Increase character spacing', () => adjust('letterSpacing', 1)),
      action('Track −', 'Decrease character spacing', () => adjust('letterSpacing', -1)),
      action('Leading +', 'Increase line height', () => adjust('lineHeight', 0.1)),
      action('Leading −', 'Decrease line height', () => adjust('lineHeight', -0.1)),
    ],
    Decorate: [
      action('None', 'No text decoration', () => set({ textDecoration: 'none' }), draft.textDecoration === 'none'),
      action('Underline', 'Underline text', () => toggle('textDecoration', 'underline', 'none'), draft.textDecoration === 'underline'),
      action('Strike', 'Strike through text', () => toggle('textDecoration', 'line-through', 'none'), draft.textDecoration === 'line-through'),
      action('Overline', 'Line above text', () => toggle('textDecoration', 'overline', 'none'), draft.textDecoration === 'overline'),
      action('Backing', 'Toggle color backing', () => set({ textBackground: draft.textBackground === 'none' ? '#ffffff' : 'none' }), draft.textBackground !== 'none'),
      action('Pad +', 'Increase backing padding', () => adjust('textPadding', 2)),
      action('Pad −', 'Decrease backing padding', () => adjust('textPadding', -2)),
    ],
    Shadow: [
      action('Shadow on', 'Enable text shadow', () => set({ textShadowBlur: Math.max(draft.textShadowBlur, 8),
        textShadowX: draft.textShadowX || 3, textShadowY: draft.textShadowY || 4 }), draft.textShadowBlur > 0),
      action('Shadow off', 'Disable text shadow', () => set({ textShadowBlur: 0 }), draft.textShadowBlur === 0),
      action('Blur +', 'Increase shadow blur', () => adjust('textShadowBlur', 2)),
      action('Blur −', 'Decrease shadow blur', () => adjust('textShadowBlur', -2)),
      action('X +', 'Move shadow right', () => adjust('textShadowX', 2)),
      action('X −', 'Move shadow left', () => adjust('textShadowX', -2)),
      action('Y +', 'Move shadow down', () => adjust('textShadowY', 2)),
      action('Y −', 'Move shadow up', () => adjust('textShadowY', -2)),
    ],
    Presets: [
      action('Default', 'Reset to standard text formatting', () => set(DEFAULT_TEXT_FORMAT)),
      action('Headline', 'Bold prominent display text', () => set({ fontWeight: '800', fontSize: 72, letterSpacing: 0.5, lineHeight: 1.1 })),
      action('Caption', 'Small readable caption', () => set({ fontWeight: '400', fontSize: 24, lineHeight: 1.35, letterSpacing: 0 })),
      action('Poster', 'Wide headline for posters', () => set({ fontWeight: '900', fontSize: 94, letterSpacing: 3, lineHeight: 1.05 })),
    ],
    Transform: [
      action('Reset style', 'Reset advanced text style', () => set({ textDecoration: 'none', textTransform: 'none',
        fontVariant: 'normal', textPadding: 0, textBackground: 'none', textShadowBlur: 0,
        textShadowX: 0, textShadowY: 0, letterSpacing: 0, lineHeight: 1.25 })),
      action('Tight', 'Compact line spacing', () => set({ lineHeight: 1 })),
      action('Normal', 'Normal line spacing', () => set({ lineHeight: 1.25 })),
      action('Airy', 'Generous line spacing', () => set({ lineHeight: 1.75 })),
      action('Rotate +15°', 'Rotate selected text clockwise', () => {
        if (draft.id) useEditor.getState().updateShape(draft.id, shape => { shape.rotation = ((shape.rotation ?? 0) + 15) % 360; });
      }),
      action('Rotate −15°', 'Rotate selected text counterclockwise', () => {
        if (draft.id) useEditor.getState().updateShape(draft.id, shape => { shape.rotation = ((shape.rotation ?? 0) - 15 + 360) % 360; });
      }),
      action('Wider', 'Increase selected text horizontal scaling', () => {
        if (draft.id) useEditor.getState().updateShape(draft.id, shape => { shape.textScaleX = Math.min(30, (shape.textScaleX ?? 1) * 1.1); });
      }),
      action('Narrower', 'Decrease selected text horizontal scaling', () => {
        if (draft.id) useEditor.getState().updateShape(draft.id, shape => { shape.textScaleX = Math.max(0.05, (shape.textScaleX ?? 1) / 1.1); });
      }),
    ],
  };

  return (
    <section className="focus-style-panel" aria-label="Advanced text styles">
      <nav className="focus-style-groups" aria-label="Text style sections">
        {(['Type', 'Paragraph', 'Decorate', 'Shadow', 'Transform', 'Presets'] as const).map(name => (
          <button type="button" key={name} aria-pressed={group === name} className={group === name ? 'selected' : ''}
            onClick={() => setGroup(name)}>{name}</button>
        ))}
      </nav>
      <div className="focus-style-actions" aria-label={`${group} styling actions`}>
        {controls[group].map(item => <button type="button" key={item.title} title={item.title}
          aria-pressed={item.active ?? false} className={item.active ? 'selected' : ''}
          onPointerDown={event => event.preventDefault()} onClick={item.run}>{item.label}</button>)}
        {group === 'Presets' && <div className="focus-text-presets">
          <label>Save current text style <input aria-label="Preset name" placeholder="My text style" value={presetName}
            maxLength={48} onChange={event => setPresetName(event.target.value)}/></label>
          <button type="button" onClick={savePreset} disabled={!presetName.trim()}>Save preset</button>
          {Object.entries(presets).map(([name, values]) => <button type="button" key={name}
            title={`Apply saved typography preset ${name}`} onClick={() => set(values as Partial<TextFormat>)}>{name}</button>)}
          <small>Presets store style controls, not the text content.</small>
        </div>}
        {group === 'Decorate' && draft.textBackground !== 'none' && <label className="focus-style-color">Background
          <BufferedColorPicker label="Text background color" value={draft.textBackground}
            onCommit={textBackground => set({ textBackground })} /></label>}
        {group === 'Shadow' && <label className="focus-style-color">Shadow color
          <BufferedColorPicker label="Text shadow color" value={draft.textShadowColor}
            onCommit={textShadowColor => set({ textShadowColor })} /></label>}
      </div>
      <p className="focus-style-hint">These controls style the entire text object; character-range styling comes later.</p>
    </section>
  );
}
