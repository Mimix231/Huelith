import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, IconButton, Slider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { GradientMode, GradientStop, VectorShape } from '../editor/types';
import { uid } from '../editor/types';
import { GRADIENT_MODES, gradientShapeCanvas } from '../editor/gradient';
import StudioColorPicker from './StudioColorPicker';
import './GradientControls.css';

const defaults: Partial<VectorShape> = {
  gradientTwist: 2, gradientRotation: 0, gradientRepeats: 1, gradientScale: 1,
  gradientCenterX: .5, gradientCenterY: .5, gradientSkewX: 0, gradientSkewY: 0,
  gradientWave: 0, gradientFrequency: 3, gradientOffset: 0,
  gradientPattern: 'smooth', gradientRayCount: 22, gradientRayWidth: .53,
  gradientRaySoftness: .015, gradientRayTaper: 0, gradientRayGlow: .3, gradientRaySeed: 11,
};
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const modes: Record<GradientMode, string> = {
  linear: 'Linear', radial: 'Radial', angular: 'Angular', reflected: 'Reflected',
  diamond: 'Diamond', spiral: 'Spiral', freeform: 'Freeform', mesh: 'Mesh',
};

/** A tool dialog rather than a shape-dropdown. Works before or after creating a gradient. */
export default function GradientControls({ shape, selectedMode, setMode, update, create, first, second, autoOpen = false, hideLauncher = false }: {
  shape?: VectorShape; selectedMode: GradientMode; setMode: (mode: GradientMode) => void;
  update: (changes: Partial<VectorShape>) => void;
  create?: (definition: Partial<VectorShape>) => void;
  first: string; second: string; autoOpen?: boolean; hideLauncher?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener('huelith:gradient-open', reopen);
    return () => window.removeEventListener('huelith:gradient-open', reopen);
  }, []);
  const [draft, setDraft] = useState<Partial<VectorShape>>(defaults);
  const activePoint = useRef<number | null>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const currentMode = shape?.gradientMode ?? draft.gradientMode ?? selectedMode;
  const parameters = shape ?? draft;
  const stops: GradientStop[] = parameters.gradientStops?.length ? parameters.gradientStops : [
    { id: 'a', position: 0, color: first, opacity: 1 },
    { id: 'b', position: 1, color: second, opacity: 1 },
  ];
  const points = parameters.gradientPoints?.length ? parameters.gradientPoints : [
    {x:0,y:0,color:first}, {x:1,y:0,color:second},
    {x:0,y:1,color:second}, {x:1,y:1,color:first},
  ];
  const patch = (changes: Partial<VectorShape>): void => {
    if (shape) update(changes);
    else setDraft(previous => ({...previous, ...changes}));
  };
  // Only draw a small PREVIEW at a reduced size. Saved gradients always render at full resolution.
  useEffect(() => {
    if (!open || !previewCanvas.current) return;
    const destination = previewCanvas.current;
    const frame = requestAnimationFrame(() => {
      const source = gradientShapeCanvas({
        ...(parameters as VectorShape), id:'preview', kind:'gradient', fill:'none', stroke:'none',
        strokeWidth:0, x:0,y:0,width:480,height:280, gradientMode:currentMode,
        gradientStops:stops, gradientPoints:points,
      });
      const ctx=destination.getContext('2d');
      if (ctx && source) { ctx.clearRect(0,0,destination.width,destination.height);ctx.drawImage(source,0,0); }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, shape, draft, currentMode, first, second]);
  const changeStop = (id: string, changes: Partial<GradientStop>) => patch({gradientStops:stops.map(item=>item.id === id ? {...item,...changes}:item)});
  const onPosition = (event: PointerEvent<HTMLDivElement>): void => {
    if (pointer.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x=clamp((event.clientX-bounds.left)/bounds.width), y=clamp((event.clientY-bounds.top)/bounds.height);
    if (activePoint.current !== null && (currentMode === 'mesh' || currentMode === 'freeform')) {
      patch({gradientPoints:points.map((point,index)=>index===activePoint.current?{...point,x,y}:point)});
    } else patch({gradientCenterX:x,gradientCenterY:y});
  };
  const numbers: {key: keyof VectorShape; label:string; min:number; max:number; step:number; initial:number}[] = [
    {key:'gradientRotation',label:'Rotation',min:0,max:360,step:1,initial:0},
    {key:'gradientTwist',label:'Spiral twist',min:-16,max:16,step:.1,initial:2},
    {key:'gradientRepeats',label:'Repeat count',min:1,max:32,step:1,initial:1},
    {key:'gradientScale',label:'Zoom',min:.1,max:4,step:.05,initial:1},
    {key:'gradientSkewX',label:'Horizontal shear',min:-100,max:100,step:1,initial:0},
    {key:'gradientSkewY',label:'Vertical shear',min:-100,max:100,step:1,initial:0},
    {key:'gradientWave',label:'Wave distortion',min:0,max:100,step:1,initial:0},
    {key:'gradientFrequency',label:'Wave frequency',min:.2,max:12,step:.1,initial:3},
    {key:'gradientOffset',label:'Color phase',min:-2,max:2,step:.01,initial:0},
  ];
  return <>
    {!hideLauncher && <Button size="small" variant="outlined" onClick={()=>setOpen(true)} aria-label="Open Gradient Studio">
      ◈ Gradient Studio{shape ? ' · Edit' : ''}
    </Button>}
    <Dialog open={open} onClose={()=>setOpen(false)} maxWidth="lg" fullWidth container={() => document.querySelector('.app') ?? document.body} PaperProps={{className:'huelith-gradient-dialog'}}>
      <DialogTitle className="gradient-studio-title">Gradient Studio <small>Design · shape · transform · save</small>
        <IconButton aria-label="Close Gradient Studio" onClick={()=>setOpen(false)}><CloseIcon/></IconButton>
      </DialogTitle>
      <DialogContent className="gradient-studio-body">
        <nav className="gradient-studio-modes" aria-label="Gradient families">
          {GRADIENT_MODES.map(mode=><button type="button" className={currentMode===mode?'active':''} key={mode}
            onClick={()=>{setMode(mode);patch({gradientMode:mode});}}>{modes[mode]}</button>)}
          <strong>Pattern toy box</strong>
          <button className={parameters.gradientPattern==='smooth'?'active':''} onClick={()=>patch({gradientPattern:'smooth'})}>Smooth gradient</button>
          <button className={parameters.gradientPattern==='sunburst'?'active':''} onClick={()=>patch({gradientPattern:'sunburst',gradientRayCount:20})}>Sunburst / twisted rays</button>
          <button className={parameters.gradientPattern==='speedlines'?'active':''} onClick={()=>patch({gradientPattern:'speedlines',gradientRayCount:110})}>Anime speed lines</button>
          <button onClick={()=>patch({...defaults,gradientPattern:'sunburst',gradientRayCount:14,gradientRayWidth:.46,gradientTwist:0,gradientStops:[{id:uid(),position:0,color:'#fff1b4',opacity:1},{id:uid(),position:1,color:'#ff9300',opacity:1}]})}>Orange poster burst</button>
          <button onClick={()=>patch({...defaults,gradientPattern:'speedlines',gradientRayCount:115,gradientRayWidth:.22,gradientRaySoftness:.05,gradientTwist:.55,gradientRayGlow:.8,gradientStops:[{id:uid(),position:0,color:'#5c06c5',opacity:1},{id:uid(),position:1,color:'#f2c6ff',opacity:1}]})}>Violet light speed</button>
          <strong>Quick starts</strong>
          <button onClick={()=>patch({...defaults,gradientTwist:3,gradientRepeats:5,gradientMode:'spiral'})}>Tight spiral</button>
          <button onClick={()=>patch({...defaults,gradientMode:'radial',gradientScale:.65})}>Soft spotlight</button>
          <button onClick={()=>patch({...defaults,gradientMode:'angular',gradientRepeats:6})}>Color wheel</button>
          <button onClick={()=>patch({...defaults,gradientMode:'linear',gradientWave:35})}>Liquid wave</button>
        </nav>
        <div className="gradient-studio-workspace">
          <div className="gradient-preview-header"><strong>Interactive preview</strong><span>Drag the center handle; drag color nodes in Freeform/Mesh.</span></div>
          <div className="gradient-preview-surface" onPointerDown={event=>{
            pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);
            if(currentMode==='freeform'||currentMode==='mesh'){
              const b=event.currentTarget.getBoundingClientRect();const x=clamp((event.clientX-b.left)/b.width),y=clamp((event.clientY-b.top)/b.height);
              const nearest=points.map((p,i)=>({i,d:Math.hypot(p.x-x,p.y-y)})).sort((a,b)=>a.d-b.d)[0];
              activePoint.current=nearest?.d<.08?nearest.i:null;
            }else activePoint.current=null;
            onPosition(event);
          }} onPointerMove={onPosition} onPointerUp={event=>{pointer.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}
            onPointerCancel={()=>{pointer.current=null;}}>
            <canvas ref={previewCanvas} width={480} height={280} aria-label="Live gradient preview" />
            {currentMode!=='mesh'&&currentMode!=='freeform'&&<span className="gradient-center-marker" style={{left:`${(parameters.gradientCenterX??.5)*100}%`,top:`${(parameters.gradientCenterY??.5)*100}%`}}/>}
            {(currentMode==='mesh'||currentMode==='freeform')&&points.map((point,i)=><span key={i} className="gradient-point-marker" style={{left:`${point.x*100}%`,top:`${point.y*100}%`,background:point.color}}/>)}
          </div>
          <div className="gradient-studio-coordinates">Center: {Math.round((parameters.gradientCenterX??.5)*100)}%, {Math.round((parameters.gradientCenterY??.5)*100)}% · Preview 480×280 · Final output uses document resolution</div>
          {(currentMode==='freeform'||currentMode==='mesh')&&<section className="gradient-edit-points"><strong>Editable color nodes</strong>
            {points.map((point,index)=><div key={index}><span>Node {index+1}</span><StudioColorPicker value={point.color} label={`Point ${index+1} color`} onChange={color=>patch({gradientPoints:points.map((p,i)=>i===index?{...p,color}:p)})}/>
              {currentMode==='freeform'&&<button onClick={()=>patch({gradientPoints:points.filter((_,i)=>i!==index)})} disabled={points.length<=2}>Remove</button>}</div>)}
            {currentMode==='freeform'&&<Button onClick={()=>patch({gradientPoints:[...points,{x:.5,y:.5,color:first}]})} disabled={points.length>=36}>+ Add node</Button>}
          </section>}
          {currentMode!=='mesh'&&currentMode!=='freeform'&&<section className="gradient-edit-stops"><strong>Color stops</strong>
            {stops.map(stop=><div key={stop.id} className="gradient-studio-stop"><StudioColorPicker value={stop.color} label="Stop color" onChange={color=>changeStop(stop.id,{color})}/>
              <input type="range" aria-label="Color stop position" min={0} max={100} value={Math.round(stop.position*100)} onChange={event=>changeStop(stop.id,{position:Number(event.target.value)/100})}/>
              <output>{Math.round(stop.position*100)}%</output><button title="Remove stop" disabled={stops.length<=2} onClick={()=>patch({gradientStops:stops.filter(item=>item.id!==stop.id)})}>×</button></div>)}
            <Button onClick={()=>patch({gradientStops:[...stops,{id:uid(),position:.5,color:first,opacity:1}].sort((a,b)=>a.position-b.position)})} disabled={stops.length>=32}>+ Add color stop</Button>
          </section>}
        </div>
        <aside className="gradient-studio-properties"><strong>Transformations</strong>
          {parameters.gradientPattern !== 'smooth' && <section className="gradient-ray-controls" aria-label="Radial burst styling">
            <strong>Pattern rays</strong>
            {([
              ['gradientRayCount','Ray count',2,300,1,22],
              ['gradientRayWidth','Band width',0,1,.01,.53],
              ['gradientRaySoftness','Edge softness',0,1,.01,.015],
              ['gradientRayTaper','Taper',0,1,.01,0],
              ['gradientRayGlow','Light streaks',0,1,.01,.3],
              ['gradientRaySeed','Variation seed',0,9999,1,11],
            ] as const).map(([key,label,min,max,step,initial])=><label key={key}>
              <span>{label} <output>{Number(parameters[key]??initial)}</output></span>
              <Slider size="small" min={min} max={max} step={step} value={Number(parameters[key]??initial)}
                onChange={(_,value)=>patch({[key]:value})}/>
            </label>)}
          </section>}
          {numbers.map(({key,label,min,max,step,initial})=><label key={key}><span>{label} <output>{String(parameters[key]??initial)}</output></span>
            <Slider size="small" min={min} max={max} step={step} value={Number(parameters[key]??initial)} onChange={(_,value)=>patch({[key]:value})}/></label>)}
          <label className="gradient-check"><input type="checkbox" checked={Boolean(parameters.gradientReverse)} onChange={event=>patch({gradientReverse:event.target.checked})}/>Reverse colors</label>
          <label className="gradient-check"><input type="checkbox" checked={Boolean(parameters.gradientMirror)} onChange={event=>patch({gradientMirror:event.target.checked})}/>Mirror progression</label>
          <Button variant="outlined" onClick={()=>patch(defaults)}>Reset transforms</Button>
        </aside>
      </DialogContent>
      <div className="gradient-studio-footer"><span>Non-destructive · Editable in the Layers panel</span>
        {!shape && <Button variant="contained" onClick={()=>{create?.({...draft, gradientMode:currentMode, gradientStops:stops,gradientPoints:points});setOpen(false);}}>Create gradient fill</Button>}
        <Button onClick={()=>setOpen(false)}>{shape?'Done':'Close'}</Button>
      </div>
    </Dialog>
  </>;
}
