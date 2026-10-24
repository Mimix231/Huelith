import { useState } from 'react';
import type { TextDraft, TextFormat } from '../editor/typography';
import { useEditor } from '../editor/store';
import BufferedColorPicker from './BufferedColorPicker';
import './FocusTextTools.css';

type ToolGroup = 'Type' | 'Paragraph' | 'Decorate' | 'Shadow' | 'Transform';
interface Action {
  label: string;
  title: string;
  active?: boolean;
  run: () => void;
}

export default function FocusTextTools({ draft }: { draft: TextDraft }) {
  const [group, setGroup] = useState<ToolGroup>('Type');
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
    Transform: [
      action('Reset style', 'Reset advanced text style', () => set({ textDecoration: 'none', textTransform: 'none',
        fontVariant: 'normal', textPadding: 0, textBackground: 'none', textShadowBlur: 0,
        textShadowX: 0, textShadowY: 0, letterSpacing: 0, lineHeight: 1.25 })),
      action('Tight', 'Compact line spacing', () => set({ lineHeight: 1 })),
      action('Normal', 'Normal line spacing', () => set({ lineHeight: 1.25 })),
      action('Airy', 'Generous line spacing', () => set({ lineHeight: 1.75 })),
    ],
  };

  return (
    <section className="focus-style-panel" aria-label="Advanced text styles">
      <nav className="focus-style-groups" aria-label="Text style sections">
        {(['Type', 'Paragraph', 'Decorate', 'Shadow', 'Transform'] as const).map(name => (
          <button type="button" key={name} aria-pressed={group === name} className={group === name ? 'selected' : ''}
            onClick={() => setGroup(name)}>{name}</button>
        ))}
      </nav>
      <div className="focus-style-actions" aria-label={`${group} styling actions`}>
        {controls[group].map(item => <button type="button" key={item.title} title={item.title}
          aria-pressed={item.active ?? false} className={item.active ? 'selected' : ''}
          onPointerDown={event => event.preventDefault()} onClick={item.run}>{item.label}</button>)}
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
