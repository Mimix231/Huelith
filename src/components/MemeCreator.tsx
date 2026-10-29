import {useCallback,useEffect,useRef,useState,type ChangeEvent,type PointerEvent as ReactPointerEvent} from 'react';
import type {Document,VectorShape} from '../editor/types';
import {exportCanvas,prepareImages,drawShape} from '../editor/render';
import {MEME_DEFAULTS,MEME_LAYOUTS,composeMemeArtwork,type MemeCommit,type MemeSettings} from '../editor/meme-creator';
import './MemeCreator.css';

const presetDefaults:Record<string,Partial<MemeSettings>>={
  classic:{fontFamily:'Impact, Arial Black, sans-serif',uppercase:true,outlineWidth:1.5},
  reaction:{fontFamily:'Arial Black, sans-serif',uppercase:true,outlineWidth:1.8},
  demotivational:{fontFamily:'Georgia, serif',uppercase:false,outlineWidth:0.2},
  comic:{fontFamily:'Arial Black, sans-serif',uppercase:false,outlineWidth:1.0},
  speech:{fontFamily:'Arial, sans-serif',textColor:'#171627',outlineColor:'#ffffff',uppercase:false,outlineWidth:0},
  caption:{fontFamily:'Inter, Arial, sans-serif',uppercase:false,outlineWidth:0},
  split:{fontFamily:'Impact, Arial Black, sans-serif',uppercase:true,outlineWidth:1},
  beforeAfter:{fontFamily:'Impact, Arial Black, sans-serif',uppercase:true,outlineWidth:1},
  custom:{fontFamily:'Inter, Arial, sans-serif',uppercase:false,outlineWidth:0.4},
};
const toColor=(color:string)=>/^#[\da-f]{6}$/i.test(color)?color:'#ffffff';
const clamp=(v:number,l:number,h:number)=>Math.max(l,Math.min(h,v));
const labels:{label:string;value:keyof MemeSettings;min:number;max:number;step:number;unit:string}[]=[
  {label:'Font size',value:'fontSize',min:1.5,max:20,step:.1,unit:'%'},
  {label:'Outline thickness',value:'outlineWidth',min:0,max:6,step:.1,unit:''},
  {label:'Safe margins',value:'padding',min:0,max:15,step:.25,unit:'%'},
];
export default function MemeCreator({doc,onClose,onApply}: {
  doc:Document;onClose:()=>void;onApply:(request:MemeCommit)=>void;
}){
  const [settings,setSettings]=useState<MemeSettings>({...MEME_DEFAULTS});
  const [secondImage,setSecondImage]=useState<MemeCommit['secondImage']>(null);
  const [renderReady,setRenderReady]=useState(false);
  const [renderError,setRenderError]=useState('');
  const [showOriginal,setShowOriginal]=useState(false);
  const [busy,setBusy]=useState(false);
  // Increment after async decode completes; the preview must repaint with the decoded image.
  const [secondReady,setSecondReady]=useState(0);
  const stageRef=useRef<HTMLCanvasElement>(null);
  const stageShell=useRef<HTMLDivElement>(null);
  const source=useRef<HTMLCanvasElement|null>(null);
  const image=useRef<HTMLImageElement|null>(null);
  const drag=useRef<{index:number;startX:number;startY:number;offsetX:number;offsetY:number;pointerId:number}|null>(null);
  const change=<K extends keyof MemeSettings>(key:K,value:MemeSettings[K])=>setSettings(s=>({...s,[key]:value}));
  const applyLayout=(layout:MemeSettings['layout'])=>setSettings(s=>({...s,textColor:MEME_DEFAULTS.textColor,outlineColor:MEME_DEFAULTS.outlineColor,...presetDefaults[layout],layout,
    topOffsetX:0,topOffsetY:0,bottomOffsetX:0,bottomOffsetY:0}));
  useEffect(()=>{
    let active=true;
    setRenderReady(false);
    void prepareImages(doc).then(()=>{if(!active)return;
      source.current=exportCanvas(doc);setRenderReady(true);
    }).catch(()=>{if(active){setRenderError('Original image preview is unavailable. You can still create editable captions.');setRenderReady(true);}});
    return()=>{active=false;};
  },[doc.id,doc.updatedAt]);
  useEffect(()=>{
    let cancelled=false;
    const update=async()=>{
      if(!secondImage){image.current=null;setSecondReady(n=>n+1);return;}
      const im=new Image();im.src=secondImage.data;
      try{await im.decode();if(!cancelled){image.current=im;setSecondReady(n=>n+1);}}
      catch{if(!cancelled){image.current=null;setSecondReady(n=>n+1);}}
    };
    void update();return()=>{cancelled=true;};
  },[secondImage?.data]);
  const paint=useCallback(()=>{
    const canvas=stageRef.current;if(!canvas)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const width=canvas.width,height=canvas.height;
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle='#151b28';ctx.fillRect(0,0,width,height);
    const scale=width/doc.width;
    ctx.save();ctx.scale(scale,scale);
    if(source.current)ctx.drawImage(source.current,0,0,doc.width,doc.height);
    if(!showOriginal){
      if(['split','beforeAfter'].includes(settings.layout)&&settings.includeSecondImage&&image.current){
        ctx.save();const a=image.current,s=Math.min(doc.width/2/a.width,doc.height/a.height);
        ctx.drawImage(a,doc.width/2,(doc.height-a.height*s)/2,a.width*s,a.height*s);ctx.restore();
      }
      const measure=(text:string,font:string,size:number)=>{ctx.save();ctx.font=`900 ${size}px ${font}`;
        const result=ctx.measureText(text).width;ctx.restore();return result;};
      const design=composeMemeArtwork(doc,settings,measure);
      [...design.backdrops,...design.captions].forEach((shape:VectorShape)=>drawShape(ctx,shape));
    }
    ctx.restore();
  },[doc,settings,showOriginal]);
  useEffect(()=>{if(!renderReady)return;const id=window.setTimeout(paint,45);return()=>window.clearTimeout(id);},[paint,renderReady,secondReady]);
  const upload=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>22*1024*1024){setRenderError('Comparison images must be smaller than 22 MB.');return;}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setRenderError('Choose a PNG, JPEG or WebP image.');return;}
    setBusy(true);
    const reader=new FileReader();
    reader.onload=async()=>{
      const data=String(reader.result);const preview=new Image();preview.src=data;
      try{await preview.decode();
        if(preview.naturalWidth*preview.naturalHeight>64_000_000)throw Error('Image exceeds the 64 megapixel limit.');
        setSecondImage({data,width:preview.naturalWidth,height:preview.naturalHeight});
        setSettings(s=>({...s,includeSecondImage:true}));setRenderError('');
      }catch(error){setRenderError(error instanceof Error?error.message:'Could not decode comparison image.');}
      finally{setBusy(false);}
    };
    reader.onerror=()=>{setBusy(false);setRenderError('Unable to read comparison image.');};reader.readAsDataURL(file);
  };
  const dragCaption=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||showOriginal||!renderReady)return;
    const bound=stageShell.current?.getBoundingClientRect();if(!bound)return;
    const px=(event.clientX-bound.left)/bound.width*doc.width;
    const py=(event.clientY-bound.top)/bound.height*doc.height;
    const captions=composeMemeArtwork(doc,settings).captions;
    // Only grab a genuine text box. Empty pasteboard and photo clicks remain
    // navigational; the two captions are independently draggable.
    let index=captions.findIndex(shape=>px>=shape.x&&px<=shape.x+shape.width&&py>=shape.y&&py<=shape.y+shape.height);
    if(index<0)return;
    index=Math.min(1,index);
    drag.current={pointerId:event.pointerId,index,startX:event.clientX,startY:event.clientY,
      offsetX:index===0?settings.topOffsetX:settings.bottomOffsetX,
      offsetY:index===0?settings.topOffsetY:settings.bottomOffsetY};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveCaption=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const d=drag.current;if(!d||d.pointerId!==event.pointerId||!stageShell.current)return;
    const b=stageShell.current.getBoundingClientRect();
    const dx=(event.clientX-d.startX)/b.width*100,dy=(event.clientY-d.startY)/b.height*100;
    setSettings(s=>d.index===0?{...s,topOffsetX:clamp(d.offsetX+dx,-80,80),topOffsetY:clamp(d.offsetY+dy,-90,90)}:
      {...s,bottomOffsetX:clamp(d.offsetX+dx,-80,80),bottomOffsetY:clamp(d.offsetY+dy,-90,90)});
  };
  const stopDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{if(drag.current?.pointerId===event.pointerId){drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}};
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose();}};
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[onClose]);
  const current=MEME_LAYOUTS.find(t=>t.id===settings.layout);
  return <div className="meme-overlay" role="presentation">
    <section className="meme-workspace" role="dialog" aria-modal="true" aria-label="Huelith Meme Creator">
      <header className="meme-top"><div className="meme-brand"><span className="meme-brand-icon">◈</span><div><strong>Meme Creator</strong><small>HUELITH · EDITABLE IMAGE DESIGN</small></div></div>
        <span className="meme-document">{doc.name} · {doc.width} × {doc.height}</span>
        <button className="meme-close" type="button" onClick={onClose} title="Close">×</button></header>
      <div className="meme-columns">
        <aside className="meme-library" aria-label="Meme layouts"><span className="meme-eyebrow">LAYOUT LIBRARY</span><h3>Make it memorable.</h3>
          <p>Choose a layout. Your image stays untouched; captions remain editable Huelith objects.</p>
          <div className="meme-layout-grid">{MEME_LAYOUTS.map(template=><button type="button" key={template.id} title={template.description}
            className={`meme-layout-card ${settings.layout===template.id?'selected':''}`} aria-pressed={settings.layout===template.id}
            onClick={()=>applyLayout(template.id)}><span className="meme-layout-symbol">{template.icon}</span><strong>{template.name}</strong><small>{template.description}</small></button>)}</div>
        </aside>
        <main className="meme-stage"><div className="meme-stage-head"><span className="meme-eyebrow">LIVE COMPOSITION</span><span>{current?.name} · Non-destructive</span></div>
          <div className="meme-preview-wrap"><div ref={stageShell} className="meme-canvas-shell" style={{aspectRatio:`${doc.width}/${doc.height}`}}
            onPointerDown={dragCaption} onPointerMove={moveCaption} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
            <canvas ref={stageRef} width={Math.min(1000,doc.width)} height={Math.round(Math.min(1000,doc.width)*doc.height/doc.width)}
              aria-label="Live meme preview"/>
            {!renderReady&&<div className="meme-loading">Preparing artwork…</div>}
          </div></div>
          <div className="meme-stage-bottom"><span>✦ Drag the upper/lower caption area to reposition text</span>
            <button type="button" onPointerDown={()=>setShowOriginal(true)} onPointerUp={()=>setShowOriginal(false)}
              onPointerLeave={()=>setShowOriginal(false)}>◉ Hold to compare original</button></div>
        </main>
        <aside className="meme-inspector"><span className="meme-eyebrow">CAPTION INSPECTOR</span><h3>Make it yours.</h3>
          <label className="meme-label">Top caption<textarea maxLength={600} rows={3} value={settings.top} onChange={e=>change('top',e.target.value)} placeholder="Top text…"/></label>
          <label className="meme-label">Bottom caption<textarea maxLength={600} rows={3} value={settings.bottom} onChange={e=>change('bottom',e.target.value)} placeholder="Bottom text…"/></label>
          <label className="meme-label">Font style<select value={settings.fontFamily} onChange={e=>change('fontFamily',e.target.value)}>
            {['Impact, Arial Black, sans-serif','Arial Black, sans-serif','Inter, Arial, sans-serif','Georgia, serif','Courier New, monospace'].map(f=><option key={f} value={f}>{f.split(',')[0]}</option>)}
          </select></label>
          {labels.map(control=><label key={control.value} className="meme-range"><span>{control.label}<output>{(settings[control.value] as number).toFixed(1)}{control.unit}</output></span>
            <input type="range" min={control.min} max={control.max} step={control.step} value={settings[control.value] as number} onChange={e=>change(control.value as 'fontSize',Number(e.target.value))}/></label>)}
          <label className="meme-range"><span>Layout background opacity<output>{Math.round(settings.backgroundOpacity*100)}%</output></span>
            <input type="range" min="0" max="1" step="0.05" value={settings.backgroundOpacity}
              onChange={e=>change('backgroundOpacity',Number(e.target.value))}/></label>
          <div className="meme-color-row">{([['Text','textColor'],['Outline','outlineColor'],['Card','captionBackground']] as const).map(([label,key])=><label key={key}><span>{label}</span>
            <input type="color" value={toColor(settings[key])} onChange={e=>change(key,e.target.value)}/></label>)}</div>
          <label className="meme-checkbox"><input type="checkbox" checked={settings.uppercase} onChange={e=>change('uppercase',e.target.checked)}/> Uppercase captions</label>
          {['split','beforeAfter'].includes(settings.layout)&&<div className="meme-second-image"><span>SECOND IMAGE</span>
            <label className="meme-file-picker">⊕ {secondImage?'Replace comparison image':'Choose comparison image'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label>
            {secondImage&&<label className="meme-checkbox"><input type="checkbox" checked={settings.includeSecondImage} onChange={e=>change('includeSecondImage',e.target.checked)}/> Show second image</label>}</div>}
          {renderError&&<p role="alert" className="meme-error">{renderError}</p>}
          <p className="meme-inspector-tip">After applying, select <b>Meme • Editable captions</b> and use Move & Transform or double-click a caption to edit it.</p>
        </aside>
      </div>
      <footer className="meme-footer"><span>✦ Free · Offline · Editable layers · PNG/JPEG/WebP export via File</span>
        <div><button type="button" onClick={onClose}>Cancel</button><button type="button" className="meme-apply" disabled={busy||!renderReady}
          onClick={()=>onApply({settings,secondImage})}>✦ Create editable meme</button></div>
      </footer>
    </section>
  </div>;
}
