import { useEffect, useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Menu, MenuItem, ListSubheader, Divider, Slider, Stack, TextField, Tooltip, Typography, Select, FormControl, Snackbar, Alert,
} from '@mui/material';
import {
  Add, ArrowDownward, ArrowUpward, AutoAwesome, Brush, Close,
  Colorize, ContentCopy, Create, Delete, Download, Edit,
  FlipToFront, GridOn, History, Image, Layers,
  Lock, LockOpen, Menu as MenuIcon, Mouse, Palette, PanTool,
  RadioButtonUnchecked, Rectangle, Redo, Save, Settings, ShapeLine,
  TextFields, Undo, Visibility, VisibilityOff, ZoomIn, ZoomOut, HorizontalRule, CropFree, Tune, ViewSidebar,
} from '@mui/icons-material';
import { activeLayer, activeTab, useEditor, type EditorStore } from './editor/store';
import { flattenLayers, validSize, type BlendMode, type Tool, type Workspace } from './editor/types';
import { scaleShape, shapeBounds, translateShape } from './editor/geometry';
import { exportImage, exportSvg, importImage, openProject, saveProject } from './editor/files';
import { getRecovery, storeRecovery } from './editor/recovery';
import { handlePaste, pasteFromSystem, copySelected, insertImage } from './editor/clipboard';
import FxStudio from './components/FxStudio';
import FontPicker from './components/FontPicker';
import WindowControls from './components/WindowControls';
import BufferedColorPicker from './components/BufferedColorPicker';
import { reflowTextShape } from './editor/typography';
import type { AppearanceMode } from './editor/types';
import Canvas from './components/Canvas';
import AnimationTimeline from './components/AnimationTimeline';
import CreativeLab from './components/CreativeLab';
import AuroraSettings from './components/settings/AuroraSettings';
import { loadPreferences, PREFERENCES_EVENT } from './settings/preferences';
import { configureNativeBackend, configureNativeCacheBudget } from './settings/native-aurora';
import { CREATIVE_DEFINITIONS } from './editor/creative';
import { MENUS, type MenuAction } from './commands/menus';
import { exportAnimation } from './editor/animation-export';
import './styles/app.css';
import './styles/glass.css';
import './styles/material.css';
import './styles/classic.css';
import './styles/midnight.css';
import './styles/studio.css';
import './styles/strawberry.css';
import './styles/melon.css';
import './styles/peach.css';
import './styles/lemon.css';
import './styles/mango.css';
import './styles/sakura.css';
import './styles/blossom.css';
import './styles/shadow.css';
import './styles/polish.css';
import './styles/typography.css';
import './styles/workspace-pro.css';
import './styles/studio-experience.css';

interface ToolEntry {
  id: Tool;
  label: string;
  icon: ReactNode;
  shortcut: string;
}

const tools: ToolEntry[] = [
  { id: 'move', label: 'Move & transform', icon: <Mouse />, shortcut: 'V' },
  { id: 'node', label: 'Edit Bézier nodes', icon: <Tune />, shortcut: 'A' },
  { id: 'marquee', label: 'Rectangular selection', icon: <CropFree />, shortcut: 'M' },
  { id: 'hand', label: 'Pan', icon: <PanTool />, shortcut: 'H' },
  { id: 'brush', label: 'Brush', icon: <Brush />, shortcut: 'B' },
  { id: 'eraser', label: 'Eraser', icon: <Edit />, shortcut: 'E' },
  { id: 'eyedropper', label: 'Eyedropper', icon: <Colorize />, shortcut: 'I' },
  { id: 'rectangle', label: 'Rectangle', icon: <Rectangle />, shortcut: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: <RadioButtonUnchecked />, shortcut: 'O' },
  { id: 'roundedRect', label: 'Rounded rectangle', icon: <Rectangle />, shortcut: 'U' },
  { id: 'triangle', label: 'Triangle', icon: <ShapeLine />, shortcut: 'Y' },
  { id: 'polygon', label: 'Polygon', icon: <ShapeLine />, shortcut: 'G' },
  { id: 'star', label: 'Star', icon: <AutoAwesome />, shortcut: 'Q' },
  { id: 'arrow', label: 'Arrow', icon: <HorizontalRule />, shortcut: 'W' },
  { id: 'heart', label: 'Heart', icon: <AutoAwesome />, shortcut: 'J' },
  { id: 'ring', label: 'Ring', icon: <RadioButtonUnchecked />, shortcut: 'K' },
  { id: 'line', label: 'Line', icon: <HorizontalRule />, shortcut: 'L' },
  { id: 'pen', label: 'Precision pen (Enter to finish)', icon: <Create />, shortcut: 'P' },
  { id: 'freehand', label: 'Freehand path', icon: <Brush />, shortcut: 'F' },
  { id: 'text', label: 'Text', icon: <TextFields />, shortcut: 'T' },
];

function makeTheme(workspace: Workspace, appearanceMode: AppearanceMode) {
  const material = workspace === 'material';
  const classic = workspace === 'classic';
  const studio = workspace === 'studio';
  const midnight = workspace === 'midnight';
  const themedAccents: Record<string, string> = {
    strawberry: '#ba315e', melon: '#167e68', peach: '#cb6b57', lemon: '#9b7d00',
    mango: '#bd681f', sakura: '#ac6ca1', blossom: '#8158b5', shadow: '#b9b7fa',
  };
  const darkAccents: Record<string, string> = {
    strawberry: '#ff7eaa', melon: '#66dbac', peach: '#ffac90', lemon: '#ffdc64',
    mango: '#ffb45e', sakura: '#dd9ecf', blossom: '#b49cf1', shadow: '#c9c5ff',
    material: '#d4b8ff', studio: '#8bd1e5', classic: '#bbd8f5', midnight: '#84aaff', glass: '#b7b6ff',
  };
  const primary = (appearanceMode === 'dark' ? darkAccents[workspace] : themedAccents[workspace])
    ?? (material ? '#6750a4' : studio ? '#176e8d'
    : classic ? '#b4c7df' : midnight ? '#80b4ff' : '#a5a5ff');
  const isLight = appearanceMode === 'light';
  return createTheme({
    palette: {
      mode: isLight ? 'light' : 'dark',
      primary: { main: primary },
      secondary: { main: isLight ? '#435d77' : '#a5bad4' },
      background: {
        default: isLight ? '#faf9fc' : '#171924',
        paper: isLight ? '#ffffff' : '#242738',
      },
    },
    shape: { borderRadius: material ? 18 : classic || studio || workspace === 'shadow' ? 4 : 12 },
    typography: {
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
      fontSize: 12,
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { minWidth: 0, borderRadius: material ? 15 : classic || studio ? 3 : midnight ? 5 : 8, boxShadow: 'none' },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: material ? 11 : classic || studio ? 3 : midnight ? 5 : 8 } },
      },
      MuiSlider: { styleOverrides: { root: { paddingTop: 11, paddingBottom: 11 } } },
      MuiMenu: { defaultProps: { slotProps: { paper: { className: 'huelith-popup' } } } },
    },
  });
}

interface ActionIconProps {
  title: string;
  children: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
}

function ActionIcon({ title, children, onClick, active = false, disabled = false }: ActionIconProps) {
  return (
    <Tooltip title={title} placement="right">
      <span>
        <IconButton
          aria-label={title}
          size="small"
          className={active ? 'selected' : ''}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

function ToolRail({ state, openNew }: { state: EditorStore; openNew: () => void }) {
  return (
    <aside className="toolrail" aria-label="Editing tools">
      <div className="rail-heading">TOOLS</div>
      {tools.filter(tool => !['roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring'].includes(tool.id)).map(tool => (
        <ActionIcon
          key={tool.id}
          title={`${tool.label} (${tool.shortcut})`}
          active={tool.id === state.tool}
          onClick={() => {
            state.setTool(tool.id);
            if (tool.id !== 'node' && tool.id !== 'move' && tool.id !== 'text') state.selectShape(null);
          }}
        >
          {tool.icon}
        </ActionIcon>
      ))}
      <div className="rail-spacer" />
      <ActionIcon title="Toggle grid" active={state.grid} onClick={() => state.setGrid(!state.grid)}>
        <GridOn />
      </ActionIcon>
      <ActionIcon title="Reset canvas position" onClick={() => { state.setZoom(1); state.setPan({ x: 0, y: 0 }); }}>
        <FlipToFront />
      </ActionIcon>
      <ActionIcon title="New document" onClick={openNew}>
        <Add />
      </ActionIcon>
    </aside>
  );
}

function CompactSlider({
  label, value, min, max, display, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="compact-slider">
      <span>{label}</span>
      <Slider
        aria-label={label}
        size="small"
        min={min}
        max={max}
        value={value}
        onChange={(_, next) => onChange(next as number)}
      />
      <output>{display}</output>
    </div>
  );
}

function ContextToolbar({ state }: { state: EditorStore }) {
  const entry = tools.find(item => item.id === state.tool);
  const drawing = state.tool === 'brush' || state.tool === 'eraser';
  const colorTool = ['brush', 'rectangle', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'line', 'pen', 'freehand'].includes(state.tool);
  const shapeTool = ['rectangle', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'line', 'pen', 'freehand'].includes(state.tool);
  const selectionTool = state.tool === 'marquee';
  const moveTool = state.tool === 'move' || state.tool === 'node';
  const active = activeLayer(state);
  const selectedText = active?.type === 'vector'
    ? active.shapes.find(shape => shape.id === state.selectedShapeId && shape.kind === 'text') : undefined;
  const typing = state.tool === 'text' || Boolean(selectedText) || Boolean(state.textDraft);
  const format = state.textDraft ?? (selectedText ? {
    ...state.textDefaults,
    fontFamily: selectedText.fontFamily ?? 'Arial',
    fontSize: selectedText.fontSize ?? 48,
    fontWeight: selectedText.fontWeight ?? '400',
    fontStyle: selectedText.fontStyle ?? 'normal',
    color: selectedText.fill,
    textAlign: selectedText.textAlign ?? 'left',
    letterSpacing: selectedText.letterSpacing ?? 0,
    lineHeight: selectedText.lineHeight ?? 1.25,
  } : state.textDefaults);

  return (
    <div className="contextbar" aria-label="Contextual tool settings">
      <div className="tool-label">{entry?.icon}<strong>{entry?.label}</strong></div>
      <span className="context-divider" />
      {colorTool && (
        <label className="swatch-control">
          <span>{drawing ? 'Color' : 'Stroke'}</span>
          <BufferedColorPicker value={state.color} label="Stroke color" onCommit={state.setColor} />
        </label>
      )}
      {shapeTool && (
        <label className="shape-family-switcher">
          <span>Shape</span>
          <select aria-label="Select shape type" value={['freehand', 'pen'].includes(state.tool) ? state.tool : state.tool}
            onChange={event => state.setTool(event.target.value as Tool)}>
            {tools.filter(option => ['rectangle', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'line', 'pen', 'freehand'].includes(option.id))
              .map(option => <option value={option.id} key={option.id}>{option.label}</option>)}
          </select>
        </label>
      )}
      {shapeTool && (
        <label className="swatch-control">
          <span>Fill</span>
          <BufferedColorPicker value={state.fill} label="Fill color" onCommit={state.setFill} />
        </label>
      )}
      {(drawing || shapeTool) && (
        <CompactSlider label="Size" value={state.strokeWidth} min={1} max={120}
          display={`${state.strokeWidth}px`} onChange={state.setStrokeWidth} />
      )}
      {drawing && (
        <>
          <CompactSlider label="Hardness" value={Math.round(state.hardness * 100)} min={2} max={100}
            display={`${Math.round(state.hardness * 100)}%`} onChange={value => state.setHardness(value / 100)} />
          <CompactSlider label="Smoothing" value={Math.round(state.smoothing * 100)} min={0} max={95}
            display={`${Math.round(state.smoothing * 100)}%`} onChange={value => state.setSmoothing(value / 100)} />
          <CompactSlider label="Opacity" value={Math.round(state.opacity * 100)} min={1} max={100}
            display={`${Math.round(state.opacity * 100)}%`} onChange={value => state.setOpacity(value / 100)} />
        </>
      )}
      {selectionTool && (
        <>
          <span className="context-instruction">Drag to select an area</span>
          <Button size="small" disabled={!state.selection} onClick={() => state.setSelection(null)}>Deselect</Button>
        </>
      )}
      {moveTool && (
        <span className="context-instruction">
          {state.tool === 'node' ? 'Drag anchor points and curve handles' : 'Drag objects or use resize / rotate handles'}
        </span>
      )}
      {state.tool === 'pen' && <Button size="small" variant="contained"
        onClick={() => window.dispatchEvent(new Event('huelith-finish-pen'))}>Finish path (Enter)</Button>}
      {state.tool === 'line' && <span className="context-instruction">After drawing: press A and drag any of the four points</span>}
      {typing && (
        <div className="inline-typography" aria-label="Typography controls">
          <FontPicker value={format.fontFamily}
            onChange={fontFamily => state.setTextFormat({ fontFamily })} />
          <label className="type-size" title="Font size in pixels">
            <span>Size</span>
            <input type="number" aria-label="Text size" min={4} max={600} value={format.fontSize}
              onChange={event => state.setTextFormat({ fontSize: Number(event.target.value) })} />
          </label>
          <button className={format.fontWeight === '700' ? 'type-toggle active' : 'type-toggle'}
            type="button" title="Toggle bold" aria-label="Bold text"
            onClick={() => state.setTextFormat({ fontWeight: format.fontWeight === '700' ? '400' : '700' })}>B</button>
          <button className={format.fontStyle === 'italic' ? 'type-toggle active italic' : 'type-toggle italic'}
            type="button" title="Toggle italic" aria-label="Italic text"
            onClick={() => state.setTextFormat({ fontStyle: format.fontStyle === 'italic' ? 'normal' : 'italic' })}>I</button>
          <label className="swatch-control type-color"><span>Text</span>
            <BufferedColorPicker label="Text color"
              value={/^#[0-9a-f]{6}$/i.test(format.color) ? format.color : '#222222'}
              onCommit={color => state.setTextFormat({ color })} />
          </label>
          {state.textDraft && (
            <button type="button" className="type-finish" onClick={() => state.commitTextDraft()}>✓ Done</button>
          )}
        </div>
      )}
      {state.tool === 'hand' && <span className="context-instruction">Drag to pan · Ctrl+scroll to zoom</span>}
      <span className="context-grow" />
      <ActionIcon title="Zoom out" onClick={() => state.setZoom(state.zoom / 1.25)}><ZoomOut /></ActionIcon>
      <span className="zoom-value">{Math.round(state.zoom * 100)}%</span>
      <ActionIcon title="Zoom in" onClick={() => state.setZoom(state.zoom * 1.25)}><ZoomIn /></ActionIcon>
    </div>
  );
}

function DocumentTabs({ state, openNew }: { state: EditorStore; openNew: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [context, setContext] = useState<{ anchor: HTMLElement; id: string } | null>(null);

  const closeOthers = (id: string): void => {
    const others = state.tabs.filter(tab => tab.doc.id !== id);
    if (others.some(tab => tab.dirty)
      && !window.confirm(`Close ${others.length} other documents, including unsaved work?`)) return;
    for (const tab of others) state.closeDoc(tab.doc.id);
    state.activate(id);
  };

  return (
    <div className="document-strip">
      <div className="document-tabs" role="tablist" aria-label="Open documents">
        {state.tabs.map(tab => (
          <div className={`doc-tab ${tab.doc.id === state.activeId ? 'active' : ''}`} key={tab.doc.id}
            draggable={editingId !== tab.doc.id}
            onDragStart={event => {
              event.dataTransfer.setData('application/x-huelith-tab', tab.doc.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={event => {
              if (event.dataTransfer.types.includes('application/x-huelith-tab')) event.preventDefault();
            }}
            onDrop={event => {
              const source = event.dataTransfer.getData('application/x-huelith-tab');
              if (source) {
                event.preventDefault();
                state.reorderTabs(source, tab.doc.id);
              }
            }}
            onContextMenu={event => {
              event.preventDefault();
              setContext({ anchor: event.currentTarget, id: tab.doc.id });
            }}>
            {editingId === tab.doc.id ? (
              <input className="doc-tab-edit" autoFocus aria-label="Rename document"
                defaultValue={tab.doc.name}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    event.currentTarget.dataset.cancel = 'true';
                    event.currentTarget.blur();
                  }
                }}
                onBlur={event => {
                  if (event.currentTarget.dataset.cancel !== 'true') state.renameDoc(tab.doc.id, event.target.value);
                  setEditingId(null);
                }}
              />
            ) : (
              <button type="button" className="doc-tab-select" role="tab"
                aria-selected={tab.doc.id === state.activeId}
                title={`${tab.doc.name}${tab.dirty ? ' — unsaved' : ''} · drag to rearrange`}
                onClick={() => state.activate(tab.doc.id)}
                onDoubleClick={() => setEditingId(tab.doc.id)}
                onKeyDown={event => {
                  if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                  const currentIndex = state.tabs.findIndex(item => item.doc.id === tab.doc.id);
                  const target = state.tabs[currentIndex + (event.key === 'ArrowLeft' ? -1 : 1)];
                  if (target) {
                    event.preventDefault();
                    state.reorderTabs(tab.doc.id, target.doc.id);
                  }
                }}>
                <Image sx={{ fontSize: 14 }} />
                <span>{tab.doc.name}</span>
                {tab.dirty && <i className="unsaved-dot" aria-label="Unsaved changes" />}
              </button>
            )}
            <button type="button" className="tab-close"
              aria-label={`Close ${tab.doc.name}`} title={`Close ${tab.doc.name}`}
              onClick={() => {
                if (tab.dirty && !window.confirm('Close this document with unsaved changes?')) return;
                state.closeDoc(tab.doc.id);
              }}><Close sx={{ fontSize: 13 }} /></button>
          </div>
        ))}
        <ActionIcon title="New document (Ctrl+N)" onClick={openNew}><Add fontSize="small" /></ActionIcon>
      </div>
      <span className="workspace-indicator"><AutoAwesome sx={{ fontSize: 13 }} /> Creative workspace</span>
      <Menu anchorEl={context?.anchor} open={Boolean(context)} onClose={() => setContext(null)}>
        <MenuItem onClick={() => {
          if (context) setEditingId(context.id);
          setContext(null);
        }}>Rename document</MenuItem>
        <MenuItem onClick={() => {
          if (context) state.duplicateDoc(context.id);
          setContext(null);
        }}>Duplicate document</MenuItem>
        <MenuItem onClick={() => {
          if (context) closeOthers(context.id);
          setContext(null);
        }}>Close other documents</MenuItem>
      </Menu>
    </div>
  );
}

type InspectorPanel = 'layers' | 'properties' | 'history';

const blendOptions: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

function InspectorNumber({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="inspector-number" key={`${label}-${value}`}>
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        defaultValue={Math.round(value * 100) / 100}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        onBlur={event => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onChange(next);
        }}
      />
    </label>
  );
}

function TextContentEditor({ shape, state }: { shape: import('./editor/types').VectorShape; state: EditorStore }) {
  const [content, setContent] = useState(shape.text ?? '');

  useEffect(() => {
    setContent(shape.text ?? '');
  }, [shape.id, shape.text]);

  const commit = (): void => {
    if (content === (shape.text ?? '')) return;
    state.updateShape(shape.id, target => {
      target.text = content;
      reflowTextShape(target);
    });
  };

  return (
    <label className="text-content-field">
      <span>Text content <small>Ctrl+Enter to apply</small></span>
      <textarea aria-label="Text content" value={content} rows={4}
        spellCheck={false}
        onChange={event => setContent(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function Inspector({ state }: { state: EditorStore }) {
  const [panel, setPanel] = useState<InspectorPanel>('layers');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [preview, setPreview] = useState(100);
  const [fxOpen, setFxOpen] = useState(false);
  useEffect(() => {
    const openFx = (): void => { setPanel('layers'); setFxClosing(false); setFxOpen(true); };
    window.addEventListener('huelith-open-fx', openFx);
    return () => window.removeEventListener('huelith-open-fx', openFx);
  }, []);
  const [fxClosing, setFxClosing] = useState(false);
  const closeFx = (): void => {
    if (fxClosing) return;
    setFxClosing(true);
  };

  useEffect(() => {
    if (!fxClosing) return;
    const timer = window.setTimeout(() => {
      setFxOpen(false);
      setFxClosing(false);
    }, 155);
    return () => window.clearTimeout(timer);
  }, [fxClosing]);

  const tab = activeTab(state);
  const doc = tab.doc;
  const active = activeLayer(state);
  const activeShape = active?.type === 'vector' ? active.shapes.find(shape => shape.id === state.selectedShapeId) : undefined;
  const layers = [...doc.layers].reverse();

  useEffect(() => {
    setPreview(Math.round((active?.opacity ?? 1) * 100));
  }, [active?.id, active?.opacity]);

  const changeNumber = (key: 'x' | 'y' | 'rotation' | 'width' | 'height', value: number): void => {
    if (!active) return;
    if (activeShape) {
      state.updateShape(activeShape.id, shape => {
        if (shape.kind === 'path' || shape.kind === 'line') {
          const bounds = shapeBounds(shape);
          if (key === 'x') translateShape(shape, value - (shape.kind === 'line' ? shape.x : bounds.x), 0);
          else if (key === 'y') translateShape(shape, 0, value - (shape.kind === 'line' ? shape.y : bounds.y));
          else if (key === 'width' || key === 'height') {
            scaleShape(shape, bounds, { ...bounds, [key]: Math.max(1, value) });
          } else shape.rotation = value;
        } else if (key === 'width' || key === 'height') shape[key] = Math.max(1, value);
        else shape[key] = value;
      });
    } else if (key === 'x' || key === 'y') {
      state.mutate(document => {
        const layer = document.layers.find(item => item.id === active.id);
        if (layer && !layer.locked) layer[key] = value;
      });
    } else if (key === 'rotation' && active.type === 'raster') {
      state.mutate(document => {
        const layer = document.layers.find(item => item.id === active.id);
        if (layer?.type === 'raster' && !layer.locked) layer.rotation = value;
      });
    }
  };

  return (
    <aside className="inspector" aria-label="Document inspector" style={{ width: state.inspectorWidth }}>
      <div className="inspector-resize" role="separator" aria-orientation="vertical"
        aria-label="Resize inspector" aria-valuenow={state.inspectorWidth} tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') state.setInspectorWidth(state.inspectorWidth + 12);
          if (event.key === 'ArrowRight') state.setInspectorWidth(state.inspectorWidth - 12);
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') state.saveInspectorWidth();
        }}
        onPointerDown={event => {
          const element = event.currentTarget;
          element.setPointerCapture(event.pointerId);
          element.dataset.pointer = String(event.clientX);
          element.dataset.width = String(state.inspectorWidth);
        }}
        onPointerUp={() => state.saveInspectorWidth()}
        onPointerCancel={() => state.saveInspectorWidth()}
        onPointerMove={event => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const original = Number(event.currentTarget.dataset.width);
          const from = Number(event.currentTarget.dataset.pointer);
          state.setInspectorWidth(original + from - event.clientX);
        }}
      />
      <div className="inspector-tabs">
        {(['layers', 'properties', 'history'] as const).map(key => (
          <button type="button" className={panel === key ? 'active' : ''} key={key}
            aria-pressed={panel === key} onClick={() => setPanel(key)}>
            {key === 'layers' ? <Layers /> : key === 'properties' ? <Settings /> : <History />}
            {key}
          </button>
        ))}
      </div>

      {panel === 'layers' && (
        <>
          <div className="panel-title"><span>Layers</span><span>{doc.layers.length}</span></div>
          <div className="layer-list">
            {layers.map(layer => (
              <div className={`layer-row ${doc.activeLayerId === layer.id ? 'active' : ''}`} key={layer.id}>
                <button type="button" title={layer.visible ? 'Hide layer' : 'Show layer'}
                  aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                  onClick={() => state.toggleLayer(layer.id, 'visible')}>
                  {layer.visible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                </button>
                <div className={`layer-thumb ${layer.type}`}>
                  {layer.type === 'vector' ? <ShapeLine /> : <Image />}
                </div>
                {renameId === layer.id ? (
                  <input
                    className="layer-rename-input"
                    autoFocus
                    aria-label={`Rename ${layer.name}`}
                    defaultValue={layer.name}
                    onKeyDown={event => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      if (event.key === 'Escape') setRenameId(null);
                    }}
                    onBlur={event => {
                      if (renameId === layer.id && event.target.value.trim()) {
                        state.renameLayer(layer.id, event.target.value);
                      }
                      setRenameId(null);
                    }}
                  />
                ) : (
                  <button type="button" className="layer-info" title="Click to select · double-click to rename"
                    aria-current={doc.activeLayerId === layer.id}
                    onClick={() => state.selectLayer(layer.id)}
                    onDoubleClick={() => { state.selectLayer(layer.id); setRenameId(layer.id); }}>
                    <span>{layer.name}{layer.mask ? ' ◧' : ''}</span>
                    <small>{layer.type} · {Math.round(layer.opacity * 100)}%</small>
                  </button>
                )}
                <button type="button" title="Lock / unlock" aria-label={`Toggle lock for ${layer.name}`}
                  onClick={() => state.toggleLayer(layer.id, 'locked')}>
                  {layer.locked ? <Lock fontSize="small" /> : <LockOpen fontSize="small" />}
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={`fx-launcher ${fxOpen ? 'active' : ''}`}
            aria-expanded={fxOpen} aria-haspopup="dialog" aria-controls="huelith-fx-studio"
            onClick={() => {
              if (fxOpen) closeFx();
              else { setFxClosing(false); setFxOpen(true); }
            }}>
            <span className="fx-launcher-glyph"><AutoAwesome fontSize="small" /></span>
            <span className="fx-launcher-copy"><strong>Huelith FX</strong><small>Creativity · Effects · FX</small></span>
            <span className="fx-launcher-count">{active?.effects?.length ?? 0}</span>
            <span aria-hidden="true">{fxOpen ? '‹' : '›'}</span>
          </button>
          <div className="layer-buttons">
            <ActionIcon title="Add raster layer" onClick={() => state.addLayer('raster')}><Add /></ActionIcon>
            <ActionIcon title="Add vector layer" onClick={() => state.addLayer('vector')}><ShapeLine /></ActionIcon>
            <ActionIcon title="Duplicate layer" onClick={state.duplicateLayer}><ContentCopy /></ActionIcon>
            <ActionIcon title="Move layer up" onClick={() => {
              if (doc.activeLayerId) state.moveLayer(doc.activeLayerId, 1);
            }}><ArrowUpward /></ActionIcon>
            <ActionIcon title="Move layer down" onClick={() => {
              if (doc.activeLayerId) state.moveLayer(doc.activeLayerId, -1);
            }}><ArrowDownward /></ActionIcon>
            <ActionIcon title="Remove layer" disabled={doc.layers.length <= 1} onClick={state.removeLayer}><Delete /></ActionIcon>
          </div>
          <section className="properties-box">
            <div className="property-heading">Compositing</div>
            <div className="compact-property-row">
              <span>Blend mode</span>
              <FormControl size="small" sx={{ minWidth: 135 }}>
                <Select value={active?.blend ?? 'source-over'} disabled={!active || active.locked}
                  aria-label="Layer blend mode" onChange={event => active && state.setLayerBlend(active.id, event.target.value as BlendMode)}>
                  {blendOptions.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                </Select>
              </FormControl>
            </div>
            <CompactSlider label="Opacity" value={preview} min={0} max={100} display={`${preview}%`}
              onChange={value => setPreview(value)} />
            <Button size="small" disabled={!active || active.locked || preview === Math.round(active.opacity * 100)}
              onClick={() => active && state.setLayerOpacity(active.id, preview / 100)}>Apply opacity</Button>
            <div className="mask-actions">
              <Button size="small" disabled={!state.selection || !active || active.locked}
                onClick={() => active && state.applySelectionMask(active.id)}>Mask from selection</Button>
              <Button size="small" disabled={!active?.mask || active.locked}
                onClick={() => active && state.clearLayerMask(active.id)}>Remove mask</Button>
            </div>
          </section>
        </>
      )}

      {panel === 'properties' && (
        <div className="properties-box">
          <div className="property-heading">Document</div>
          <div className="property-line">Name <strong>{doc.name}</strong></div>
          <div className="property-line">Size <strong>{doc.width} × {doc.height} px</strong></div>
          <div className="property-line">Layers <strong>{flattenLayers(doc.layers).length}</strong></div>
          <div className="property-heading">{activeShape ? 'Vector object' : 'Selected layer'}</div>
          {active && !active.locked ? (
            <div className="number-grid">
              <InspectorNumber label="X" value={activeShape?.x ?? active.x} onChange={value => changeNumber('x', value)} />
              <InspectorNumber label="Y" value={activeShape?.y ?? active.y} onChange={value => changeNumber('y', value)} />
              {activeShape && (
                <>
                  <InspectorNumber label="Width" value={activeShape.width} onChange={value => changeNumber('width', value)} />
                  <InspectorNumber label="Height" value={activeShape.height} onChange={value => changeNumber('height', value)} />
                </>
              )}
              {(activeShape || active.type === 'raster') && (
                <InspectorNumber label="Rotation °" value={activeShape?.rotation ?? (active.type === 'raster' ? active.rotation ?? 0 : 0)}
                  onChange={value => changeNumber('rotation', value)} />
              )}
            </div>
          ) : <p className="small-note">Select an unlocked layer or vector object to edit its properties.</p>}
          {activeShape && (
            <Button size="small" startIcon={<Delete />} onClick={() => {
              state.removeShape(activeShape.id);
              state.selectShape(null);
            }}>Delete selected object</Button>
          )}
          {activeShape?.kind === 'text' && (
            <div className="text-properties">
              <div className="property-heading">Typography</div>
              {!state.textDraft && <TextContentEditor shape={activeShape} state={state} />}
              {state.textDraft && <p className="small-note">Typing on canvas. Ctrl+Enter saves; Esc cancels.</p>}
              <label>Font family
                <FontPicker value={state.textDraft?.fontFamily ?? activeShape.fontFamily ?? 'Arial'}
                  onChange={fontFamily => state.setTextFormat({ fontFamily })} />
              </label>
              <div className="number-grid">
                <InspectorNumber label="Font size" value={activeShape.fontSize ?? 48}
                  onChange={fontSize => state.setTextFormat({ fontSize })} />
                <InspectorNumber label="Line height" value={activeShape.lineHeight ?? 1.25}
                  onChange={lineHeight => state.setTextFormat({ lineHeight })} />
                <InspectorNumber label="Letter spacing" value={activeShape.letterSpacing ?? 0}
                  onChange={letterSpacing => state.setTextFormat({ letterSpacing })} />
              </div>
              <label>Weight
                <select value={activeShape.fontWeight ?? '400'}
                  onChange={event => state.setTextFormat({ fontWeight: event.target.value })}>
                  <option value="400">Regular</option><option value="700">Bold</option>
                  <option value="900">Black</option>
                </select>
              </label>
              <label>Style
                <select value={activeShape.fontStyle ?? 'normal'}
                  onChange={event => state.setTextFormat({ fontStyle: event.target.value as 'normal' | 'italic' })}>
                  <option value="normal">Normal</option><option value="italic">Italic</option>
                </select>
              </label>
              <label>Alignment
                <select value={activeShape.textAlign ?? 'left'}
                  onChange={event => state.setTextFormat({ textAlign: event.target.value as 'left' | 'center' | 'right' })}>
                  <option value="left">Left</option><option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <p className="small-note">Single click selects or drags text. Double click edits. Click empty canvas with Text to create.</p>
            </div>
          )}
          {activeShape && ['roundedRect', 'polygon', 'star', 'ring'].includes(activeShape.kind) && (
            <section className="parametric-properties" aria-label="Shape geometry">
              <div className="property-heading">Shape geometry</div>
              {(activeShape.kind === 'polygon' || activeShape.kind === 'star') && (
                <InspectorNumber label="Sides / points" value={activeShape.sides ?? (activeShape.kind === 'star' ? 5 : 6)}
                  onChange={value => state.updateShape(activeShape.id, shape => {
                    shape.sides = Math.max(3, Math.min(32, Math.round(value)));
                  })} />
              )}
              {(activeShape.kind === 'star' || activeShape.kind === 'ring') && (
                <InspectorNumber label="Inner radius %" value={Math.round((activeShape.innerRatio ?? 0.5) * 100)}
                  onChange={value => state.updateShape(activeShape.id, shape => {
                    shape.innerRatio = Math.max(0.05, Math.min(0.95, value / 100));
                  })} />
              )}
              {activeShape.kind === 'roundedRect' && (
                <InspectorNumber label="Corner radius" value={activeShape.cornerRadius ?? 16}
                  onChange={value => state.updateShape(activeShape.id, shape => {
                    shape.cornerRadius = Math.max(0, Math.min(2048, value));
                  })} />
              )}
            </section>
          )}
          {activeShape?.kind === 'line' && <p className="small-note">Press A to drag all four line/curve control points.</p>}
          {activeShape?.kind === 'path' && <p className="small-note">Press A to edit cubic Bézier anchors and handles.</p>}
        </div>
      )}

      {panel === 'history' && (
        <div className="properties-box">
          <div className="property-heading">Editing history</div>
          <div className="property-line">Undo steps <strong>{tab.past.length}</strong></div>
          <div className="property-line">Redo steps <strong>{tab.future.length}</strong></div>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" size="small" startIcon={<Undo />}
              onClick={state.undo} disabled={!tab.past.length}>Undo</Button>
            <Button variant="outlined" size="small" startIcon={<Redo />}
              onClick={state.redo} disabled={!tab.future.length}>Redo</Button>
          </Stack>
          <p className="small-note">History is capped at 40 steps and approximately 48 MiB of stored snapshots.</p>
        </div>
      )}
      {fxOpen && (
        <div className={fxClosing ? 'fx-host closing' : 'fx-host'}>
          <FxStudio state={state} active={active} activeShape={activeShape} onClose={closeFx} />
        </div>
      )}
    </aside>
  );
}

export default function App() {
  const state = useEditor();
  const theme = useMemo(() => makeTheme(state.workspace, state.appearanceMode), [state.workspace, state.appearanceMode]);
  const tab = activeTab(state);
  const doc = tab.doc;
  const [newOpen, setNewOpen] = useState(false);
  const [newAnimation, setNewAnimation] = useState(false);
  const [name, setName] = useState('Untitled artwork');
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(800);
  const [background, setBackground] = useState('#ffffff');
  const [menuAnchor, setMenuAnchor] = useState<{ element: HTMLElement; category: string } | null>(null);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [themeAnchor, setThemeAnchor] = useState<HTMLElement | null>(null);
  const [notice, setNotice] = useState('Ready to create');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    // Backend preferences are application-wide and never written to .huelith
    // documents. The existing FX editor remains the trusted renderer until the
    // exact kernels are individually migrated and validated in Aurora H.
    const initial = loadPreferences();
    void configureNativeCacheBudget(initial.memoryCacheMb).catch(console.warn);
    void configureNativeBackend(initial.gpuAcceleration).catch(console.warn);
    const onPreferences = (event: Event): void => {
      const preferences = (event as CustomEvent<{ gpuAcceleration: boolean; memoryCacheMb: number }>).detail;
      void configureNativeCacheBudget(preferences.memoryCacheMb).catch(console.warn);
      void configureNativeBackend(preferences.gpuAcceleration).catch(console.warn);
    };
    window.addEventListener(PREFERENCES_EVENT, onPreferences);
    return () => window.removeEventListener(PREFERENCES_EVENT, onPreferences);
  }, []);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('huelith-shortcuts') ?? localStorage.getItem('spectrum-shortcuts') ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });

  function handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    setNotice(`Error: ${message}`);
    setErrorText(message);
  }

  function guarded(operation: Promise<boolean>, message: string): void {
    void operation.then(completed => {
      if (completed) setNotice(message);
    }).catch(handleError);
  }

  useEffect(() => {
    const receivePaste = (event: ClipboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      const items = event.clipboardData?.items;
      const hasImage = Boolean(items && [...items].some(item => item.type.startsWith('image/')));
      const hasInternal = Boolean(event.clipboardData?.types.includes('application/x-huelith-object'));
      if (hasImage || hasInternal) {
        event.preventDefault();
        void handlePaste(event).then(ok => { if (ok) setNotice('Pasted as editable layer'); }).catch(handleError);
      } else if ('__TAURI_INTERNALS__' in window) {
        event.preventDefault();
        void pasteFromSystem().then(ok => {
          setNotice(ok ? 'Pasted image' : 'Clipboard has no supported image');
        }).catch(handleError);
      }
    };
    const receiveCopy = (event: ClipboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      event.preventDefault();
      void copySelected(event, event.type === 'cut').then(ok => {
        if (ok) setNotice(event.type === 'cut' ? 'Cut selection' : 'Copied selection');
      }).catch(handleError);
    };
    const drop = (event: DragEvent): void => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      const file = [...event.dataTransfer.files].find(item => item.type.startsWith('image/'));
      if (file) void insertImage(file, file.name).then(ok => { if (ok) setNotice('Image dropped onto canvas'); }).catch(handleError);
    };
    const dragOver = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('paste', receivePaste);
    window.addEventListener('copy', receiveCopy);
    window.addEventListener('cut', receiveCopy);
    window.addEventListener('drop', drop);
    window.addEventListener('dragover', dragOver);
    return () => {
      window.removeEventListener('paste', receivePaste);
      window.removeEventListener('copy', receiveCopy);
      window.removeEventListener('cut', receiveCopy);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragover', dragOver);
    };
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (document.querySelector('[role="dialog"]:not(#huelith-fx-studio), [role="menu"]')) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const current = useEditor.getState();

      if (modifier) {
        switch (key) {
          case 'n':
            event.preventDefault();
            setNewOpen(true);
            return;
          case 'o':
            event.preventDefault();
            guarded(openProject(), 'Project opened');
            return;
          case 's':
            event.preventDefault();
            guarded(saveProject(event.shiftKey), 'Project saved');
            return;
          case 'z':
            event.preventDefault();
            if (event.shiftKey) current.redo(); else current.undo();
            return;
          case 'y':
            event.preventDefault();
            current.redo();
            return;
          case 'v':
            // Paste events carry richer data than clipboard.read(). The browser fires one for Ctrl+V.
            return;
          case 'd':
            event.preventDefault();
            current.duplicateLayer();
            return;
          case 'a':
            event.preventDefault();
            current.setSelection(event.shiftKey ? null : {
              x: 0, y: 0, width: activeTab(current).doc.width, height: activeTab(current).doc.height,
            });
            return;
        }
        return;
      }

      if (key === 'tab' && target?.tagName === 'CANVAS') {
        event.preventDefault();
        current.setFocusMode(!current.focusMode);
      } else if (key === 'delete' && current.selectedShapeId) {
        current.removeShape(current.selectedShapeId);
        current.selectShape(null);
      } else if (key === 'escape') {
        current.selectShape(null);
        current.setSelection(null);
      } else {
        const found = tools.find(tool => (shortcuts[tool.id] || tool.shortcut).toLowerCase() === key);
        if (found) current.setTool(found.id);
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [shortcuts]);

  useEffect(() => {
    let mounted = true;
    void getRecovery().then(documents => {
      if (!mounted || documents.length === 0) return;
      // Recovery is non-modal: never interrupt startup with a blocked workspace.
      const current = useEditor.getState();
      if (current.tabs.length !== 1 || current.tabs[0].dirty || current.tabs[0].doc.name !== 'Welcome canvas') return;
      for (const recovered of documents) useEditor.getState().openDoc(recovered);
      // Remove the untouched starter canvas after restoring the real project tabs.
      useEditor.getState().closeDoc(current.tabs[0].doc.id);
      setNotice(`${documents.length} document(s) automatically recovered`);
    }).catch(() => {
      // Private browsing can block IndexedDB. Editing remains available.
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void storeRecovery(state.tabs.filter(item => item.dirty).map(item => item.doc)).catch(() => {
        setNotice('Recovery storage unavailable; save your project regularly.');
      });
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [state.tabs]);

  function create(): void {
    if (!validSize(width, height)) {
      handleError(new Error('Canvas must be 1–16384 pixels per side and at most 64 million pixels.'));
      return;
    }
    state.newDoc(name, width, height, background, newAnimation);
    setNewOpen(false);
    setNotice('New canvas created');
  }

  function runMenuCommand(id: MenuAction, anchor?: HTMLElement): void {
    setMenuAnchor(null);
    switch (id) {
      case 'new-document': setNewAnimation(false); setNewOpen(true); break;
      case 'new-animation': setNewAnimation(true); setNewOpen(true); break;
      case 'open': guarded(openProject(), 'Project opened'); break;
      case 'import': guarded(importImage(), 'Image imported'); break;
      case 'copy': guarded(copySelected(), 'Copied'); break;
      case 'paste': guarded(pasteFromSystem(), 'Image pasted'); break;
      case 'save': guarded(saveProject(), 'Project saved'); break;
      case 'save-as': guarded(saveProject(true), 'Project saved'); break;
      case 'export-png': guarded(exportImage('png'), 'PNG exported'); break;
      case 'export-svg': guarded(exportSvg(), 'SVG exported'); break;
      case 'export-apng': guarded(exportAnimation('apng'), 'Animation exported'); break;
      case 'export-sheet': guarded(exportAnimation('sheet'), 'Sprite sheet exported'); break;
      case 'export-frames': guarded(exportAnimation('sequence'), 'Animation frames exported'); break;
      case 'undo': state.undo(); break;
      case 'redo': state.redo(); break;
      case 'select-all': state.setSelection({ x: 0, y: 0, width: doc.width, height: doc.height }); break;
      case 'deselect': state.setSelection(null); break;
      case 'create-raster': state.addLayer('raster'); break;
      case 'create-vector': state.addLayer('vector'); break;
      case 'duplicate-layer': state.duplicateLayer(); break;
      case 'delete-layer': state.removeLayer(); break;
      case 'mask-selection': if (doc.activeLayerId) state.applySelectionMask(doc.activeLayerId); break;
      case 'clear-mask': if (doc.activeLayerId) state.clearLayerMask(doc.activeLayerId); break;
      case 'move': state.setTool('move'); break;
      case 'pen': state.setTool('pen'); break;
      case 'text': state.setTool('text'); break;
      case 'creative-lab': state.setCreativePanelOpen(true); break;
      case 'creative-colorSculptor': case 'creative-atmosphere': case 'creative-lightSculptor':
      case 'creative-materialForge': case 'creative-shockDesigner': case 'creative-livingInk':
      case 'creative-motionEcho': case 'creative-paletteFlow': case 'creative-sceneCards':
      case 'creative-timeSculptor': {
        const selected = CREATIVE_DEFINITIONS.find(item => `creative-${item.kind}` === id);
        if (selected) state.addCreative(selected.kind);
        break;
      }
      case 'fx':
        if (!state.inspectorOpen) state.setInspectorOpen(true);
        window.setTimeout(() => window.dispatchEvent(new Event('huelith-open-fx')), 0);
        break;
      case 'convert-animation': state.makeAnimation(); break;
      case 'previous-frame': if (doc.animation) state.setActiveFrame(Math.max(0, doc.animation.currentFrame - 1)); break;
      case 'next-frame': if (doc.animation) state.setActiveFrame(Math.min(doc.animation.frames.length - 1, doc.animation.currentFrame + 1)); break;
      case 'grid': state.setGrid(!state.grid); break;
      case 'focus': state.setFocusMode(!state.focusMode); break;
      case 'settings': setSettingsOpen(true); break;
      case 'theme': if (anchor) setThemeAnchor(anchor); break;
      case 'help': setNotice('Huelith 0.2 · Free and open source · Keyboard shortcuts in Preferences'); break;
    }
  }

  function menuDisabled(id: MenuAction): boolean {
    if (id.startsWith('export-') && ['export-apng', 'export-sheet', 'export-frames'].includes(id)) return !doc.animation;
    if (id === 'undo') return !tab.past.length;
    if (id === 'redo') return !tab.future.length;
    if (id === 'deselect' || id === 'mask-selection') return !state.selection;
    if (id === 'previous-frame' || id === 'next-frame') return !doc.animation;
    if (id === 'convert-animation') return Boolean(doc.animation);
    if (id === 'clear-mask') return !activeLayer(state)?.mask;
    return false;
  }

  return (
    <ThemeProvider theme={theme}>
      <div className={`app theme-${state.workspace} tone-${state.appearanceMode} ${state.focusMode ? 'focus-mode' : ''}`}>

        <header className="titlebar" data-tauri-drag-region>
          <div className="brand" data-tauri-drag-region>
            <div className="brand-mark">✦</div>
            <span>Huelith</span>
            <span className="badge">0.1</span>
          </div>
          <div className="title-actions">
            <nav className="huelith-command-bar" aria-label="Huelith commands">
              {Object.keys(MENUS).map(category => (
                <button type="button" className={`command-menu-trigger ${menuAnchor?.category === category ? 'active' : ''}`}
                  aria-expanded={menuAnchor?.category === category} key={category}
                  onClick={event => setMenuAnchor(previous => previous?.category === category
                    ? null : { category, element: event.currentTarget })}>{category}</button>
              ))}
            </nav>
            <span className="title-sep" />
            <ActionIcon title="Undo (Ctrl+Z)" onClick={state.undo} disabled={!tab.past.length}><Undo fontSize="small" /></ActionIcon>
            <ActionIcon title="Redo (Ctrl+Y)" onClick={state.redo} disabled={!tab.future.length}><Redo fontSize="small" /></ActionIcon>
            <Button variant="contained" size="small" startIcon={<Save />}
              onClick={() => guarded(saveProject(), 'Project saved')}>Save</Button>
            <Button size="small" startIcon={<Download />}
              onClick={event => setExportAnchor(event.currentTarget)}>Export</Button>
          </div>
          <div className="titlebar-drag-space" data-tauri-drag-region aria-hidden="true" />
          <div className="title-right">
            <span className="live-dot" />
            <span>Free & open source</span>
            <ActionIcon title="Toggle left tools" onClick={() => state.setToolsOpen(!state.toolsOpen)}><MenuIcon fontSize="small" /></ActionIcon>
            <ActionIcon title="Toggle inspector" onClick={() => state.setInspectorOpen(!state.inspectorOpen)}><ViewSidebar fontSize="small" /></ActionIcon>
            <ActionIcon title="Focus mode (Tab on canvas)" active={state.focusMode}
              onClick={() => state.setFocusMode(!state.focusMode)}><FlipToFront fontSize="small" /></ActionIcon>
            <ActionIcon title="Customize workspace and shortcuts" onClick={() => setSettingsOpen(true)}>
              <Settings fontSize="small" />
            </ActionIcon>
            <ActionIcon title="Choose appearance"  onClick={event => {
              setThemeAnchor(event.currentTarget);
            }}><Palette fontSize="small" /></ActionIcon>
            <ActionIcon title="Huelith Originals · Create and animate" onClick={() => state.setCreativePanelOpen(!state.creativePanelOpen)}>
              <AutoAwesome fontSize="small" />
            </ActionIcon>
            <WindowControls />
          </div>
        </header>

        <DocumentTabs state={state} openNew={() => setNewOpen(true)} />
        <div className="editor-grid">
          {state.toolsOpen && !state.focusMode && <ToolRail state={state} openNew={() => setNewOpen(true)} />}
          <main className="main-editor">
            <ContextToolbar state={state} />
            <div className="creative-canvas-region">
              <Canvas onError={handleError} />
              <CreativeLab />
            </div>
            {!state.focusMode && <AnimationTimeline />}
            <footer className="statusbar">
              <div><span className="status-led" />{notice}</div>
              <div>
                {doc.width} × {doc.height} px
                <span className="status-sep">|</span>{doc.layers.length} layers
                <span className="status-sep">|</span>{state.workspace} theme
                <span className="status-sep">|</span>Huelith 0.2
              </div>
            </footer>
          </main>
          {state.inspectorOpen && !state.focusMode && <Inspector state={state} />}
        </div>


        <AuroraSettings open={settingsOpen} onClose={() => setSettingsOpen(false)}
          shortcuts={shortcuts} setShortcuts={setShortcuts}
          shortcutTools={tools.filter(tool => !['roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring'].includes(tool.id))} />

        <Dialog open={newOpen} onClose={() => setNewOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>{newAnimation ? 'New animation' : 'New document'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField label="Document name" value={name} onChange={event => setName(event.target.value)} />
              <Stack direction="row" spacing={2}>
                <TextField label="Width (px)" type="number" value={width}
                  onChange={event => setWidth(Number(event.target.value))} />
                <TextField label="Height (px)" type="number" value={height}
                  onChange={event => setHeight(Number(event.target.value))} />
              </Stack>
              <label className="project-kind"><input aria-label="Create animation project" type="checkbox"
                checked={newAnimation} onChange={event => setNewAnimation(event.target.checked)} />
                Frame-by-frame animation project (timeline & onion skins)</label>
              <Typography variant="body2">Background</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant={background === '#ffffff' ? 'contained' : 'outlined'} size="small"
                  onClick={() => setBackground('#ffffff')}>White</Button>
                <Button variant={background === 'transparent' ? 'contained' : 'outlined'} size="small"
                  onClick={() => setBackground('transparent')}>Transparent</Button>
                <input aria-label="Custom background" title="Custom background" type="color"
                  value={background === 'transparent' ? '#ffffff' : background}
                  onChange={event => setBackground(event.target.value)} />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={create}>{newAnimation ? 'Create animation' : 'Create document'}</Button>
          </DialogActions>
        </Dialog>

        <Menu anchorEl={menuAnchor?.element ?? null} open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)} slotProps={{ paper: { className: `command-menu-popup theme-${state.workspace} tone-${state.appearanceMode}` } }}>
          {menuAnchor && MENUS[menuAnchor.category]?.map((section, index) => (
            <div key={section.heading}>
              {index > 0 && <Divider />}
              <ListSubheader className="command-menu-heading">{section.heading}</ListSubheader>
              {section.entries.map(entry => (
                <MenuItem className="command-menu-item" key={entry.id}
                  disabled={menuDisabled(entry.id)}
                  onClick={() => runMenuCommand(entry.id, menuAnchor.element)}>
                  <span>{entry.label}</span>
                  {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
                </MenuItem>
              ))}
            </div>
          ))}
        </Menu>

        <Snackbar open={Boolean(errorText)} autoHideDuration={7000} onClose={() => setErrorText(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert severity="error" variant="filled" onClose={() => setErrorText(null)}>{errorText}</Alert>
        </Snackbar>

        <Menu anchorEl={themeAnchor} open={Boolean(themeAnchor)} onClose={() => setThemeAnchor(null)}
          slotProps={{ paper: { className: `theme-menu-popup theme-${state.workspace} tone-${state.appearanceMode}` } }}>
          <div className="theme-menu-heading">Appearance <span>Choose a mood</span></div>
          <div className="theme-tone-switch" role="group" aria-label="Appearance brightness">
            <button type="button" className={state.appearanceMode === 'light' ? 'active' : ''}
              onClick={() => state.setAppearanceMode('light')}>☀ Light</button>
            <button type="button" className={state.appearanceMode === 'dark' ? 'active' : ''}
              onClick={() => state.setAppearanceMode('dark')}>☾ Dark</button>
          </div>
          <div className="theme-menu-subheading">COLORFUL COLLECTION</div>
          {([ 
            { id: 'strawberry', name: 'Strawberry', subtitle: 'Berry milk · fresh pink' },
            { id: 'melon', name: 'Melon', subtitle: 'Mint · airy · botanical' },
            { id: 'peach', name: 'Peach', subtitle: 'Warm coral · creamy' },
            { id: 'lemon', name: 'Lemon', subtitle: 'Citrus · bright · crisp' },
            { id: 'mango', name: 'Mango', subtitle: 'Golden · playful' },
            { id: 'sakura', name: 'Sakura', subtitle: 'Petals · pearl · delicate' },
            { id: 'blossom', name: 'Blossom', subtitle: 'Lavender · floral' },
            { id: 'shadow', name: 'Shadow', subtitle: 'Graphite · subdued' },
          ] as const).map(choice => (
            <MenuItem key={choice.id} selected={state.workspace === choice.id} onClick={() => {
              state.setWorkspace(choice.id);
              setThemeAnchor(null);
            }}>
              <span className={`theme-preview theme-preview-${choice.id}`} />
              <span className="theme-option"><strong>{choice.name}</strong><small>{choice.subtitle}</small></span>
              {state.workspace === choice.id && <span className="theme-tick">✓</span>}
            </MenuItem>
          ))}
          <div className="theme-menu-subheading">WORKSPACE ORIGINALS</div>
          {([
            { id: 'glass', name: 'Spectrum Glass', subtitle: 'Luminous translucent surfaces' },
            { id: 'material', name: 'Material You', subtitle: 'Soft material shapes' },
            { id: 'classic', name: 'Classic Desktop', subtitle: 'Dense traditional chrome' },
            { id: 'midnight', name: 'Spectrum Midnight', subtitle: 'Quiet darkroom' },
            { id: 'studio', name: 'Spectrum Studio', subtitle: 'Professional utility' },
          ] as const).map(choice => (
            <MenuItem key={choice.id} selected={state.workspace === choice.id} onClick={() => {
              state.setWorkspace(choice.id);
              setThemeAnchor(null);
            }}>
              <span className={`theme-preview theme-preview-${choice.id}`} />
              <span className="theme-option"><strong>{choice.name}</strong><small>{choice.subtitle}</small></span>
              {state.workspace === choice.id && <span className="theme-tick">✓</span>}
            </MenuItem>
          ))}
        </Menu>

        <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
          {(['png', 'jpeg', 'webp', 'svg'] as const).map(format => (
            <MenuItem key={format} onClick={() => {
              setExportAnchor(null);
              guarded(format === 'svg' ? exportSvg() : exportImage(format), `${format.toUpperCase()} exported`);
            }}>
              <Download sx={{ mr: 1, fontSize: 18 }} />{format.toUpperCase()}
            </MenuItem>
          ))}
        </Menu>
      </div>
    </ThemeProvider>
  );
}
