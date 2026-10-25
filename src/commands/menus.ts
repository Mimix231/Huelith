import { CREATIVE_DEFINITIONS, type CreativeKind } from '../editor/creative';
/** One action registry for compact native-style menu categories. No hidden placeholder actions. */
export type MenuAction =
  | 'new-document' | 'new-animation' | 'open' | 'import' | 'paste' | 'copy'
  | 'save' | 'save-as' | 'export-png' | 'export-svg' | 'export-apng' | 'export-sheet' | 'export-frames'
  | 'undo' | 'redo' | 'select-all' | 'deselect' | 'create-raster' | 'create-vector'
  | 'duplicate-layer' | 'delete-layer' | 'mask-selection' | 'clear-mask'
  | 'move' | 'pen' | 'text' | 'convert-animation' | 'next-frame' | 'previous-frame'
  | 'grid' | 'focus' | 'settings' | 'theme' | 'fx' | 'help' | 'creative-lab' | `creative-${CreativeKind}`;

export interface MenuEntry {
  id: MenuAction;
  label: string;
  shortcut?: string;
}

export interface MenuSection {
  heading: string;
  entries: MenuEntry[];
}

export const MENUS: Record<string, MenuSection[]> = {
  File: [
    { heading: 'Create & open', entries: [
      { id: 'new-document', label: 'New document', shortcut: 'Ctrl+N' },
      { id: 'new-animation', label: 'New animation' },
      { id: 'open', label: 'Open project', shortcut: 'Ctrl+O' },
      { id: 'import', label: 'Import image' },
    ] },
    { heading: 'Save & export', entries: [
      { id: 'save', label: 'Save project', shortcut: 'Ctrl+S' },
      { id: 'save-as', label: 'Save as…', shortcut: 'Ctrl+Shift+S' },
      { id: 'export-png', label: 'Export PNG' },
      { id: 'export-svg', label: 'Export SVG' },
      { id: 'export-apng', label: 'Export animation (APNG)' },
      { id: 'export-sheet', label: 'Export sprite sheet' },
      { id: 'export-frames', label: 'Export frame ZIP' },
    ] },
  ],
  Edit: [
    { heading: 'History', entries: [{ id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z' }, { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y' }] },
    { heading: 'Clipboard', entries: [{ id: 'copy', label: 'Copy object', shortcut: 'Ctrl+C' }, { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V' }] },
  ],
  Select: [{ heading: 'Selection', entries: [
    { id: 'select-all', label: 'Select entire canvas', shortcut: 'Ctrl+A' }, { id: 'deselect', label: 'Deselect', shortcut: 'Ctrl+D' },
  ] }],
  Layer: [
    { heading: 'Create', entries: [{ id: 'create-raster', label: 'New raster layer' }, { id: 'create-vector', label: 'New vector layer' }] },
    { heading: 'Modify', entries: [{ id: 'duplicate-layer', label: 'Duplicate layer' }, { id: 'delete-layer', label: 'Delete layer' },
      { id: 'mask-selection', label: 'Mask from selection' }, { id: 'clear-mask', label: 'Clear layer mask' }] },
  ],
  Object: [{ heading: 'Drawing tools', entries: [
    { id: 'move', label: 'Move & transform', shortcut: 'V' }, { id: 'pen', label: 'Precision pen', shortcut: 'P' },
    { id: 'text', label: 'Text', shortcut: 'T' },
  ] }],
  Effects: [{ heading: 'Creative workspace', entries: [{ id: 'fx', label: 'Open Huelith FX Studio' }] }],
  Creative: [
    { heading: 'Originals Studio', entries: [{ id: 'creative-lab', label: 'Open Huelith Originals' }] },
    { heading: 'Place an editable creative object', entries: CREATIVE_DEFINITIONS.map(item => ({
      id: `creative-${item.kind}` as MenuAction, label: item.name,
    })) },
  ],
  Animation: [
    { heading: 'Timeline', entries: [{ id: 'convert-animation', label: 'Convert project to animation' },
      { id: 'previous-frame', label: 'Previous frame' }, { id: 'next-frame', label: 'Next frame' }] },
  ],
  View: [
    { heading: 'Canvas', entries: [{ id: 'grid', label: 'Toggle grid' }, { id: 'focus', label: 'Focus mode', shortcut: 'Tab' }] },
    { heading: 'Interface', entries: [{ id: 'theme', label: 'Change theme' }, { id: 'settings', label: 'Preferences' }] },
  ],
  Help: [{ heading: 'Learn', entries: [{ id: 'help', label: 'About Huelith & shortcuts' }] }],
};
