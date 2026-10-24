import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDropDown, Refresh, Search } from '@mui/icons-material';
import { fontCssFamily, systemFonts, type FontCatalog } from '../editor/fonts';

interface Props {
  value: string;
  onChange: (family: string) => void;
  disabled?: boolean;
}

/** Searchable font menu rather than a static HTML datalist. Keeps keyboard focus predictable. */
export default function FontPicker({ value, onChange, disabled = false }: Props) {
  const [catalog, setCatalog] = useState<FontCatalog | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState({ left: 20, top: 50 });
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void systemFonts().then(next => { if (mounted) setCatalog(next); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (open && root.current) {
      const rect = root.current.getBoundingClientRect();
      const menuWidth = 255;
      const top = rect.bottom + 5;
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
        top: Math.min(top, window.innerHeight - 270) });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const dismiss = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  const fonts = useMemo(() => {
    const families = catalog?.families ?? [];
    const searched = query.trim().toLocaleLowerCase();
    // Every installed family must remain discoverable, not only the first 180.
    return searched ? families.filter(font => font.toLocaleLowerCase().includes(searched)) : families;
  }, [catalog, query]);

  const choose = (family: string): void => {
    onChange(family);
    setQuery('');
    setHighlighted(0);
    setOpen(false);
    // Editing text stays active when a style is chosen; return the blinking caret.
    requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLTextAreaElement>('.focus-text-input, .inline-text-editor');
      editor?.focus({ preventScroll: true });
    });
  };

  return (
    <div ref={root} className="spectrum-font-picker">
      <button
        type="button"
        className="font-picker-trigger"
        title="Choose a font family"
        aria-label="Font family"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
      >
        <span style={{ fontFamily: fontCssFamily(value) }}>{value}</span>
        <ArrowDropDown fontSize="small" />
      </button>
      {open && (
        <div className="font-picker-menu" style={position} role="group" aria-label="Installed font families"
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setHighlighted(index => Math.min(index + 1, fonts.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlighted(index => Math.max(0, index - 1));
            } else if (event.key === 'Enter' && fonts.length &&
              !(event.target instanceof HTMLButtonElement)) {
              event.preventDefault();
              choose(fonts[highlighted] ?? fonts[0]);
            }
          }}
        >
          <label className="font-picker-search">
            <Search fontSize="small" />
            <input ref={search} placeholder="Search installed fonts…" aria-label="Search fonts"
              value={query} onChange={event => {
                setQuery(event.target.value);
                setHighlighted(0);
              }} />
            <button type="button" title="Refresh installed fonts" aria-label="Refresh fonts"
              onClick={() => void systemFonts(true).then(setCatalog)}><Refresh fontSize="small" /></button>
          </label>
          <div className="font-picker-results" role="listbox" aria-label="Font list">
            {fonts.map((font, index) => (
              <button type="button" role="option" aria-selected={font === value} key={font}
                data-highlighted={index === highlighted}
                style={{ fontFamily: fontCssFamily(font) }}
                onClick={() => choose(font)}>{font}</button>
            ))}
            {!fonts.length && <p className="font-picker-note">No matching fonts.</p>}
          </div>
          <div className="font-picker-footer">
            {catalog?.source === 'system'
              ? `${catalog.families.length} installed font families`
              : 'Browser preview: common fonts only. Desktop loads installed fonts.'}
          </div>
        </div>
      )}
    </div>
  );
}
