import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog } from '@mui/material';
import { applyPreferences, loadPreferences, resetPreferences, savePreferences, type AuroraPreferences } from '../../settings/preferences';
import {
  CATEGORIES, type Category, type ShortcutItem,
  AppearanceSection, PerformanceSection, CanvasSection, EditingSection,
  EffectsSection, AnimationSection, StorageSection, ShortcutsSection, AboutSection,
} from './SettingsSections';
import '../../styles/aurora-settings.css';

interface Props {
  open: boolean;
  onClose: () => void;
  shortcuts: Record<string, string>;
  setShortcuts: (value: Record<string, string>) => void;
  shortcutTools: ShortcutItem[];
}
const titles: Record<Category, string> = Object.fromEntries(CATEGORIES.map(item => [item.id, item.label])) as Record<Category, string>;
export default function AuroraSettings({ open, onClose, shortcuts, setShortcuts, shortcutTools }: Props) {
  const [category, setCategory] = useState<Category>('appearance');
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState<AuroraPreferences>(loadPreferences);
  useEffect(() => { applyPreferences(settings); }, [settings]);
  function update(patch: Partial<AuroraPreferences>): void {
    setSettings(previous => savePreferences({ ...previous, ...patch }));
  }
  const props = { settings, update, shortcuts, setShortcuts, shortcutTools };
  const matching = CATEGORIES.filter(item => `${item.label} ${item.keywords}`.toLowerCase().includes(search.trim().toLowerCase()));
  const active = matching.some(item => item.id === category) ? category : matching[0]?.id;
  const sections: Record<Category, ReactNode> = {
    appearance: <AppearanceSection {...props} />,
    performance: <PerformanceSection {...props} />,
    canvas: <CanvasSection {...props} />,
    editing: <EditingSection {...props} />,
    effects: <EffectsSection {...props} />,
    animation: <AnimationSection />,
    storage: <StorageSection />,
    shortcuts: <ShortcutsSection {...props} />,
    about: <AboutSection />,
  };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="huelith-settings-title"
    className="aurora-settings-dialog" PaperProps={{ className: 'aurora-settings-surface' }}>
    <div className="aurora-settings-title">
      <div className="aurora-settings-brand"><span className="aurora-settings-emblem">✦</span>
        <span><strong id="huelith-settings-title">Huelith Settings</strong><small>Performance & appearance · Your workspace, your hardware</small></span>
      </div>
      <button type="button" aria-label="Close settings" className="aurora-settings-close" onClick={onClose}>×</button>
    </div>
    <div className="aurora-settings-body">
      <aside className="aurora-settings-nav" aria-label="Settings categories">
        <input aria-label="Search settings" placeholder="Search settings…" type="search" value={search} onChange={event => setSearch(event.target.value)} />
        {matching.map(item => <button type="button" className={item.id === active ? 'selected' : ''}
          key={item.id} aria-current={item.id === active ? 'page' : undefined}
          onClick={() => setCategory(item.id)}><span>{item.icon}</span>{item.label}</button>)}
        {!matching.length && <p>No matching categories.</p>}
      </aside>
      <section className="aurora-settings-content" aria-label={active ? titles[active] : 'Settings'}>
        {active ? sections[active] : <p>Try another search term.</p>}
      </section>
    </div>
    <footer className="aurora-settings-footer">
      <button type="button" onClick={() => { setSettings(resetPreferences()); }} className="aurora-reset">Reset preferences</button>
      <span>Preferences save automatically</span>
      <Button variant="contained" size="small" onClick={onClose}>Done</Button>
    </footer>
  </Dialog>;
}
