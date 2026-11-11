import {useEffect,useMemo,useRef,useState} from 'react';
import {Add,FileUploadOutlined,Download,SubtitlesOutlined} from '@mui/icons-material';
import type {VideoTimeline} from '../editor/video/timeline';
import {addCaptions,captionCues,captionDictionary,captionReplacement,parseCaptions,serializeCaptions,wrapCaptionText} from '../editor/video/captions';
import {CAPTION_STYLES} from '../editor/video/text-templates';
import {isNativeMediaDesktop} from '../editor/video/native-media';
import {transcribeVideoTimeline} from '../editor/video/speech-captions';
import type {VideoJobTask} from './useVideoJobs';
type Term={find:string;replace:string};
type Props={timeline:VideoTimeline;head:number;onChange:(value:VideoTimeline)=>void;onSeek:(time:number)=>void;onError:(message:string)=>void;
  enqueue?:(name:string,task:VideoJobTask)=>string;dictionary?:Term[];onDictionary?:(terms:Term[])=>void};
export default function VideoCaptionPanel({timeline,head,onChange,onSeek,onError,enqueue,dictionary=[],onDictionary}:Props){
  const input=useRef<HTMLInputElement>(null),job=useRef<AbortController|null>(null);
  const [status,setStatus]=useState(''),[language,setLanguage]=useState('auto'),[replace,setReplace]=useState(false);
  const [captionTrack,setCaptionTrack]=useState(''),[languageName,setLanguageName]=useState(''),[columns,setColumns]=useState(36);
  const [find,setFind]=useState(''),[replacement,setReplacement]=useState(''),[marked,setMarked]=useState<string[]>([]);
  const tracks=timeline.tracks.filter(track=>track.purpose==='captions');
  const chosen=tracks.find(track=>track.id===captionTrack)??tracks.find(track=>!track.muted)??tracks[0];
  const trackId=chosen?.id;
  const cues=useMemo(()=>captionCues(timeline,trackId),[timeline,trackId]),running=!!status;
  const [scrollTop,setScrollTop]=useState(0),rowHeight=145,first=Math.max(0,Math.floor(scrollTop/rowHeight)-2);
  const current=useRef(timeline);current.current=timeline;
  const mounted=useRef(true),publish=useRef(onChange);publish.current=onChange;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;job.current?.abort();};},[]);
  const editable=(id:string)=>!timeline.tracks.find(t=>t.id===timeline.clips.find(c=>c.id===id)?.trackId)?.locked;
  const matches=cues.filter(cue=>(!marked.length||marked.includes(cue.id))&&editable(cue.id)&&captionReplacement(cue.text,find,replacement)!==cue.text);
  async function transcribe(signal:AbortSignal,progress:(message:string)=>void){
    const result=await transcribeVideoTimeline(timeline,language,signal,progress);
    signal.throwIfAborted();
    if(!mounted.current)throw Error('Return to the source sequence and start captions again.');
    if(!result.length)throw Error('No speech was recognized. Import an SRT/VTT file or add captions manually.');
    const base=timeline.clips.filter(clip=>!clip.caption),latest=current.current.clips.filter(clip=>!clip.caption);
    if(base.length!==latest.length||base.some((clip,index)=>clip!==latest[index]))throw Error('The source edit changed while transcribing. Start a new caption job.');
    publish.current(addCaptions(current.current,captionDictionary(result,dictionary),'speech',undefined,replace,trackId));
  }
  async function auto(){
    if(enqueue){
      try{enqueue('Create captions',async(signal,progress)=>{
        if(mounted.current)setStatus('Preparing local speech recognition…');
        try{await transcribe(signal,message=>{progress(message);if(mounted.current)setStatus(message);});}
        finally{if(mounted.current)setStatus('');}
      });}catch(error){onError(String(error));}
      return;
    }
    const controller=new AbortController();job.current=controller;setStatus('Preparing local speech recognition…');
    try{await transcribe(controller.signal,setStatus);}
    catch(e){if(!controller.signal.aborted)onError(String(e));}finally{setStatus('');job.current=null;}}
  async function exportFile(format:'srt'|'vtt'){
    try{onError('');const text=serializeCaptions(cues,format);
      if(isNativeMediaDesktop()){
        const {save}=await import('@tauri-apps/plugin-dialog'),{writeFile}=await import('@tauri-apps/plugin-fs');
        const path=await save({defaultPath:`captions.${format}`,filters:[{name:format.toUpperCase(),extensions:[format]}]});if(path)await writeFile(path,new TextEncoder().encode(text));
      }else{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`captions.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
    }catch(e){onError(String(e));}
  }
  return <div className="hv-tool-panel hv-captions"><h3><SubtitlesOutlined fontSize="small"/> Captions</h3>
    <p>Editable captions on their own track. Speech recognition runs entirely on your PC.</p>
    <div className="hv-pair"><label className="hv-field">Caption track<select value={trackId??''} disabled={running} onChange={event=>{setCaptionTrack(event.target.value);setScrollTop(0);}}>
      {!tracks.length&&<option value="">Captions</option>}{tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}
    </select></label><label className="hv-field">New language<input value={languageName} maxLength={42} onChange={event=>setLanguageName(event.target.value)} placeholder="e.g. English"/></label></div>
    <div className="hv-inline-actions">
      <button disabled={running||!languageName.trim()||timeline.tracks.length>=24} onClick={()=>{
        const id=crypto.randomUUID();onChange({...timeline,tracks:[{id,name:languageName.trim(),kind:'title',purpose:'captions',muted:!!tracks.length,locked:false},...timeline.tracks]});
        setLanguageName('');setCaptionTrack(id);setScrollTop(0);
      }}>Add language track</button>
      <button disabled={!chosen} onClick={()=>onChange({...timeline,tracks:timeline.tracks.map(track=>track.purpose==='captions'?{...track,muted:track.id!==trackId}:track)})}>Show this language</button>
    </div>
    <div className="hv-inline-actions"><button disabled={!!chosen?.locked||head>21599.99} onClick={()=>onChange(addCaptions(timeline,[{id:crypto.randomUUID(),start:head,end:Math.min(21600,head+2),text:'Your caption'}],'manual',undefined,false,trackId))}><Add fontSize="small"/> Add caption</button>
      <button onClick={()=>input.current?.click()}><FileUploadOutlined fontSize="small"/> Import SRT / VTT</button></div>
    <input type="file" ref={input} accept=".srt,.vtt,text/vtt" hidden onChange={async e=>{const file=e.target.files?.[0];if(!file)return;
      try{const parsed=parseCaptions(await file.text());onChange(addCaptions(current.current,parsed.cues,parsed.format,undefined,replace,trackId));}catch(error){onError(String(error));}e.target.value='';}}/>
    <label className="hv-check-label"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/> Replace captions on the selected caption track</label>
    {isNativeMediaDesktop()&&<div className="hv-auto-captions"><label className="hv-field">Spoken language<select value={language} onChange={e=>setLanguage(e.target.value)} disabled={running}>
      {[['auto','Detect language'],['en','English'],['nl','Dutch'],['de','German'],['fr','French'],['es','Spanish'],['it','Italian'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean'],['zh','Chinese']].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <button className="hv-accent-button" disabled={running} onClick={()=>void auto()}>Create automatic captions</button>
      {running&&<div role="status">{status}{!enqueue&&<button onClick={()=>job.current?.abort()}>Cancel</button>}</div>}
      <small>Offline Whisper Base · Review recognition before exporting.</small></div>}
    <label className="hv-field">Caption style<select value="" onChange={e=>{const style=CAPTION_STYLES.find(s=>s.id===e.target.value)?.style;if(style)onChange({...timeline,clips:timeline.clips.map(c=>c.caption&&editable(c.id)?{...c,textStyle:style}:c)});}}>
      <option value="">Apply style to captions…</option>{CAPTION_STYLES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <div className="hv-inline-actions">
      <label>Line length <input type="number" min={16} max={64} step={1} value={columns} onChange={event=>setColumns(Number(event.target.value))}/></label>
      <button disabled={!cues.length||!!chosen?.locked} onClick={()=>onChange({...timeline,clips:timeline.clips.map(clip=>clip.caption&&clip.trackId===trackId
        ?{...clip,title:wrapCaptionText(clip.title??'',Math.max(16,Math.min(64,columns)))}:clip)})}>Wrap lines</button>
      <button disabled={!cues.length||!!chosen?.locked} onClick={()=>onChange({...timeline,clips:timeline.clips.map(clip=>clip.caption&&clip.trackId===trackId
        ?{...clip,x:0,y:.31,textStyle:{...clip.textStyle,width:.76}}:clip)})}>Portrait safe area</button>
      <label>Word highlight <input type="color" value={timeline.clips.find(clip=>clip.trackId===trackId&&clip.caption?.highlight)?.caption?.highlight??'#ffe778'}
        disabled={!cues.length||!!chosen?.locked} onChange={event=>onChange({...timeline,clips:timeline.clips.map(clip=>clip.caption&&clip.trackId===trackId
          ?{...clip,caption:{...clip.caption,highlight:event.target.value}}:clip)})}/></label>
    </div>
    <details className="hv-inspector-section">
      <summary>Find and replace</summary>
      <div className="hv-pair"><label className="hv-field">Find<input value={find} maxLength={120} onChange={event=>setFind(event.target.value)}/></label>
        <label className="hv-field">Replace with<input value={replacement} maxLength={120} onChange={event=>setReplacement(event.target.value)}/></label></div>
      <p>{matches.length} matching {matches.length===1?'cue':'cues'} {marked.length?'in the selection':'on this track'}</p>
      {matches[0]&&<p className="hv-caption-preview">{captionReplacement(matches[0].text,find,replacement)}</p>}
      <div className="hv-inline-actions"><button disabled={!matches.length} onClick={()=>{
        const corrected=new Map(captionDictionary(matches,[{find,replace:replacement}]).map(cue=>[cue.id,cue]));
        onChange({...timeline,clips:timeline.clips.map(clip=>{
          const cue=corrected.get(clip.id);return cue&&clip.caption?{...clip,title:cue.text,caption:{...clip.caption,words:cue.words}}:clip;
        })});
      }}>Apply replacement</button><button disabled={!find.trim()||!onDictionary||dictionary.length>=100} onClick={()=>
        onDictionary?.([...dictionary.filter(item=>item.find.toLowerCase()!==find.trim().toLowerCase()),{find:find.trim(),replace:replacement}])
      }>Save to dictionary</button></div>
      {dictionary.map(term=><div className="hv-inline-actions" key={term.find}><span>{term.find} → {term.replace}</span>
        <button aria-label={'Remove correction '+term.find} onClick={()=>onDictionary?.(dictionary.filter(item=>item!==term))}>×</button></div>)}
    </details>
    <div className="hv-inline-actions"><button disabled={!cues.length} onClick={()=>void exportFile('srt')}><Download fontSize="small"/> SRT</button><button disabled={!cues.length} onClick={()=>void exportFile('vtt')}>VTT</button><span>{cues.length} cues</span></div>
    <div key={trackId} className="hv-caption-list" style={{height:Math.min(430,cues.length*rowHeight)}} onScroll={e=>setScrollTop(e.currentTarget.scrollTop)}><div style={{height:cues.length*rowHeight,position:'relative'}}>{cues.slice(first,first+9).map((cue,offset)=>{const index=first+offset;
      const cps=Array.from(cue.text.replace(/\s+/g,'')).length/(cue.end-cue.start);
      return <div key={cue.id} className="hv-caption-cue" style={{position:'absolute',top:index*rowHeight,left:0,right:0,height:rowHeight}}>
      <div><button className="hv-caption-number" title="Seek to caption" onClick={()=>onSeek(cue.start)}>{index+1}</button>
        <input type="checkbox" aria-label={'Select caption '+(index+1)} checked={marked.includes(cue.id)}
          onChange={event=>setMarked(items=>event.target.checked?[...items,cue.id]:items.filter(id=>id!==cue.id))}/></div>
      <div><div className="hv-pair">{(['start','end'] as const).map(edge=><label key={edge} className="hv-field">{edge}<input type="number" min={0} step={.01} value={+cue[edge].toFixed(3)} disabled={!editable(cue.id)} onChange={e=>{
        const value=Math.max(0,Math.min(21600,Number(e.target.value)));const start=edge==='start'?Math.min(value,cue.end-1/240):cue.start,end=edge==='end'?Math.max(value,cue.start+1/240):cue.end;
        onChange({...timeline,clips:timeline.clips.map(c=>c.id===cue.id?{...c,start,duration:end-start}:c)});
      }}/></label>)}</div>
      <textarea aria-label={`Caption ${index+1} text`} value={cue.text} disabled={!editable(cue.id)} onChange={e=>onChange({...timeline,clips:timeline.clips.map(c=>c.id===cue.id?{...c,title:e.target.value.slice(0,2000),caption:{...c.caption!,words:undefined}}:c)})}/>
      <small className={cps>20?'hv-caption-fast':undefined}>{cps.toFixed(1)} chars/s{cps>20?' · Fast reading':''}{cue.text.split('\n').length>2?' · More than two lines':''}</small></div>
      <button aria-label={`Remove caption ${index+1}`} disabled={!editable(cue.id)} onClick={()=>onChange({...timeline,clips:timeline.clips.filter(c=>c.id!==cue.id)})}>×</button>
    </div>;})}</div></div>
  </div>;
}
