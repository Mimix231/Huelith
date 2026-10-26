import { useState } from 'react';
import { Popover } from '@mui/material';
import { activeLayer, type EditorStore } from '../editor/store';
import { uid, type GradientMode, type GradientStop, type VectorShape } from '../editor/types';
import { GRADIENT_MODES } from '../editor/gradient';
import GradientTransformEditor from './GradientTransformEditor';
import StudioColorPicker from './StudioColorPicker';
import './GradientDesignerToolbar.css';

/** Compact top controls for fast drawing. Advanced transforms use an isolated
 * working copy in Gradient Atelier; Apply commits exactly one document action. */
export default function GradientDesignerToolbar({ state }: {state: EditorStore}) {
  const [stopsAnchor, setStopsAnchor] = useState<HTMLElement|null>(null);
  const [openEditor, setOpenEditor] = useState(false);
  const layer = activeLayer(state);
  const shape = layer?.type === 'gradient' ? layer.gradient
    : layer?.type === 'vector' ? layer.shapes.find(item => item.id === state.selectedShapeId && item.kind === 'gradient') : undefined;
  const settings = shape ?? state.gradientSettings;
  const stops: GradientStop[] = settings.gradientStops?.length ? settings.gradientStops : [
    {id:'first',position:0,color:state.color,opacity:state.opacity},
    {id:'last',position:1,color:state.backgroundColor,opacity:state.backgroundOpacity},
  ];
  const patch = (changes: Partial<VectorShape>) => {
    state.setGradientSettings(changes);
    if (layer?.type === 'gradient') state.updateGradientLayer(layer.id, target=>Object.assign(target,changes));
    else if (shape) state.updateShape(shape.id, target=>Object.assign(target,changes));
  };
  const patchStop = (id:string, changes:Partial<GradientStop>) => patch({gradientStops:stops.map(stop=>stop.id===id?{...stop,...changes}:stop)});
  const selectedMode = shape?.gradientMode ?? state.gradientMode;
  return <div className="contextbar huelith-gradient-strip" aria-label="Gradient designer controls">
    <div className="tool-label"><strong>◈ Gradient</strong></div><span className="gd-separator"/>
    <label>Type <select aria-label="Gradient type" value={selectedMode} onChange={event=>{
      const mode=event.target.value as GradientMode; state.setGradientMode(mode); if(shape) patch({gradientMode:mode});
    }}>{GRADIENT_MODES.map(mode=><option key={mode} value={mode}>{mode[0].toUpperCase()+mode.slice(1)}</option>)}</select></label>
    <StudioColorPicker value={stops[0].color} label="First gradient color" onChange={color=>patchStop(stops[0].id,{color})}/>
    <span className="gd-direction">→</span>
    <StudioColorPicker value={stops.at(-1)!.color} label="Last gradient color" onChange={color=>patchStop(stops.at(-1)!.id,{color})}/>
    <button className={stopsAnchor?'gd-active':''} onClick={event=>setStopsAnchor(event.currentTarget)}>● Stops ▾</button>
    <button className="huelith-gradient-atelier-btn" onClick={()=>setOpenEditor(true)} disabled={!shape}
      title={shape?'Open the dedicated Gradient Atelier':'Draw or select a Gradient layer first'}>✦ Transform in Atelier</button>
    <button title="Reverse gradient" onClick={()=>patch({gradientReverse:!settings.gradientReverse})}>⇄ Reverse</button>
    <span className="gd-help">Drag on canvas to create a Gradient layer</span>
    <div className="gd-zoom"><button onClick={()=>state.setZoom(state.zoom/1.2)} aria-label="Zoom out">−</button><span>{Math.round(state.zoom*100)}%</span><button onClick={()=>state.setZoom(state.zoom*1.2)} aria-label="Zoom in">+</button></div>
    <Popover open={Boolean(stopsAnchor)} anchorEl={stopsAnchor} onClose={()=>setStopsAnchor(null)} anchorOrigin={{vertical:'bottom',horizontal:'left'}}>
      <div className="gd-stops-panel" aria-label="Edit gradient stops"><div className="gd-panel-heading"><b>Color stops</b><button aria-label="Close gradient stops" onClick={()=>setStopsAnchor(null)}>×</button></div>
        {stops.map(stop=><div key={stop.id} className="gd-stop-row"><StudioColorPicker label="Stop color" value={stop.color} onChange={color=>patchStop(stop.id,{color})}/>
          <input type="range" min="0" max="100" aria-label="Stop position" value={Math.round(stop.position*100)} onChange={event=>patchStop(stop.id,{position:+event.target.value/100})}/>
          <output>{Math.round(stop.position*100)}%</output><button disabled={stops.length<=2} onClick={()=>patch({gradientStops:stops.filter(item=>item.id!==stop.id)})}>×</button></div>)}
        <button disabled={stops.length>=32} onClick={()=>patch({gradientStops:[...stops,{id:uid(),position:.5,color:state.color,opacity:1}].sort((a,b)=>a.position-b.position)})}>+ Add stop</button>
      </div>
    </Popover>
    {openEditor && shape && <GradientTransformEditor key={`${layer?.id ?? shape.id}-${shape.id}`} source={shape} name={layer?.name??'Gradient'} onClose={()=>setOpenEditor(false)}
      onApply={next=>{
        if(layer?.type==='gradient') state.updateGradientLayer(layer.id,shape=>Object.assign(shape,next));
        else state.updateShape(shape.id,target=>Object.assign(target,next));
        setOpenEditor(false);
      }}/>
    }
  </div>;
}
