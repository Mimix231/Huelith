import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { RasterLayer } from '../editor/types';
import './CutoutWorkspace.css';

type MaskTool = 'keep' | 'remove' | 'eraser' | 'line' | 'lasso' | 'polygon' | 'rectangle' | 'ellipse' | 'hand';
type MaskView = 'original' | 'mask' | 'preview';
type P = { x: number; y: number };
type Command = { tool: MaskTool | 'clear'; operation: 'keep' | 'remove'; size: number; points: P[] };
const TOOLS: ReadonlyArray<[MaskTool, string, string]> = [
  ['keep','✎','Keep brush'], ['remove','⊖','Remove brush'], ['eraser','⌫','Erase selection'],
  ['line','╱','Line'], ['lasso','〰','Freehand lasso'], ['polygon','⬠','Polygon lasso'],
  ['rectangle','▭','Rectangle'], ['ellipse','◯','Ellipse'], ['hand','✋','Pan'],
];
const constrain = (n: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, n));

/** Native-size mask boundaries stay antialiased. Contour smoothing and feather
 * are distinct operations; RGB source pixels never enter this function. */
export function refineCutoutMask(input: HTMLCanvasElement, feather: number, expand: number, smoothing: boolean): HTMLCanvasElement {
  if (feather <= 0 && expand === 0 && !smoothing) return input;
  const output = document.createElement('canvas'); output.width = input.width;output.height = input.height;
  const ctx = output.getContext('2d'); if (!ctx) return input;
  if (expand > 0) {
    const n = Math.round(expand);
    for(let x=-n;x<=n;x++) for(let y=-n;y<=n;y++) if(x*x+y*y<=n*n) ctx.drawImage(input,x,y);
  } else if (expand < 0) {
    const n = Math.round(Math.abs(expand));ctx.drawImage(input,0,0);
    ctx.globalCompositeOperation='destination-in';
    for(let x=-n;x<=n;x++) for(let y=-n;y<=n;y++) if(x*x+y*y<=n*n) ctx.drawImage(input,x,y);
    ctx.globalCompositeOperation='source-over';
  } else ctx.drawImage(input,0,0);
  if (smoothing) {
    // Remove stairstep bumps by smoothing only the alpha contour; interior
    // stays opaque and the pixels never leak into the RGB image.
    const source = document.createElement('canvas');source.width=output.width;source.height=output.height;
    source.getContext('2d')?.drawImage(output,0,0);
    ctx.clearRect(0,0,output.width,output.height);
    ctx.filter = 'blur(0.95px)';ctx.drawImage(source,0,0);ctx.filter='none';
    const data=ctx.getImageData(0,0,output.width,output.height);
    for(let i=3;i<data.data.length;i+=4) {
      const x=constrain((data.data[i]/255-.18)/.64,0,1);
      data.data[i]=Math.round((x*x*(3-2*x))*255);
    }
    ctx.putImageData(data,0,0);
  }
  if (feather>0) {
    const source=document.createElement('canvas');source.width=output.width;source.height=output.height;
    source.getContext('2d')?.drawImage(output,0,0);
    ctx.clearRect(0,0,output.width,output.height);
    ctx.filter=`blur(${constrain(feather,0,40)}px)`;
    ctx.drawImage(source,0,0);ctx.filter='none';
  }
  return output;
}

/** Reproducible command history: one continuous brush stroke is one action.
 * Undo/redo replays the original saved mask plus commands, avoiding async PNG
 * decoding races and unbounded full-resolution snapshot memory. */
export function paintCutoutCommand(ctx: CanvasRenderingContext2D, command: Command): void {
  const {points,tool,size,operation}=command;
  if (tool==='clear') {ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);return;}
  if (!points.length) return;
  ctx.save();
  ctx.globalCompositeOperation = tool==='eraser'||tool==='remove'||operation==='remove' ? 'destination-out' : 'source-over';
  ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=size;ctx.lineCap='round';ctx.lineJoin='round';
  const first=points[0], last=points[points.length-1];
  if (tool==='ellipse') {ctx.beginPath();ctx.ellipse((first.x+last.x)/2,(first.y+last.y)/2,Math.max(.5,Math.abs(last.x-first.x)/2),Math.max(.5,Math.abs(last.y-first.y)/2),0,0,Math.PI*2);ctx.fill();}
  else if(tool==='rectangle') ctx.fillRect(Math.min(first.x,last.x),Math.min(first.y,last.y),Math.abs(last.x-first.x),Math.abs(last.y-first.y));
  else {
    ctx.beginPath();ctx.moveTo(first.x,first.y);
    for(const point of points.slice(1))ctx.lineTo(point.x,point.y);
    if(tool==='lasso'||tool==='polygon'){ctx.closePath();ctx.fill();}
    else if(points.length===1){ctx.arc(first.x,first.y,Math.max(.5,size/2),0,Math.PI*2);ctx.fill();}
    else ctx.stroke();
  }
  ctx.restore();
}

export default function CutoutWorkspace({ layer, onClose, onProcess }: {
  layer: RasterLayer; onClose: () => void; onProcess: (data: string, width: number, height: number) => void;
}) {
  const mask=useRef<HTMLCanvasElement|null>(null);
  const initial=useRef<HTMLCanvasElement|null>(null);
  const preview=useRef<HTMLCanvasElement|null>(null);
  const original=useRef<HTMLImageElement|null>(null);
  const viewport=useRef<HTMLDivElement|null>(null);
  const dialog=useRef<HTMLElement|null>(null);
  const pointer=useRef<number|null>(null);
  const points=useRef<P[]>([]);
  const polygon=useRef<P[]>([]);
  const activeCommand=useRef<Command|null>(null);
  const history=useRef<Command[]>([]);
  const future=useRef<Command[]>([]);
  const dragPan=useRef<P|null>(null);
  const stagePan=useRef<{pointerId:number,dx:number,dy:number}|null>(null);
  const spacePressed=useRef(false);
  const [historySize,setHistorySize]=useState(0);
  const [futureSize,setFutureSize]=useState(0);
  const [ready,setReady]=useState(false);
  const [hasSelection,setHasSelection]=useState(false);
  const [tool,setTool]=useState<MaskTool>('keep');
  const [view,setView]=useState<MaskView>('original');
  const [operation,setOperation]=useState<'keep'|'remove'>('keep');
  const [size,setSize]=useState(64);
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState<P>({x:0,y:0});
  const [feather,setFeather]=useState(0);
  const [expand,setExpand]=useState(0);
  const [smoothing,setSmoothing]=useState(true);
  const [revision,setRevision]=useState(0);
  const [error,setError]=useState('');
  const [cursor,setCursor]=useState<P|null>(null);
  const [dimensions,setDimensions]=useState({width:1,height:1});
  const repaint=useCallback(()=>setRevision(n=>n+1),[]);

  useEffect(()=>{
    let cancelled=false; const image=new Image();
    image.onload=()=>{
      if(cancelled)return;
      const w=image.naturalWidth,h=image.naturalHeight;
      if(!w||!h||w*h>64_000_000){setError('Unsupported image dimensions (maximum 64 megapixels).');return;}
      original.current=image;
      const base=document.createElement('canvas');base.width=w;base.height=h;
      const working=document.createElement('canvas');working.width=w;working.height=h;
      initial.current=base;mask.current=working;
      const setup=()=>{
        if(cancelled)return;
        const display=preview.current;
        if(display){const ratio=Math.min(1,1300/Math.max(w,h));display.width=Math.max(1,Math.round(w*ratio));display.height=Math.max(1,Math.round(h*ratio));}
        setDimensions({width:w,height:h});setReady(true);repaint();
        window.setTimeout(()=>dialog.current?.focus({preventScroll:true}),0);
      };
      if(layer.cutoutMask?.data){const stored=new Image();stored.onload=()=>{
        if(cancelled)return;
        base.getContext('2d')?.drawImage(stored,0,0,w,h);
        working.getContext('2d')?.drawImage(stored,0,0,w,h);
        setHasSelection(true);setup();
      };stored.onerror=()=>{setError('Saved mask could not be loaded; starting empty.');setup();};stored.src=layer.cutoutMask.data;}
      else setup();
    };
    image.onerror=()=>{if(!cancelled)setError('Unable to decode the original image.');};
    image.src=layer.image;
    return()=>{cancelled=true;};
  },[layer.id,layer.image,layer.cutoutMask?.data,repaint]);

  const countHistory=()=>{setHistorySize(history.current.length);setFutureSize(future.current.length);};
  const replay=()=>{
    if(!mask.current)return;
    const ctx=mask.current.getContext('2d');if(!ctx)return;
    ctx.clearRect(0,0,mask.current.width,mask.current.height);
    if(initial.current)ctx.drawImage(initial.current,0,0);
    for(const action of history.current)paintCutoutCommand(ctx,action);
    setHasSelection(Boolean(layer.cutoutMask?.data)||history.current.some(item=>item.operation==='keep' && item.tool!=='clear' && item.tool!=='remove' && item.tool!=='eraser'));
    // Reset clears the initial mask as well.
    const mostRecentClear=history.current.findLastIndex(item=>item.tool==='clear');
    if(mostRecentClear>=0)setHasSelection(history.current.slice(mostRecentClear+1).some(item=>item.operation==='keep' && !['eraser','remove'].includes(item.tool)));
    countHistory();repaint();
  };
  const commit=(command:Command,alreadyDrawn=false)=>{
    if(!mask.current)return;
    if(!alreadyDrawn) {const ctx=mask.current.getContext('2d');if(ctx)paintCutoutCommand(ctx,command);}
    history.current.push(command);future.current=[];
    if(command.tool==='clear')setHasSelection(false);
    else if(command.operation==='keep' && !['eraser','remove'].includes(command.tool))setHasSelection(true);
    countHistory();repaint();
  };
  const undoStep=()=>{const item=history.current.pop();if(!item)return;future.current.push(item);replay();};
  const redoStep=()=>{const item=future.current.pop();if(!item)return;history.current.push(item);replay();};
  const reset=()=>commit({tool:'clear',operation:'remove',size:0,points:[]});
  const finishPolygon=()=>{if(polygon.current.length>=3)commit({tool:'polygon',operation,size,points:[...polygon.current]});polygon.current=[];repaint();};
  const local=(event:ReactPointerEvent<HTMLCanvasElement>):P=>{
    const rect=event.currentTarget.getBoundingClientRect();
    return{x:constrain((event.clientX-rect.left)/Math.max(1,rect.width)*dimensions.width,0,dimensions.width),
      y:constrain((event.clientY-rect.top)/Math.max(1,rect.height)*dimensions.height,0,dimensions.height)};
  };
  const zoomAbout=(factor:number,x?:number,y?:number)=>{
    const previous=zoom,next=constrain(zoom*factor,.1,16);
    const bounds=viewport.current?.getBoundingClientRect();
    if(bounds&&x!==undefined&&y!==undefined){
      const px=x-bounds.left-bounds.width/2,py=y-bounds.top-bounds.height/2;
      setPan(offset=>({x:px-(px-offset.x)*next/previous,y:py-(py-offset.y)*next/previous}));
    }
    setZoom(next);
  };
  const onWheel=(event:ReactWheelEvent<HTMLDivElement>)=>{
    if(event.ctrlKey||event.metaKey){event.preventDefault();zoomAbout(event.deltaY<0?1.15:1/1.15,event.clientX,event.clientY);}
    else if(event.shiftKey)setPan(v=>({...v,x:v.x-event.deltaY}));
    else setPan(v=>({...v,y:v.y-event.deltaY}));
  };
  const down=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(!ready)return;
    if(event.button!==0&&event.button!==1)return;
    if (event.button===1) event.preventDefault();
    pointer.current=event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    if(event.button===1||spacePressed.current||tool==='hand'){
      dragPan.current={x:event.clientX-pan.x,y:event.clientY-pan.y};return;
    }
    const pos=local(event);
    if(tool==='polygon'){polygon.current.push(pos);pointer.current=null;repaint();return;}
    points.current=[pos];
    activeCommand.current={tool,operation,size,points:[pos]};
    if(['keep','remove','eraser'].includes(tool)){
      const ctx=mask.current?.getContext('2d');if(ctx)paintCutoutCommand(ctx,activeCommand.current);
      if(operation==='keep'&&tool==='keep')setHasSelection(true);
      repaint();
    }
  };
  const move=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(ready)setCursor(local(event));
    if(pointer.current!==event.pointerId)return;
    if(dragPan.current){setPan({x:event.clientX-dragPan.current.x,y:event.clientY-dragPan.current.y});return;}
    const command=activeCommand.current;if(!command)return;
    const pos=local(event), previous=points.current.at(-1)??pos;
    if(['keep','remove','eraser'].includes(command.tool)){
      if(Math.hypot(pos.x-previous.x,pos.y-previous.y)<.75)return;
      command.points.push(pos);points.current.push(pos);
      const ctx=mask.current?.getContext('2d');if(ctx)paintCutoutCommand(ctx,{...command,points:[previous,pos]});
    }else if(['line','rectangle','ellipse'].includes(command.tool))command.points=[command.points[0],pos];
    else command.points.push(pos);
    points.current=[...command.points];repaint();
  };
  const finish=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(pointer.current!==event.pointerId)return;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    pointer.current=null;
    if(dragPan.current){dragPan.current=null;return;}
    const command=activeCommand.current;
    if(command){commit({...command,points:[...command.points]},['keep','remove','eraser'].includes(command.tool));activeCommand.current=null;}
    points.current=[];repaint();
  };
  const process=()=>{
    if(!mask.current||!hasSelection)return;
    const output=refineCutoutMask(mask.current,feather,expand,smoothing);
    onProcess(output.toDataURL('image/png'),output.width,output.height);
  };
  useEffect(()=>{
    const press=(event:KeyboardEvent)=>{
      if(!dialog.current)return;
      if(event.code==='Space' && !(event.target instanceof HTMLInputElement)){spacePressed.current=true;event.preventDefault();}
      if(!(event.ctrlKey||event.metaKey))return;
      const key=event.key.toLowerCase();
      if(key==='z'){event.preventDefault();event.stopPropagation();event.shiftKey?redoStep():undoStep();}
      else if(key==='y'){event.preventDefault();event.stopPropagation();redoStep();}
      else if(key==='+'||key==='='||key==='add'){event.preventDefault();zoomAbout(1.25);}
      else if(key==='-'||key==='subtract'){event.preventDefault();zoomAbout(1/1.25);}
      else if(key==='0'){event.preventDefault();setZoom(1);setPan({x:0,y:0});}
    };
    const release=(event:KeyboardEvent)=>{if(event.code==='Space')spacePressed.current=false;};
    window.addEventListener('keydown',press,true);window.addEventListener('keyup',release,true);
    return()=>{window.removeEventListener('keydown',press,true);window.removeEventListener('keyup',release,true);};
  });
  useEffect(()=>{
    if(!ready||!mask.current||!original.current||!preview.current)return;
    const output=preview.current,ctx=output.getContext('2d');if(!ctx)return;
    const w=output.width,h=output.height;
    ctx.clearRect(0,0,w,h);
    // Live inspection stays responsive for very large source images. Exact
    // native-resolution refinement is performed only on Process mask.
    const draftMask=document.createElement('canvas');draftMask.width=w;draftMask.height=h;
    draftMask.getContext('2d')?.drawImage(mask.current,0,0,w,h);
    const ratio=w/dimensions.width;
    const matte=view==='original'?draftMask:refineCutoutMask(draftMask,feather*ratio,Math.round(expand*ratio),smoothing);
    if(view==='original'){
      ctx.drawImage(original.current,0,0,w,h);
      ctx.save();ctx.globalAlpha=.5;ctx.fillStyle='#1ce5a0';
      const overlay=document.createElement('canvas');overlay.width=w;overlay.height=h;
      const painter=overlay.getContext('2d');if(painter){painter.fillStyle='#1ce5a0';painter.fillRect(0,0,w,h);
        painter.globalCompositeOperation='destination-in';painter.drawImage(mask.current,0,0,w,h);ctx.drawImage(overlay,0,0);}
      ctx.restore();
    }else if(view==='mask'){
      ctx.fillStyle='#101522';ctx.fillRect(0,0,w,h);ctx.drawImage(matte,0,0,w,h);
    }else{
      ctx.drawImage(original.current,0,0,w,h);
      ctx.globalCompositeOperation='destination-in';ctx.drawImage(matte,0,0,w,h);ctx.globalCompositeOperation='source-over';
    }
    const dx=w/dimensions.width,dy=h/dimensions.height;
    ctx.save();ctx.strokeStyle=operation==='keep'?'#44ffc4':'#ff668e';ctx.lineWidth=2;
    for(const outline of [polygon.current,activeCommand.current?.points??[]]) if(outline.length>1){
      ctx.beginPath();ctx.moveTo(outline[0].x*dx,outline[0].y*dy);
      for(const next of outline.slice(1))ctx.lineTo(next.x*dx,next.y*dy);
      if(tool==='lasso')ctx.closePath();ctx.stroke();
    }
    ctx.restore();
    void revision;
  },[ready,revision,view,dimensions,feather,expand,smoothing,operation,tool]);
  const displayRatio=Math.min(1,1300/Math.max(dimensions.width,dimensions.height));
  return <div className="huelith-cutout-backdrop" role="presentation">
    <section ref={dialog} tabIndex={-1} className="huelith-cutout-dialog" role="dialog" aria-modal="true" aria-label="Huelith Cutout workspace"
      onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();if(polygon.current.length){polygon.current=[];repaint();}else onClose();}
        if(event.key==='Enter'&&tool==='polygon'){event.preventDefault();finishPolygon();}}}>
      <header><div className="cutout-brand"><span>✦</span><div><strong>Huelith Cutout</strong><small>MASK WORKSPACE / NON-DESTRUCTIVE</small></div></div><span className="cutout-header-help">Draw what stays. The original artwork is never erased.</span><button type="button" onClick={onClose} aria-label="Close Cutout">×</button></header>
      <div className="huelith-cutout-layout">
        <nav className="huelith-cutout-tools" aria-label="Selection tools">{TOOLS.map(([id,symbol,label])=><button key={id} title={label} aria-label={label} aria-pressed={tool===id}
          onClick={()=>{if(polygon.current.length)finishPolygon();setTool(id);}}>{symbol}<small>{label}</small></button>)}</nav>
        <div ref={viewport} className="huelith-cutout-viewport" aria-label="Image and mask editor" onWheel={onWheel}
          onPointerDown={event=>{
            // Pan across empty stage space as well as directly over the image.
            if(event.target!==event.currentTarget || !(event.button===1||tool==='hand'||spacePressed.current))return;
            event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
            stagePan.current={pointerId:event.pointerId,dx:event.clientX-pan.x,dy:event.clientY-pan.y};
          }}
          onPointerMove={event=>{
            const moving=stagePan.current;
            if(moving?.pointerId===event.pointerId)setPan({x:event.clientX-moving.dx,y:event.clientY-moving.dy});
          }}
          onPointerUp={event=>{if(stagePan.current?.pointerId===event.pointerId){stagePan.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}}
          onPointerCancel={()=>{stagePan.current=null;}}>
          <canvas ref={preview} className="huelith-cutout-canvas" style={{
            width:`${dimensions.width*displayRatio*zoom}px`,height:`${dimensions.height*displayRatio*zoom}px`,
            transform:`translate(calc(-50% + ${pan.x}px),calc(-50% + ${pan.y}px))`,
            cursor:tool==='hand'?'grab':'crosshair'}} onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
            onDoubleClick={event=>{if(tool==='polygon'){event.preventDefault();finishPolygon();}}} onContextMenu={event=>event.preventDefault()} />
          {cursor&&ready&&tool!=='hand'&&<div className="cutout-brush-indicator" style={{
            width:Math.max(3,size*displayRatio*zoom),height:Math.max(3,size*displayRatio*zoom),
            left:`calc(50% + ${pan.x+ (cursor.x-dimensions.width/2)*displayRatio*zoom}px)`,
            top:`calc(50% + ${pan.y+(cursor.y-dimensions.height/2)*displayRatio*zoom}px)`,
          }}/>}<div className="cutout-stage-hint">Ctrl + +/− zoom · Ctrl + wheel zoom to cursor · Middle drag or Space drag to pan</div>
        </div>
        <aside className="huelith-cutout-options"><div className="cutout-section-title">✦ Selection craft</div>
          <label>Paint action<select value={operation} onChange={event=>setOperation(event.target.value as 'keep'|'remove')}><option value="keep">Keep subject</option><option value="remove">Remove region</option></select></label>
          <label>Brush / line size <output>{size}px</output><input aria-label="Selection brush size" type="range" min="1" max="1024" value={size} onChange={event=>setSize(+event.target.value)} /></label>
          <input className="cutout-size-number" aria-label="Brush size exact value" type="number" min="1" max="4096" value={size} onChange={event=>setSize(constrain(+event.target.value||1,1,4096))}/>
          <label>Zoom <output>{Math.round(zoom*100)}%</output><input aria-label="Cutout zoom" type="range" min=".1" max="16" step=".1" value={zoom} onChange={event=>setZoom(+event.target.value)}/></label>
          <div className="cutout-zoom-shortcuts"><button onClick={()=>zoomAbout(1/1.25)}>−</button><button onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>Fit / 100%</button><button onClick={()=>zoomAbout(1.25)}>+</button></div>
          <div className="cutout-section-title">◉ Inspection</div><div className="huelith-cutout-view-modes">{(['original','mask','preview'] as const).map(item=><button key={item} aria-pressed={view===item} onClick={()=>setView(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div>
          <div className="cutout-section-title">⌁ Edge refinement</div>
          <label>Feather <output>{feather}px</output><input aria-label="Mask feather" type="range" min="0" max="20" value={feather} onChange={event=>setFeather(+event.target.value)}/></label>
          <label>Expand / Contract <output>{expand}px</output><input aria-label="Expand or contract mask" type="range" min="-10" max="10" value={expand} onChange={event=>setExpand(+event.target.value)}/></label>
          <label className="huelith-cutout-checkbox"><input type="checkbox" checked={smoothing} onChange={event=>setSmoothing(event.target.checked)} /> Smooth selection outline</label>
          <p>Keep preserves white clothing and other details exactly where you paint. Lasso fills its entire boundary. Eraser clears selection marks.</p>
          <div className="huelith-cutout-actions"><button onClick={undoStep} disabled={!historySize}>↶ Undo</button><button onClick={redoStep} disabled={!futureSize}>↷ Redo</button><button onClick={reset}>Reset selection</button></div>
        </aside>
      </div>
      {error&&<p role="alert" className="huelith-cutout-error">{error}</p>}
      <footer><span>{ready?`${dimensions.width} × ${dimensions.height} · Native pixel mask · ${historySize} operations`:'Loading image…'}</span>
        <button onClick={onClose}>Cancel</button><button className="primary" disabled={!ready||!hasSelection} onClick={process}>✦ Process mask</button></footer>
    </section>
  </div>;
}
