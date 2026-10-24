import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '../editor/store';
import { fontCssFamily } from '../editor/fonts';
import FontPicker from './FontPicker';
import FocusTextTools from './FocusTextTools';
import BufferedColorPicker from './BufferedColorPicker';
import type { TextDraft } from '../editor/typography';

/**
 * Focus Text is a presentation-only editing surface. Its text never changes
 * shape coordinates; the document is mutated once, on commit.
 * Leaving retains a visual snapshot while the original artwork reappears.
 */
function editingSurface(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return 'rgba(255,255,255,.94)';
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = .2126 * red + .7152 * green + .0722 * blue;
  return luminance >= 155 ? 'rgba(17,20,34,.92)' : 'rgba(255,255,255,.94)';
}

export default function FocusTextEditor() {
  const draft = useEditor(state => state.textDraft);
  const [visual, setVisual] = useState<TextDraft | null>(null);
  const [leaving, setLeaving] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const initializedSession = useRef<string | null>(null);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    if (draft) {
      setVisual(draft);
      setLeaving(false);
    } else if (visual) {
      setLeaving(true);
      cancelTimer.current = setTimeout(() => setVisual(null), 190);
    }
    return () => {
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
    };
  }, [draft, visual?.sessionId]);

  useEffect(() => {
    if (!draft || initializedSession.current === draft.sessionId) return;
    initializedSession.current = draft.sessionId;
    const frame = requestAnimationFrame(() => {
      textarea.current?.focus({ preventScroll: true });
      if (draft.id === null) {
        const length = textarea.current?.value.length ?? 0;
        textarea.current?.setSelectionRange(length, length);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [draft?.sessionId]);

  if (!visual) return null;
  const editing = draft ?? visual;
  const commit = () => useEditor.getState().commitTextDraft();
  const cancel = () => useEditor.getState().cancelTextDraft();
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit();
    }
  };
  const target = document.querySelector('.app') ?? document.body;
  return createPortal(
    <div className={`spectrum-focus-text ${leaving ? 'is-leaving' : ''}`} role="dialog"
      aria-modal="true" aria-label="Focus Text editor">
      <button type="button" className="focus-text-backdrop" aria-label="Finish editing text"
        onClick={commit} tabIndex={-1} />
      <div className="focus-text-card">
        <div className="focus-text-toolbar">
          <span className="focus-text-title"><span className="focus-text-symbol">T</span> Focus Text</span>
          <FontPicker value={editing.fontFamily} onChange={fontFamily => useEditor.getState().setTextFormat({ fontFamily })} />
          <label className="focus-text-number">Size <input aria-label="Focus text size" type="number" min={4} max={600}
            value={editing.fontSize} onChange={event => useEditor.getState().setTextFormat({ fontSize: Number(event.target.value) })} /></label>
          <button type="button" className={`focus-text-format ${editing.fontWeight === '700' ? 'selected' : ''}`}
            aria-label="Bold text" aria-pressed={editing.fontWeight === '700'}
            onClick={() => useEditor.getState().setTextFormat({ fontWeight: editing.fontWeight === '700' ? '400' : '700' })}>B</button>
          <button type="button" className={`focus-text-format italic ${editing.fontStyle === 'italic' ? 'selected' : ''}`}
            aria-label="Italic text" aria-pressed={editing.fontStyle === 'italic'}
            onClick={() => useEditor.getState().setTextFormat({ fontStyle: editing.fontStyle === 'italic' ? 'normal' : 'italic' })}>I</button>
          <BufferedColorPicker label="Focus text color" value={editing.color}
            onCommit={color => useEditor.getState().setTextFormat({ color })} />
        </div>
        <FocusTextTools draft={editing} />
        <textarea ref={textarea} autoFocus={!leaving} spellCheck={false}
          aria-label="Type and edit focused text" className="focus-text-input"
          placeholder="Type something beautiful…" value={editing.value} onKeyDown={onKeyDown}
          onChange={event => useEditor.getState().changeTextDraft({ value: event.target.value })}
          style={{
            backgroundColor: editingSurface(editing.color),
            color: editing.color,
            caretColor: editing.color,
            fontFamily: fontCssFamily(editing.fontFamily),
            fontSize: `${Math.max(18, Math.min(110, editing.fontSize))}px`,
            fontWeight: editing.fontWeight,
            fontStyle: editing.fontStyle,
            lineHeight: editing.lineHeight,
            letterSpacing: `${editing.letterSpacing}px`,
            textAlign: editing.textAlign,
            textTransform: editing.textTransform,
            fontVariant: editing.fontVariant,
            textDecoration: editing.textDecoration === 'line-through' ? 'line-through'
              : editing.textDecoration === 'none' ? 'none' : editing.textDecoration,
            textShadow: editing.textShadowBlur > 0
              ? `${editing.textShadowX}px ${editing.textShadowY}px ${editing.textShadowBlur}px ${editing.textShadowColor}` : 'none',
          }} />
        <footer className="focus-text-footer">
          <span>Enter to apply · Shift+Enter for new line · Esc to cancel</span>
          <div><button type="button" onClick={cancel}>Cancel</button>
            <button type="button" className="focus-text-apply" onClick={commit}>Apply text ↵</button></div>
        </footer>
      </div>
    </div>, target,
  );
}
