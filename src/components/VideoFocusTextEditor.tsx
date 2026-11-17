import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import type {VideoTextStyle} from '../editor/video/studio-types';
import {DEFAULT_VIDEO_FONTS,hasVideoTextContent,initialVideoTextDraft,prepareVideoTextDraft} from '../editor/video/video-text-draft';
import './VideoFocusTextEditor.css';

type Props={id:string;text:string;style?:VideoTextStyle;fonts?:string[];onApply:(text:string,style:VideoTextStyle)=>void;onCancel:()=>void};
/** Video-specific Focus Text editor: no dependency on image-editor state. */
export default function VideoFocusTextEditor({id,text,style,fonts,onApply,onCancel}:Props){
  const [draft,setDraft]=useState(()=>initialVideoTextDraft(text,style));
  const input=useRef<HTMLTextAreaElement>(null);
  const [leaving,setLeaving]=useState(false);
  const exitTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const requested=useRef(false);
  useEffect(()=>()=>clearTimeout(exitTimer.current),[]);
  /** Leave the dialog mounted long enough to paint its exit transition.
   * Reduced-motion users close immediately, without a hidden 180ms delay. */
  const dismiss=(apply=false)=>{
    if(requested.current)return;
    if(apply&&!hasVideoTextContent(draft.text))return;
    requested.current=true;
    const finish=()=>{
      if(apply){const next=prepareVideoTextDraft(draft);onApply(next.text,next.style);}
      else onCancel();
    };
    if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
    setLeaving(true);
    exitTimer.current=setTimeout(finish,190);
  };
  useEffect(()=>{setDraft(initialVideoTextDraft(text,style));},[id]);
  useEffect(()=>{input.current?.focus({preventScroll:true});},[id]);
  const patch=(next:Partial<VideoTextStyle>)=>setDraft(current=>({...current,style:{...current.style,...next}}));
  const s=draft.style;
  const fontList=[...new Set([s.fontFamily??'Segoe UI',...(fonts?.length?fonts:DEFAULT_VIDEO_FONTS)])];
  const commit=()=>dismiss(true);
  const keyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
    if(event.nativeEvent.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();}
    else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();event.stopPropagation();commit();}
  };
  const target=document.querySelector('.app')??document.body;
  return createPortal(<div className={`hv-focus-backdrop${leaving?' is-leaving':''}`} role="dialog" aria-modal="true" aria-label="Video Focus Text editor"
    onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();}}}>
    <button type="button" className="hv-focus-dismiss" aria-label="Close video text editor" onClick={()=>dismiss()}/>
    <section className="hv-focus-card">
      <header className="hv-focus-header">
        <div className="hv-focus-heading"><span className="hv-focus-mark">T</span><div><strong>Focus Text</strong><small>VIDEO EDITOR · TITLE DESIGNER</small></div></div>
        <button type="button" className="hv-focus-close" aria-label="Cancel text editing" onClick={()=>dismiss()}>×</button>
      </header>
      <div className="hv-focus-tools">
        <label>Font<select aria-label="Video title font" value={s.fontFamily??'Segoe UI'} onChange={event=>patch({fontFamily:event.target.value})}>
          {fontList.map(font=><option key={font} value={font}>{font}</option>)}</select></label>
        <label className="hv-focus-size">Size<input aria-label="Video title font size" type="number" min={8} max={500}
          value={s.fontSize??54} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))patch({fontSize:Math.max(8,Math.min(500,event.target.valueAsNumber))});}}/></label>
        <button type="button" aria-label="Bold title" aria-pressed={(s.fontWeight??700)>=700}
          onClick={()=>patch({fontWeight:(s.fontWeight??700)>=700?400:700})}><strong>B</strong></button>
        <button type="button" aria-label="Italic title" aria-pressed={!!s.italic}
          onClick={()=>patch({italic:!s.italic})}><em>I</em></button>
        <label className="hv-focus-color">Color<input type="color" aria-label="Video title color" value={/^#[0-9a-f]{6}$/i.test(s.color??'')?s.color:'#ffffff'}
          onChange={event=>patch({color:event.target.value})}/></label>
      </div>
      <div className="hv-focus-preview">
        <div className="hv-focus-preview-caption">Live title preview</div>
        <textarea ref={input} spellCheck={false} aria-label="Edit video title" maxLength={2000} value={draft.text}
          placeholder="Your story starts here…" onKeyDown={keyDown} onChange={event=>setDraft(current=>({...current,text:event.target.value}))}
          style={{'--hv-title-width':`${Math.round((s.width??.85)*100)}%`,
            fontFamily:s.fontFamily??'Segoe UI',fontSize:`${Math.max(18,Math.min(82,(s.fontSize??54)*.8))}px`,
            fontWeight:s.fontWeight??700,fontStyle:s.italic?'italic':'normal',color:s.color??'#ffffff',
            textAlign:s.align??'center',letterSpacing:`${s.letterSpacing??0}px`,lineHeight:s.lineHeight??1.2,
            WebkitTextStroke:(s.strokeWidth??0)>0?`${Math.min(3,(s.strokeWidth??0)*.25)}px ${s.stroke??'#111111'}`:undefined,
            textShadow:(s.shadowBlur??0)>0?`0 2px ${s.shadowBlur}px ${s.shadowColor??'#000000'}`:undefined} as CSSProperties}/>
      </div>
      <div className="hv-focus-fine-controls">
        <div className="hv-focus-align" role="group" aria-label="Title alignment">
          {(['left','center','right'] as const).map(align=><button key={align} type="button" aria-pressed={(s.align??'center')===align}
            onClick={()=>patch({align})}>{align[0].toUpperCase()+align.slice(1)}</button>)}
        </div>
        <label>Text width <span>{Math.round((s.width??.85)*100)}%</span><input aria-label="Title text width" type="range" min={10} max={98}
          value={Math.round((s.width??.85)*100)} onChange={event=>patch({width:event.target.valueAsNumber/100})}/></label>
        <label>Outline <span>{s.strokeWidth??0}px</span><input aria-label="Title outline width" type="range" min={0} max={15} step={.5}
          value={s.strokeWidth??0} onChange={event=>patch({strokeWidth:event.target.valueAsNumber})}/></label>
        {(s.strokeWidth??0)>0&&<label className="hv-focus-stroke">Outline color<input aria-label="Title outline color" type="color"
          value={/^#[0-9a-f]{6}$/i.test(s.stroke??'')?s.stroke:'#111111'} onChange={event=>patch({stroke:event.target.value})}/></label>}
      </div>
      <footer className="hv-focus-footer"><small>Ctrl+Enter to apply · Shift+Enter for a new line · Esc to cancel</small>
        <div><button type="button" onClick={()=>dismiss()}>Cancel</button><button type="button" className="hv-focus-apply" disabled={!hasVideoTextContent(draft.text)} onClick={commit}>Apply text</button></div>
      </footer>
    </section>
  </div>,target);
}
