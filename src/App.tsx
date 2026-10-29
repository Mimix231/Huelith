import { useEffect, useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Menu, MenuItem, Popover, ListSubheader, Divider, Slider, Stack, TextField, Tooltip, Typography, Select, FormControl, Snackbar, Alert,
} from '@mui/material';
import {
  Add, ArrowDownward, ArrowUpward, AutoAwesome, Brush, Close, Download, Edit,
  Colorize, ContentCopy, Create, Delete, Gradient, SwapHoriz, RestartAlt, Diamond, ChatBubbleOutline,
  FlipToFront, GridOn, History, Image, Layers,
  Lock, LockOpen, Menu as MenuIcon, Mouse, Palette, PanTool,
  RadioButtonUnchecked, Rectangle, Redo, Save, Settings, ShapeLine,
  TextFields, Undo, Visibility, VisibilityOff, ZoomIn, ZoomOut, HorizontalRule, CropFree, Tune, ViewSidebar, Gesture, AutoFixHigh, FormatColorFill, BlurOn, WbSunny, Whatshot, MovieFilter,
} from '@mui/icons-material';
import { activeLayer, activeTab, useEditor, type EditorStore } from './editor/store';
import { flattenLayers, validSize, type BlendMode, type Tool, type Workspace } from './editor/types';
import { scaleShape, shapeBounds, translateShape } from './editor/geometry';
import { exportImage, exportSvg, importImage, openProject, saveProject } from './editor/files';
import { getRecovery, storeRecovery } from './editor/recovery';
import { handlePaste, pasteFromSystem, copySelected, insertImage } from './editor/clipboard';
import FxStudio from './components/FxStudio';
import CutoutWorkspace from './components/CutoutWorkspace';
import './components/CutoutWorkspace.css';
import FontPicker from './components/FontPicker';
import WindowControls from './components/WindowControls';
import BufferedColorPicker from './components/BufferedColorPicker';
import StudioColorPicker from './components/StudioColorPicker';

function EraserGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M10 4 3.5 11.5a2.3 2.3 0 0 0 0 3.2L8.8 20h6.1L22 11.9a2 2 0 0 0 0-2.8l-4.5-5.1a2.1 2.1 0 0 0-3.1 0L10 4Z"/>
    <path d="m9 8 8.3 8.4M8.7 20H22"/>
  </svg>;
}
import GradientDesignerToolbar from './components/GradientDesignerToolbar';
import { reflowTextShape } from './editor/typography';
import type { AppearanceMode } from './editor/types';
import Canvas from './components/Canvas';
import MemeCreator from './components/MemeCreator';
import {applyMemeToDocument,type MemeCommit} from './editor/meme-creator';
import ActionWorkspace, {type ActionWorkspaceMode, type LayerTransform} from './components/ActionWorkspace';
import {alignLayer, rasterAssets, commitRasterize} from './editor/layer-actions';
import {prepareSelectionEdit,type SelectionAction} from './editor/selection-actions';
import {applyDocumentAction, prepareRasterAction, swapRasterSources, transparentTrimBounds, type DocumentAction, type ResampleMode} from './editor/document-actions';
import AnimationTimeline from './components/AnimationTimeline';
import CreativeLab from './components/CreativeLab';
import BrushStudio from './components/BrushStudio';
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
import './components/StudioColorPicker.css';
import './styles/wxy.css';
import './styles/theme-identities.css';
import './styles/workspace-modern.css';
import './styles/huelith-hybrid-shell.css';

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
  { id: 'ink', label: 'Ink Pen', icon: <Create />, shortcut: '' },
  { id: 'eraser', label: 'Eraser', icon: <EraserGlyph />, shortcut: 'E' },
  { id: 'pencil', label: 'Pixel pencil', icon: <Edit />, shortcut: 'N' },
  { id: 'eyedropper', label: 'Eyedropper', icon: <Colorize />, shortcut: 'I' },
  { id: 'magicWand', label: 'Magic Wand', icon: <AutoAwesome />, shortcut: '' },
  { id: 'lassoSelect', label: 'Freehand Lasso', icon: <Gesture />, shortcut: '' },
  { id: 'polySelect', label: 'Polygon Selection', icon: <CropFree />, shortcut: '' },
  { id: 'magneticLasso', label: 'Magnetic Lasso', icon: <AutoFixHigh />, shortcut: '' },
  { id: 'bucket', label: 'Paint Bucket', icon: <FormatColorFill />, shortcut: 'G' },
  { id: 'smudge', label: 'Smudge', icon: <BlurOn />, shortcut: '' },
  { id: 'blurBrush', label: 'Blur Brush', icon: <BlurOn />, shortcut: '' },
  { id: 'sharpenBrush', label: 'Sharpen Brush', icon: <AutoFixHigh />, shortcut: '' },
  { id: 'dodge', label: 'Dodge', icon: <WbSunny />, shortcut: '' },
  { id: 'burn', label: 'Burn', icon: <Whatshot />, shortcut: '' },
  { id: 'patternBrush', label: 'Pattern Brush', icon: <AutoAwesome />, shortcut: '' },
  { id: 'symmetryBrush', label: 'Symmetry Brush', icon: <Brush />, shortcut: '' },
  { id: 'rectangle', label: 'Rectangle', icon: <Rectangle />, shortcut: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: <RadioButtonUnchecked />, shortcut: 'O' },
  { id: 'roundedRect', label: 'Rounded rectangle', icon: <Rectangle />, shortcut: 'U' },
  { id: 'triangle', label: 'Triangle', icon: <ShapeLine />, shortcut: 'Y' },
  { id: 'polygon', label: 'Polygon', icon: <ShapeLine />, shortcut: 'G' },
  { id: 'star', label: 'Star', icon: <AutoAwesome />, shortcut: 'Q' },
  { id: 'arrow', label: 'Arrow', icon: <HorizontalRule />, shortcut: 'W' },
  { id: 'heart', label: 'Heart', icon: <AutoAwesome />, shortcut: 'J' },
  { id: 'ring', label: 'Ring', icon: <RadioButtonUnchecked />, shortcut: 'K' },
  { id: 'diamond', label: 'Diamond', icon: <Diamond />, shortcut: '' },
  { id: 'speechBubble', label: 'Speech bubble', icon: <ChatBubbleOutline />, shortcut: '' },
  { id: 'crescent', label: 'Crescent', icon: <RadioButtonUnchecked />, shortcut: '' },
  { id: 'cross', label: 'Cross', icon: <Add />, shortcut: '' },
  { id: 'gradient', label: 'Gradient', icon: <Gradient />, shortcut: 'Z' },
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
  const lightSurfaces:Record<string,[string,string]>={
    glass:['#f4f7ff','#ffffff'],material:['#f7f4fb','#ffffff'],classic:['#f5f5f5','#ffffff'],
    midnight:['#ebf0fa','#f7faff'],studio:['#f2f9f9','#ffffff'],
    strawberry:['#fff4f6','#fffafb'],melon:['#f1fff9','#fbfffd'],peach:['#fff6f1','#fffaf7'],
    lemon:['#fffdf0','#fffef9'],mango:['#fff7e8','#fffaf3'],sakura:['#fff8fc','#fffafd'],
    blossom:['#f8f4ff','#fdfbff'],shadow:['#f5f4fa','#fafaff'],
  };
  const darkSurfaces:Record<string,[string,string]>={
    glass:['#16192a','#24283a'],material:['#1c1a22','#292633'],classic:['#171b23','#292b33'],
    midnight:['#10182a','#1c2740'],studio:['#151c23','#222e36'],
    strawberry:['#291921','#3b2734'],melon:['#142922','#223c35'],peach:['#2b201e','#40302d'],
    lemon:['#292714','#3a3825'],mango:['#2c2118','#423022'],sakura:['#231829','#33233b'],
    blossom:['#241b34','#362841'],shadow:['#171721','#252431'],
  };
  const surfaces=(isLight?lightSurfaces:darkSurfaces)[workspace];
  return createTheme({
    palette: {
      mode: isLight ? 'light' : 'dark',
      primary: { main: primary },
      secondary: { main: isLight ? '#435d77' : '#a5bad4' },
      background: {
        default: surfaces?.[0] ?? (isLight ? '#faf9fc' : '#171924'),
        paper: surfaces?.[1] ?? (isLight ? '#ffffff' : '#242738'),
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

const SELECTION_TOOL_IDS=['marquee','magicWand','lassoSelect','polySelect','magneticLasso'] as const;
const RETOUCH_TOOL_IDS=['bucket','smudge','blurBrush','sharpenBrush','dodge','burn','patternBrush','symmetryBrush'] as const;
const ADDITIONAL_TOOL_IDS=[...SELECTION_TOOL_IDS,...RETOUCH_TOOL_IDS] as readonly string[];
const SHAPE_TOOL_IDS = ['rectangle', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'diamond', 'speechBubble', 'crescent', 'cross'] as const;

function ToolRail({ state, openNew }: { state: EditorStore; openNew: () => void }) {
  const [shapeAnchor, setShapeAnchor] = useState<HTMLElement | null>(null);
  const [shapeSearch, setShapeSearch] = useState('');
  const [selectionAnchor,setSelectionAnchor]=useState<HTMLElement|null>(null);
  const [retouchAnchor,setRetouchAnchor]=useState<HTMLElement|null>(null);
  const [lastShape, setLastShape] = useState<Tool>('rectangle');
  const shapeActive = SHAPE_TOOL_IDS.includes(state.tool as typeof SHAPE_TOOL_IDS[number]);
  return (
    <aside className="toolrail" aria-label="Editing tools">
      <div className="rail-heading">TOOLS</div>
      {tools.filter(tool => tools.indexOf(tool) <= 7 && tool.id !== 'rectangle' && !ADDITIONAL_TOOL_IDS.includes(tool.id) && !SHAPE_TOOL_IDS.includes(tool.id as typeof SHAPE_TOOL_IDS[number])).map(tool => (
        <ActionIcon
          key={tool.id}
          title={`${tool.label} (${tool.shortcut})`}
          active={tool.id === state.tool}
          onClick={() => {
            state.setTool(tool.id);
            if (tool.id !== 'node' && tool.id !== 'move' && tool.id !== 'text' && tool.id !== 'gradient') state.selectShape(null);
          }}
        >
          {tool.icon}
        </ActionIcon>
      ))}
      <ActionIcon title="Selection Studio — Magic Wand, Lasso, Polygon, Magnetic Lasso" active={SELECTION_TOOL_IDS.includes(state.tool as typeof SELECTION_TOOL_IDS[number])}
        onClick={event=>setSelectionAnchor(event.currentTarget)}><CropFree /></ActionIcon>
      <Popover open={Boolean(selectionAnchor)} anchorEl={selectionAnchor} onClose={()=>setSelectionAnchor(null)} anchorOrigin={{vertical:'center',horizontal:'right'}}
        slotProps={{paper:{className:'huelith-popup'}}}>
        <div className="h-tool-picker" aria-label="Huelith Selection Studio"><strong>✦ Selection Studio</strong><small>Choose how to isolate your artwork</small>
          {tools.filter(item=>SELECTION_TOOL_IDS.includes(item.id as typeof SELECTION_TOOL_IDS[number])).map(item=><button key={item.id} aria-pressed={state.tool===item.id}
            onClick={()=>{state.setTool(item.id);setSelectionAnchor(null);}}>{item.icon}<span>{item.label}</span></button>)}</div>
      </Popover>
      <ActionIcon title="Painting & Retouch Studio — Fill, Smudge, Blur, Sharpen, Dodge, Burn, Pattern" active={RETOUCH_TOOL_IDS.includes(state.tool as typeof RETOUCH_TOOL_IDS[number])}
        onClick={event=>setRetouchAnchor(event.currentTarget)}><AutoFixHigh /></ActionIcon>
      <Popover open={Boolean(retouchAnchor)} anchorEl={retouchAnchor} onClose={()=>setRetouchAnchor(null)} anchorOrigin={{vertical:'center',horizontal:'right'}}
        slotProps={{paper:{className:'huelith-popup'}}}>
        <div className="h-tool-picker" aria-label="Huelith Retouch Studio"><strong>◈ Painting & Retouch</strong><small>Independent, purpose-built pixel engines</small>
          {tools.filter(item=>RETOUCH_TOOL_IDS.includes(item.id as typeof RETOUCH_TOOL_IDS[number])).map(item=><button key={item.id} aria-pressed={state.tool===item.id}
            onClick={()=>{state.setTool(item.id);setRetouchAnchor(null);}}>{item.icon}<span>{item.label}</span></button>)}</div>
      </Popover>
      <ActionIcon title="Shapes — select a shape" active={shapeActive} onClick={event => setShapeAnchor(event.currentTarget)}>
        {tools.find(item => item.id === (shapeActive ? state.tool : lastShape))?.icon ?? <Rectangle />}
      </ActionIcon>
      <Popover open={Boolean(shapeAnchor)} anchorEl={shapeAnchor} onClose={() => { setShapeAnchor(null); setShapeSearch(''); }}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}>
        <div className="huelith-shape-menu" aria-label="Shape Studio">
          <input type="search" aria-label="Find shape" placeholder="Search shapes" value={shapeSearch}
            style={{ gridColumn: '1 / -1', width: '100%', boxSizing: 'border-box' }} onChange={event => setShapeSearch(event.target.value)}/>
          {tools.filter(item => SHAPE_TOOL_IDS.includes(item.id as typeof SHAPE_TOOL_IDS[number]) && item.label.toLowerCase().includes(shapeSearch.toLowerCase())).map(item =>
            <button type="button" key={item.id} aria-pressed={state.tool === item.id} onClick={() => {
              state.setTool(item.id); state.selectShape(null); setLastShape(item.id); setShapeAnchor(null); setShapeSearch('');
            }}>{item.icon}<span>{item.label}</span></button>)}
        </div>
      </Popover>
      {tools.filter(tool => tools.indexOf(tool) > 7 && tool.id !== 'rectangle' && !ADDITIONAL_TOOL_IDS.includes(tool.id) && !SHAPE_TOOL_IDS.includes(tool.id as typeof SHAPE_TOOL_IDS[number])).map(tool => (
        <ActionIcon
          key={tool.id}
          title={`${tool.label} (${tool.shortcut})`}
          active={tool.id === state.tool}
          onClick={() => {
            state.setTool(tool.id);
            if (tool.id !== 'node' && tool.id !== 'move' && tool.id !== 'text' && tool.id !== 'gradient') state.selectShape(null);
          }}
        >
          {tool.icon}
        </ActionIcon>
      ))}
      <div className="rail-spacer" />
      <div className="huelith-color-pair" aria-label="Foreground and background colors">
        <StudioColorPicker label="Foreground color" value={state.color} onChange={state.setColor} alpha={state.opacity} onAlpha={state.setOpacity}/>
        <StudioColorPicker label="Background color" value={state.backgroundColor} onChange={state.setBackgroundColor} alpha={state.backgroundOpacity} onAlpha={state.setBackgroundOpacity}/>
      </div>
      <div className="huelith-color-actions" aria-label="Color actions">
        <button type="button" aria-label="Swap foreground and background colors (X)" title="Swap colors (X)" onClick={state.swapColors}><SwapHoriz fontSize="small"/></button>
        <button type="button" aria-label="Reset colors to black and white (D)" title="Default colors (D)" onClick={state.resetColors}><RestartAlt fontSize="small"/></button>
      </div>
      <ActionIcon title="Toggle grid" active={state.grid} onClick={() => state.setGrid(!state.grid)}>
        <GridOn />
      </ActionIcon>
      <ActionIcon title="Show canvas rulers" active={state.rulers} onClick={() => state.setRulers(!state.rulers)}>
        <HorizontalRule />
      </ActionIcon>
      <ActionIcon title="Magnetic snapping: canvas edges, centers, other layers, and 10px grid (Alt overrides)" active={state.snap} onClick={() => state.setSnap(!state.snap)}>
        <CropFree />
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
  const [brushAnchor,setBrushAnchor]=useState<HTMLElement|null>(null);
  const entry = tools.find(item => item.id === state.tool);
  const drawing = ['brush','ink','eraser','pencil','smudge','blurBrush','sharpenBrush','dodge','burn','patternBrush','symmetryBrush'].includes(state.tool);
  const colorTool = ['brush', 'ink', 'pencil', 'bucket', 'patternBrush','symmetryBrush', 'gradient', 'rectangle', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'line', 'pen', 'freehand'].includes(state.tool);
  const shapeTool = ['diamond', 'speechBubble', 'crescent', 'cross', 'rectangle', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'line', 'pen', 'freehand'].includes(state.tool);
  const selectionTool = SELECTION_TOOL_IDS.includes(state.tool as typeof SELECTION_TOOL_IDS[number]);
  const selectedVector = activeLayer(state)?.type === 'vector' ? activeLayer(state) as Extract<ReturnType<typeof activeLayer>, {type:'vector'}> : undefined;
  const selectedPath = selectedVector?.shapes.find(item => item.id === state.selectedShapeId && item.kind === 'path');
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
            {tools.filter(option => ['rectangle', 'ellipse', 'roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring', 'diamond', 'speechBubble', 'crescent', 'cross', 'line', 'pen', 'freehand'].includes(option.id))
              .map(option => <option value={option.id} key={option.id}>{option.label}</option>)}
          </select>
        </label>
      )}
      {shapeTool && state.tool !== 'gradient' && (
        <label className="swatch-control">
          <span>Fill</span>
          <BufferedColorPicker value={state.fill} label="Fill color" onCommit={state.setFill} />
        </label>
      )}
      {(drawing || shapeTool) && (
        <CompactSlider label="Size" value={state.strokeWidth} min={1} max={drawing ? Math.max(250,state.strokeWidth) : 120}
          display={`${state.strokeWidth}px`} onChange={state.setStrokeWidth} />
      )}
      {drawing && state.tool !== 'pencil' && (
        <>
          {!['ink','smudge','blurBrush','sharpenBrush','dodge','burn','patternBrush'].includes(state.tool) && <CompactSlider label="Hardness" value={Math.round(state.hardness * 100)} min={2} max={100}
            display={`${Math.round(state.hardness * 100)}%`} onChange={value => state.setHardness(value / 100)} />}
          {!['smudge','blurBrush','sharpenBrush','dodge','burn','patternBrush'].includes(state.tool) &&
            <CompactSlider label="Smoothing" value={Math.round(state.smoothing * 100)} min={0} max={95}
              display={`${Math.round(state.smoothing * 100)}%`} onChange={value => state.setSmoothing(value / 100)} />}
          <CompactSlider label="Opacity" value={Math.round(state.opacity * 100)} min={1} max={100}
            display={`${Math.round(state.opacity * 100)}%`} onChange={value => state.setOpacity(value / 100)} />
        </>
      )}
      {(state.tool==='brush'||state.tool==='ink'||state.tool==='eraser') && <>
        <button type="button" className="h-brush-atelier-trigger" onClick={e=>setBrushAnchor(e.currentTarget)}
          aria-label="Open Brush Atelier">✦ Brush Atelier</button>
        <Popover open={Boolean(brushAnchor)} anchorEl={brushAnchor} onClose={()=>setBrushAnchor(null)}
          anchorOrigin={{vertical:'bottom',horizontal:'left'}} slotProps={{paper:{className:'huelith-popup'}}}>
          <BrushStudio state={state} onClose={()=>setBrushAnchor(null)}/>
        </Popover>
      </>}
      {state.tool === 'pencil' && <span className="context-instruction">Pixel-perfect hard-edge pencil · uses foreground color</span>}
      {(drawing && !['smudge','blurBrush','sharpenBrush','dodge','burn','patternBrush'].includes(state.tool)) && <label className="context-instruction" title="Mirror paint strokes around the vertical canvas center">
        <input type="checkbox" checked={state.symmetryX} onChange={event => state.setSymmetryX(event.target.checked)}/> Mirror X
      </label>}
      {(['magicWand','bucket'].includes(state.tool)) && <>
        <CompactSlider label="Tolerance" value={state.rasterToolTolerance} min={0} max={100} display={`${state.rasterToolTolerance}%`} onChange={state.setRasterToolTolerance}/>
        <label className="context-instruction"><input type="checkbox" checked={state.rasterToolContiguous} onChange={event=>state.setRasterToolContiguous(event.target.checked)}/> Contiguous</label>
      </>}
      {(['smudge','blurBrush','sharpenBrush','dodge','burn','patternBrush'].includes(state.tool)) &&
        <CompactSlider label="Strength" value={Math.round(state.rasterToolStrength*100)} min={1} max={100}
          display={`${Math.round(state.rasterToolStrength*100)}%`} onChange={value=>state.setRasterToolStrength(value/100)}/>}
      {state.tool==='patternBrush'&&<label className="context-instruction">Pattern <select value={state.rasterPattern}
        onChange={event=>state.setRasterPattern(event.target.value as 'star'|'dots'|'hatches')}>
        <option value="star">Stars</option><option value="dots">Dots</option><option value="hatches">Hatches</option>
      </select></label>}
      {state.tool==='symmetryBrush'&&<span className="context-instruction">Mirrored drawing about the canvas center</span>}
      {selectionTool && (
        <>
          <span className="context-instruction">{state.tool==='magicWand'?'Click a color to select matching regions':
            state.tool==='polySelect'?'Click vertices; double-click or Enter to complete':
            state.tool==='magneticLasso'?'Drag along object edges':
            state.tool==='lassoSelect'?'Draw an irregular closed selection':'Drag to select an area'}</span>
          <Button size="small" disabled={!state.selection} onClick={() => state.setSelection(null)}>Deselect</Button>
        </>
      )}
      {moveTool && (
        <span className="context-instruction">
          {state.tool === 'node' ? 'Drag anchor points and curve handles' : 'Drag objects or use resize / rotate handles'}
        </span>
      )}
      {state.tool === 'node' && selectedPath?.nodes?.length && <div className="huelith-node-controls" aria-label="Path node editing">
        <span>Node</span>
        {(['corner', 'smooth', 'symmetric'] as const).map(mode => <Button key={mode} size="small"
          disabled={state.selectedNodeIndex === null} variant={selectedPath.nodes?.[state.selectedNodeIndex ?? -1]?.nodeMode === mode ? 'contained' : 'text'}
          onClick={() => state.updateShape(selectedPath.id, shape => {
            const node = shape.nodes?.[state.selectedNodeIndex ?? -1]; if (!node) return;
            node.nodeMode = mode;
            if (mode === 'corner') { delete node.in; delete node.out; }
            else {
              const old = node.out ?? node.in ?? {x:node.x+16,y:node.y};
              const dx = (old.x-node.x)||16, dy = old.y-node.y;
              node.in = {x:node.x-dx,y:node.y-dy}; node.out = {x:node.x+dx,y:node.y+dy};
            }
          })}>{mode}</Button>)}
        <Button size="small" disabled={state.selectedNodeIndex === null || (selectedPath.nodes?.length ?? 0) <= 2}
          onClick={() => { state.updateShape(selectedPath.id, shape => { shape.nodes?.splice(state.selectedNodeIndex ?? -1, 1); }); state.selectNode(null); }}>Delete point</Button>
        <span className="context-instruction">Double-click a segment to insert a point</span>
      </div>}
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

type InspectorPanel = 'layers' | 'inspector' | 'history';

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
  const [cutoutOpen, setCutoutOpen] = useState(false);
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
  const layers: Array<{ layer: import('./editor/types').Layer; depth: number }> = [];
  const collectLayers = (items: import('./editor/types').Layer[], depth = 0): void => {
    for (const layer of [...items].reverse()) {
      layers.push({ layer, depth });
      if (layer.type === 'group') collectLayers(layer.children, depth + 1);
    }
  };
  collectLayers(doc.layers);

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
        {(['layers', 'inspector', 'history'] as const).map(key => (
          <button type="button" className={panel === key ? 'active' : ''} key={key}
            aria-pressed={panel === key} onClick={() => setPanel(key)}>
            {key === 'layers' ? <Layers /> : key === 'inspector' ? <Settings /> : <History />}
            {key}
          </button>
        ))}
      </div>

      {panel === 'layers' && (
        <>
          <div className="panel-title"><span>Layers</span><span>{doc.layers.length}</span></div>
          <div className="layer-list">
            {layers.map(({ layer, depth }) => (
              <div style={{ paddingLeft: depth ? Math.min(24, depth * 12) : undefined }} className={`layer-row ${doc.activeLayerId === layer.id ? 'active' : ''}`} key={layer.id}>
                <button type="button" title={layer.visible ? 'Hide layer' : 'Show layer'}
                  aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                  onClick={() => state.toggleLayer(layer.id, 'visible')}>
                  {layer.visible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                </button>
                <div className={`layer-thumb ${layer.type}`}>
                  {layer.type === 'gradient' ? <span className="huelith-layer-gradient-icon">◈</span> : layer.type === 'vector' ? <ShapeLine /> : <Image />}
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
                    <span>{layer.name}{layer.mask ? ' ◧' : ''}{layer.clipToBelow ? ' ↳' : ''}{layer.adjustment ? ' ◈' : ''}</span>
                    <small>{layer.type === 'group' ? `group · ${layer.children.length} layers` : layer.type} · {Math.round(layer.opacity * 100)}%</small>
                  </button>
                )}
                <button type="button" title="Lock / unlock" aria-label={`Toggle lock for ${layer.name}`}
                  onClick={() => state.toggleLayer(layer.id, 'locked')}>
                  {layer.locked ? <Lock fontSize="small" /> : <LockOpen fontSize="small" />}
                </button>
              </div>
            ))}
          </div>
          <div className="huelith-layer-actions" aria-label="Layer organization">
            <button type="button" onClick={state.addAdjustmentLayer} title="Add a non-destructive color adjustment above the selected layer">+ Adjust</button>
            <button type="button" onClick={state.groupSelectedLayer} disabled={!active || active.locked} title="Group selected layer while preserving editable contents">Group</button>
            <button type="button" onClick={state.ungroupSelectedLayer} disabled={active?.type !== 'group'} title="Release the layers inside this group">Ungroup</button>
            <button type="button" onClick={() => active && state.setClipToBelow(active.id, !active.clipToBelow)}
              disabled={!active || doc.layers.findIndex(layer => layer.id === active.id) < 1}
              aria-pressed={active?.clipToBelow ?? false} title="Clip the active layer to the opacity of the layer immediately below">{active?.clipToBelow ? 'Unclip' : 'Clip below'}</button>
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

      {panel === 'inspector' && (
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
          {active?.type === 'raster' && <section className="huelith-inspector-cutout" aria-label="Image cutout controls">
            <strong>Image operations</strong>
            <span>Original image: {active.imageWidth ?? 'native'} × {active.imageHeight ?? 'native'}</span>
            <button type="button" disabled={active.locked || !active.image}
              onClick={() => setCutoutOpen(true)}>{active.cutoutMask ? 'Edit Cutout Mask' : 'Remove Background'}</button>
            {active.cutoutMask && <>
              <label><input type="checkbox" checked={active.cutoutMask.enabled}
                onChange={() => state.toggleCutoutMask(active.id)}/> Show cutout mask</label>
              <button type="button" disabled={active.locked} onClick={() => state.removeCutoutMask(active.id)}>Delete cutout mask</button>
              <small>Stored separately. Your image pixels are unchanged.</small>
            </>}
          </section>}
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

      {cutoutOpen && active?.type === 'raster' && <CutoutWorkspace key={active.id} layer={active}
        onClose={() => setCutoutOpen(false)}
        onProcess={(data, width, height, editable) => {
          state.applyCutoutMask(active.id, data, width, height, editable);
          setCutoutOpen(false);
        }} />}

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
  const [actionMode, setActionMode] = useState<ActionWorkspaceMode|null>(null);
  const [memeOpen,setMemeOpen] = useState(false);
  const [actionBusy,setActionBusy]=useState(false);
  const [canvasMenu,setCanvasMenu]=useState<{x:number;y:number}|null>(null);
  useEffect(()=>{
    const context=(event:Event)=>{const point=(event as CustomEvent<{x:number;y:number}>).detail;setCanvasMenu(point);};
    const hide=()=>setCanvasMenu(null);
    const openTransform=()=>setActionMode('transform');
    window.addEventListener('huelith-canvas-context',context);window.addEventListener('keydown',hide);
    window.addEventListener('huelith-precision-transform',openTransform);
    return()=>{window.removeEventListener('huelith-canvas-context',context);window.removeEventListener('keydown',hide);
      window.removeEventListener('huelith-precision-transform',openTransform);};
  },[]);
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
          case 't':
            event.preventDefault();
            if(event.altKey){setActionMode('transform');return;}
            // Ctrl+T selects the complete active layer for on-canvas handles.
            // Numeric transform remains available via Ctrl+Alt+T or by
            // double-clicking the transform dimensions chip.
            current.setTool('move');
            current.selectShape(null);
            current.setSelection(null);
            return;
          case 'i':
            if(event.altKey){event.preventDefault();setActionMode('resize-image');return;}break;
          case 'c':
            if(event.altKey){event.preventDefault();setActionMode('resize-canvas');return;}break;
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
      } else if (key === 'x') {
        event.preventDefault(); current.swapColors();
      } else if (key === 'd') {
        event.preventDefault(); current.resetColors();
      } else if (key === 'delete' && current.selectedShapeId) {
        current.removeShape(current.selectedShapeId);
        current.selectShape(null);
      } else if (key === 'escape') {
        current.selectShape(null);
        current.setSelection(null);
      } else {
        const found = tools.find(tool => Boolean(shortcuts[tool.id] || tool.shortcut) && (shortcuts[tool.id] || tool.shortcut).toLowerCase() === key);
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

  async function commitDocumentAction(action:DocumentAction, resampling:ResampleMode='smooth'):Promise<void>{
    if(actionBusy)return;
    const editor=useEditor.getState();const original=activeTab(editor);const expectedDoc=original.doc.id;
    const expectedRevision=original.revision;
    setActionBusy(true);
    try{
      // All decoding/resampling finishes BEFORE the history transaction. Any edits
      // made while images are processing invalidate the operation rather than
      // overwriting newer pixels.
      const oldW=original.doc.width,oldH=original.doc.height;
      const pixels=await prepareRasterAction(original.doc,action,resampling);
      const latest=activeTab(useEditor.getState());
      if(latest.doc.id!==expectedDoc||latest.revision!==expectedRevision)throw Error('Document changed while preparing the operation. Please try again.');
      useEditor.getState().mutate(document=>{
        applyDocumentAction(document,action);
        swapRasterSources(document,pixels,action,oldW,oldH);
      });
      useEditor.getState().setSelection(null);
      setActionMode(null);
      setNotice(`${action.kind.replaceAll('-',' ')} applied · all animation frames updated`);
    }catch(error){handleError(error);}finally{setActionBusy(false);}
  }

  async function trimDocument():Promise<void>{
    if(actionBusy)return;
    const editor=useEditor.getState(),tab=activeTab(editor);setActionBusy(true);
    try{
      const bounds=await transparentTrimBounds(tab.doc);
      if(!bounds){setNotice('Artwork is empty; nothing to trim');return;}
      const now=activeTab(useEditor.getState());
      if(now.doc.id!==tab.doc.id||now.revision!==tab.revision)throw Error('Document changed while analyzing transparency.');
      useEditor.getState().mutate(doc=>applyDocumentAction(doc,{kind:'crop',rect:bounds}));
      useEditor.getState().setSelection(null);
      setNotice('Transparent margins trimmed');
    }catch(error){handleError(error);}finally{setActionBusy(false);}
  }

  async function commitSelectionPixels(action:SelectionAction):Promise<void>{
    const editor=useEditor.getState(),tab=activeTab(editor),layer=activeLayer(editor),selection=editor.selection;
    if(!layer||layer.type!=='raster'||layer.locked||!selection){handleError('Select an unlocked raster layer and make a rectangular selection.');return;}
    if(actionBusy)return;setActionBusy(true);
    try{
      const pixels=await prepareSelectionEdit(layer,selection,action,editor.color,editor.strokeWidth,tab.doc.width,tab.doc.height,tab.doc.id);
      const latest=activeTab(useEditor.getState());
      if(latest.doc.id!==tab.doc.id||latest.revision!==tab.revision)throw Error('Document changed while preparing the selection edit.');
      editor.mutate(document=>{
        const target=document.layers.find(item=>item.id===layer.id);
        if(target?.type==='raster'&&!target.locked){target.image=pixels.image;target.imageWidth=pixels.width;target.imageHeight=pixels.height;}
      });
      setNotice(`${action==='clear'?'Cleared':action==='fill'?'Filled':'Outlined'} selected pixels`);
    }catch(error){handleError(error);}finally{setActionBusy(false);}
  }

  function rasterizeSelectedLayer():void{
    const editor=useEditor.getState(),tab=activeTab(editor),layer=activeLayer(editor);
    if(!layer||layer.locked||layer.type==='raster'||layer.type==='group'){handleError('Choose an unlocked Vector or Gradient layer.');return;}
    try{
      const prepared=rasterAssets(tab.doc,layer.id);
      editor.mutate(document=>commitRasterize(document,layer.id,prepared));
      editor.selectShape(null);setNotice(`${layer.name} rasterized · effects preserved`);
    }catch(error){handleError(error);}
  }

  function applyPreciseTransform(value:LayerTransform):void{
    const selected=activeLayer(useEditor.getState());
    if(!selected||selected.locked){handleError('Select an unlocked raster, gradient, or single-shape vector layer.');return;}
    const activeShapeId=useEditor.getState().selectedShapeId;
    useEditor.getState().mutate(doc=>{
      const target=doc.layers.find(item=>item.id===selected.id);
      if(!target||target.locked)return;
      if(target.type==='raster'){
        target.x=value.x;target.y=value.y;
        target.scaleX=value.width/Math.max(1,target.imageWidth??doc.width);
        target.scaleY=value.height/Math.max(1,target.imageHeight??doc.height);
        target.rotation=value.rotation;
      }else if(target.type==='gradient'){
        target.x=value.x;target.y=value.y;target.gradient.x=0;target.gradient.y=0;
        target.gradient.width=value.width;target.gradient.height=value.height;target.gradient.rotation=value.rotation;
        if(doc.animation?.trackGradients)doc.animation.trackGradients[target.id]=structuredClone(target.gradient);
      }else if(target.type==='vector'){
        const shape=target.shapes.find(item=>item.id===activeShapeId)??(target.shapes.length===1?target.shapes[0]:null);
        if(!shape) return;
        const before={x:shape.x,y:shape.y,width:shape.width,height:shape.height};
        scaleShape(shape,before,{x:value.x-target.x,y:value.y-target.y,width:value.width,height:value.height});
        shape.rotation=value.rotation;
      }
    });
    setActionMode(null);setNotice('Precision transform applied');
  }

  function createMeme(request:MemeCommit):void {
    try{
      const editor=useEditor.getState();
      editor.mutate(document=>{applyMemeToDocument(document,request);});
      editor.setTool('move');editor.selectShape(null);setMemeOpen(false);
      setNotice('Editable meme created · Move captions or double-click to edit');
    }catch(error){handleError(error);}
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
      case 'create-meme':setMemeOpen(true);break;
      case 'export-meme-png':guarded(exportImage('png'),'Meme PNG exported');break;
      case 'export-meme-jpeg':guarded(exportImage('jpeg'),'Meme JPEG exported');break;
      case 'export-meme-webp':guarded(exportImage('webp'),'Meme WebP exported');break;
      case 'resize-image': setActionMode('resize-image');break;
      case 'resize-canvas': setActionMode('resize-canvas');break;
      case 'crop-selection': if(state.selection)void commitDocumentAction({kind:'crop',rect:state.selection});else setActionMode('crop');break;
      case 'trim-transparent': void trimDocument();break;
      case 'precision-transform':state.setTool('move');setActionMode('transform');break;
      case 'rasterize-layer':rasterizeSelectedLayer();break;
      case 'fill-selection':void commitSelectionPixels('fill');break;
      case 'stroke-selection':void commitSelectionPixels('stroke');break;
      case 'clear-selection':void commitSelectionPixels('clear');break;
      case 'align-horizontal':case 'align-vertical':case 'fit-layer':{
        const layer=activeLayer(useEditor.getState());if(layer)useEditor.getState().mutate(document=>alignLayer(document,layer.id,
          id==='align-horizontal'?'center-horizontal':id==='align-vertical'?'center-vertical':'fit-to-canvas'));break;}

      case 'rotate-cw': case 'rotate-ccw': case 'rotate-180':
      case 'flip-horizontal': case 'flip-vertical':void commitDocumentAction({kind:id});break;
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
    if (id === 'precision-transform') {const layer=activeLayer(state);return !layer || layer.locked || layer.type==='group' || (layer.type==='vector'&&layer.shapes.length!==1&&!state.selectedShapeId);}
    if (id === 'trim-transparent') return doc.background !== 'transparent' || actionBusy;
    if (id === 'rasterize-layer') {const layer=activeLayer(state);return !layer||layer.locked||layer.type==='raster'||layer.type==='group';}
    if(['fill-selection','stroke-selection','clear-selection'].includes(id)){const layer=activeLayer(state);return !state.selection||!layer||layer.locked||layer.type!=='raster';}
    if (['align-horizontal','align-vertical','fit-layer'].includes(id)) {const layer=activeLayer(state);return !layer||layer.locked||layer.type==='group';}
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
            <div className="brand-mark" aria-label={`${state.workspace} theme emblem`}><span className="brand-mark__glyph" aria-hidden="true">{({sakura:"❀",blossom:"✿",strawberry:"♥",melon:"◈",peach:"✦",lemon:"☼",mango:"✺",shadow:"◐",midnight:"☾",material:"◆",classic:"▦",studio:"▥",glass:"✧"} as Record<string,string>)[state.workspace]??"✦"}</span></div>
            <span>Huelith</span>
            <span className="badge">0.2</span>
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
            <button type="button" className="huelith-create-launcher" onClick={() => setMemeOpen(true)}
              aria-label="Open Huelith Meme Creator" title="Open Meme Creator">
              <MovieFilter aria-hidden="true" fontSize="small"/><span>Meme Creator</span><span className="huelith-create-key">✦</span>
            </button>
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
            {(state.tool === 'gradient' || (() => { const layer = activeLayer(state); return layer?.type === 'gradient' || layer?.type === 'vector' && layer.shapes.some(shape => shape.kind === 'gradient' && shape.id === state.selectedShapeId); })())
              ? <GradientDesignerToolbar state={state} /> : <ContextToolbar state={state} />}
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

        {memeOpen&&<MemeCreator key={doc.id} doc={doc} onClose={()=>setMemeOpen(false)} onApply={createMeme}/>}
        {actionMode&&<ActionWorkspace key={`${actionMode}-${doc.id}`} mode={actionMode} doc={doc}
          layer={activeLayer(state) ?? null} selectedShapeId={state.selectedShapeId} selection={state.selection} busy={actionBusy}
          onClose={()=>{if(!actionBusy)setActionMode(null);}}
          onDocument={(action,resample)=>{void commitDocumentAction(action,resample);}}
          onTransform={applyPreciseTransform}/>}
        {canvasMenu&&<><div style={{position:'fixed',inset:0,zIndex:2349}} onClick={()=>setCanvasMenu(null)}
          onContextMenu={event=>{event.preventDefault();setCanvasMenu(null);}}/>
          <section className="h-canvas-menu" role="menu" aria-label="Huelith canvas actions"
            style={{left:Math.min(canvasMenu.x,window.innerWidth-260),top:Math.max(8,Math.min(canvasMenu.y,window.innerHeight-440))}}>
            <header>✦ HUELITH · CANVAS ACTIONS</header>
            {([['precision-transform','Precision transform','Ctrl+Alt+T'],['resize-image','Resize image',''],
              ['resize-canvas','Resize canvas',''],['crop-selection','Crop to selection',''],
              ['rotate-cw','Rotate clockwise',''],['flip-horizontal','Flip horizontal',''],
              ['rasterize-layer','Rasterize layer',''],['align-horizontal','Center horizontally',''],['align-vertical','Center vertically',''],
              ['fill-selection','Fill selection',''],['stroke-selection','Stroke selection',''],['clear-selection','Clear selected pixels','']] as const).map(([id,label,shortcut])=><button
                key={id} role="menuitem" type="button" disabled={menuDisabled(id)} onClick={()=>{setCanvasMenu(null);runMenuCommand(id);}}>
                <span>{label}</span><kbd>{shortcut}</kbd></button>)}
            <hr/><button role="menuitem" type="button" onClick={()=>{setCanvasMenu(null);state.undo();}}>↶ Undo <kbd>Ctrl+Z</kbd></button>
          </section></>}
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

// Brush Atelier uses the active Huelith accent and surface tokens.
