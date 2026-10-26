import { CREATIVE_DEFINITIONS, type CreativeKind } from '../editor/creative';
/** One action registry for compact native-style menu categories. No hidden placeholder actions. */
export type MenuAction =
  | 'new-document' | 'new-animation' | 'open' | 'import' | 'paste' | 'copy'
  | 'save' | 'save-as' | 'export-png' | 'export-svg' | 'export-apng' | 'export-sheet' | 'export-frames'
  | 'resize-image' | 'resize-canvas' | 'crop-selection' | 'trim-transparent'
  | 'rotate-cw' | 'rotate-ccw' | 'rotate-180' | 'flip-horizontal' | 'flip-vertical' | 'precision-transform'
  | 'rasterize-layer' | 'align-horizontal' | 'align-vertical' | 'fit-layer'
  | 'fill-selection' | 'stroke-selection' | 'clear-selection'
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
    { heading: 'Image dimensions', entries: [
      {id:'resize-image', label:'Resize Image…',shortcut:'Ctrl+Alt+I'},
      {id:'resize-canvas',label:'Resize Canvas…',shortcut:'Ctrl+Alt+C'},
      {id:'crop-selection',label:'Crop to Selection'}, {id:'trim-transparent',label:'Trim Transparent Pixels'}] },
    { heading:'Orientation',entries:[{id:'rotate-cw',label:'Rotate 90° clockwise'},
      {id:'rotate-ccw',label:'Rotate 90° counterclockwise'}, {id:'rotate-180',label:'Rotate 180°'},
      {id:'flip-horizontal',label:'Flip Horizontal'}, {id:'flip-vertical',label:'Flip Vertical'}]},
    {heading:'Transform',entries:[{id:'precision-transform',label:'Precision Transform…',shortcut:'Ctrl+T'}]},
  ],
  Select: [{ heading: 'Selection', entries: [
    { id: 'select-all', label: 'Select entire canvas', shortcut: 'Ctrl+A' }, { id: 'deselect', label: 'Deselect', shortcut: 'Ctrl+D' },
  ] }],
  Layer: [
    { heading: 'Create', entries: [{ id: 'create-raster', label: 'New raster layer' }, { id: 'create-vector', label: 'New vector layer' }] },
    { heading: 'Modify', entries: [{ id: 'duplicate-layer', label: 'Duplicate layer' }, { id: 'delete-layer', label: 'Delete layer' },
      { id: 'mask-selection', label: 'Mask from selection' }, { id: 'clear-mask', label: 'Clear layer mask' }] },
    {heading:'Geometry & rasterization',entries:[
      {id:'rasterize-layer',label:'Rasterize Selected Layer'},
      {id:'align-horizontal',label:'Align Horizontally to Canvas'},
      {id:'align-vertical',label:'Align Vertically to Canvas'},
      {id:'fit-layer',label:'Fit Layer to Canvas'}]},
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
