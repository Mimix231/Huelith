import {useMemo,useState} from 'react';
import {Button,Dialog,DialogActions,DialogContent,DialogTitle} from '@mui/material';
import {precisionEdit} from '../editor/video/precision-edit';
import {fillerCandidates,removeReviewedRange,speechGaps,suggestHighlights,transcriptRows} from '../editor/video/editorial-review';
import {durationOf,type VideoClip,type VideoRange,type VideoTimeline} from '../editor/video/timeline';
import VideoPreviewCanvas from './VideoPreviewCanvas';
import VideoLevelMeter,{type VideoMeterBus} from './VideoLevelMeter';

type Props={
  timeline:VideoTimeline;selected?:VideoClip;head:number;fps:number;width:number;height:number;
  onSeek:(time:number)=>void;onChange:(timeline:VideoTimeline)=>void;onClose:()=>void;
  onHighlights:(ranges:VideoRange[],vertical:boolean)=>void;
  onOtio?:(mode:'import'|'export')=>Promise<string>;
  onMulticam:(method:'timeline'|'waveform'|'timecode')=>Promise<void>;selectionCount:number;nativeTimecode:boolean;
  onMixer:(trackId:string,patch:Partial<VideoTimeline['tracks'][number]>,preview?:boolean)=>void;onCommit:()=>void;
  meters:VideoMeterBus;playing:boolean;onPlay:()=>void;
};
const clock=(time:number)=>Math.floor(time/60)+':'+(time%60).toFixed(2).padStart(5,'0');

export default function VideoEditorialTools(props:Props){
  const {timeline,selected,head,fps,width,height,onSeek,onChange}=props;
  const [tab,setTab]=useState('trim'),[mode,setMode]=useState<'roll'|'slip'|'slide'>('roll'),[frames,setFrames]=useState(0);
  const [query,setQuery]=useState(''),[captionTrack,setCaptionTrack]=useState(''),[chosen,setChosen]=useState(new Set<string>());
  const [phrase,setPhrase]=useState('');
  const [name,setName]=useState(''),[start,setStart]=useState(head),[end,setEnd]=useState(Math.min(durationOf(timeline),head+10));
  const [review,setReview]=useState<VideoRange>(),[error,setError]=useState('');
  const captions=useMemo(()=>transcriptRows(timeline),[timeline]);
  const captionTracks=[...new Map(captions.map(row=>[row.clip.trackId,row.language]))];
  const activeCaptionTrack=captionTrack||captionTracks[0]?.[0]||'';
  const gaps=useMemo(()=>speechGaps(timeline,activeCaptionTrack),[timeline,activeCaptionTrack]);
  const fillers=useMemo(()=>fillerCandidates(timeline,activeCaptionTrack),[timeline,activeCaptionTrack]);
  const hits=useMemo(()=>suggestHighlights(timeline,12,phrase),[timeline,phrase]);
  const trimmed=useMemo(()=>{
    if(tab!=='trim'||!selected||!frames)return {timeline,clip:selected};
    try{
      const updated=precisionEdit(timeline,selected.id,mode,frames/fps,1/fps);
      return {timeline:updated,clip:updated.clips.find(clip=>clip.id===selected.id)};
    }catch(error){return {timeline,clip:selected,error:String(error).replace(/^Error: /,'')};}
  },[timeline,selected,tab,mode,frames,fps]);
  const cut=trimmed.clip?.start??head;
  const quantize=(time:number)=>Math.round(time*fps)/fps;
  function saveRange(){
    const finish=Math.min(durationOf(timeline),quantize(end));
    if(!name.trim()||start<0||finish-quantize(start)<1/fps-1e-7){setError('Choose a range of at least one frame.');return;}
    onChange({...timeline,ranges:[...(timeline.ranges??[]),{id:crypto.randomUUID(),name:name.trim(),start:quantize(start),end:finish}]});
    setName('');setError('');
  }
  function cutRange(){
    if(!review)return;
    try{
      const from=Math.max(0,quantize(review.start)),to=Math.min(durationOf(timeline),quantize(review.end));
      onChange(removeReviewedRange(timeline,{start:from,end:to}));onSeek(from);setReview(undefined);setError('');
    }catch(error){setError(String(error));}
  }
  return <Dialog open fullWidth maxWidth="md" onClose={props.onClose}>
    <DialogTitle>Editing tools</DialogTitle>
    <DialogContent>
      <div className="hv-inline-actions hv-editorial-tabs">
        {[['trim','Precision trim'],['transcript','Transcript'],['highlights','Highlights'],['mixer','Audio mixer'],['multicam','Multicam'],
          ['ranges','Delivery ranges'],...(props.onOtio?[['otio','Interchange']]:[])].map(([id,label])=>
          <button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setError('');}}>{label}</button>)}
      </div>
      {tab==='trim'&&(selected?<div className="hv-editorial">
        <div className="hv-pair"><label className="hv-field">Edit<select value={mode} onChange={event=>setMode(event.target.value as typeof mode)}>
          <option value="roll">Roll incoming cut</option><option value="slip">Slip source</option><option value="slide">Slide between clips</option>
        </select></label><label className="hv-field">Offset (frames)<input type="number" value={frames} step={1} onChange={event=>setFrames(Math.trunc(Number(event.target.value)))}/></label></div>
        <div className="hv-pair hv-trim-view">{(mode==='slip'?[cut,Math.max(cut,cut+trimmed.clip!.duration-1/fps)]:[Math.max(0,cut-1/fps),Math.ceil((cut-1e-7)*fps)/fps]).map((time,index)=>
          <div key={index}><small>{mode==='slip'?(index?'Last frame':'First frame'):(index?'After edit point':'Before edit point')} · {clock(time)}</small>
            <div style={{aspectRatio:width/height}}><VideoPreviewCanvas timeline={trimmed.timeline} width={width} height={height}
              time={time} fps={fps} playing={false} quality={.25} onError={setError}/></div>
          </div>)}</div>
        {trimmed.error&&<p role="status">{trimmed.error}</p>}
        <Button disabled={!frames||!!trimmed.error||trimmed.timeline===timeline} onClick={()=>{onChange(trimmed.timeline);onSeek(cut);setFrames(0);}}>Apply edit</Button>
      </div>:<p>Select a clip to preview a roll, slip or slide edit.</p>)}
      {tab==='transcript'&&<div className="hv-editorial">
        {captions.length?<><div className="hv-pair">
          <label className="hv-field">Search captions<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
          <label className="hv-field">Caption track<select value={activeCaptionTrack} onChange={event=>setCaptionTrack(event.target.value)}>
            {captionTracks.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
          <div className="hv-editorial-list">{captions.filter(row=>row.clip.trackId===activeCaptionTrack&&row.text.toLowerCase().includes(query.toLowerCase())).map(row=>
            <div className="hv-inline-actions" key={row.clip.id}><button onClick={()=>onSeek(row.clip.start)}>{clock(row.clip.start)} · {row.text}</button>
              <button onClick={()=>setReview({id:row.clip.id,name:row.text,start:row.clip.start,end:row.clip.start+row.clip.duration})}>Review cut</button></div>)}</div>
          <strong>Speech gaps</strong><div className="hv-inline-actions hv-editorial-list">{gaps.map(gap=><button key={gap.id} onClick={()=>{onSeek(gap.start);setReview(gap);}}>{clock(gap.start)} · {(gap.end-gap.start).toFixed(1)} s</button>)}</div>
          {fillers.length>0&&<><strong>Filler candidates</strong><div className="hv-inline-actions hv-editorial-list">{fillers.map(word=>
            <button key={word.id} onClick={()=>{onSeek(word.start);setReview(word);}}>{clock(word.start)} · {word.name}</button>)}</div></>}
          {review&&<div className="hv-inline-actions"><span>{clock(review.start)}–{clock(review.end)} · {review.name}</span>
            <button onClick={()=>onSeek(review.start)}>Go to range</button><button onClick={cutRange}>Ripple cut range</button><button onClick={()=>setReview(undefined)}>Clear</button></div>}
        </>:<p>Import captions or generate a local transcript in the Captions tab to review cuts here.</p>}
      </div>}
      {tab==='highlights'&&<div className="hv-editorial">
        <p>Review suggested ranges from timeline markers and measured audio peaks.</p>
        <label className="hv-field">Include transcript phrase<input type="search" value={phrase} onChange={event=>{setPhrase(event.target.value);setChosen(new Set());}}/></label>
        {!hits.length&&<p>Add a timeline marker or wait for source waveform analysis.</p>}
        <div className="hv-editorial-list">{hits.map(hit=><div className="hv-inline-actions" key={hit.id}>
          <label><input type="checkbox" checked={chosen.has(hit.id)} onChange={event=>setChosen(values=>{
            const next=new Set(values);if(event.target.checked)next.add(hit.id);else next.delete(hit.id);return next;
          })}/>{hit.name}</label><button onClick={()=>onSeek(hit.start)}>{clock(hit.start)}–{clock(hit.end)}</button>
        </div>)}</div>
        <div className="hv-inline-actions"><button disabled={!chosen.size} onClick={()=>props.onHighlights(hits.filter(hit=>chosen.has(hit.id)),false)}>Create highlights sequence</button>
          <button disabled={!chosen.size} onClick={()=>props.onHighlights(hits.filter(hit=>chosen.has(hit.id)),true)}>Create portrait sequence</button></div>
      </div>}
      {tab==='ranges'&&<div className="hv-editorial">
        <label className="hv-field">Range name<input value={name} maxLength={120} onChange={event=>setName(event.target.value)}/></label>
        <div className="hv-pair">
          <label className="hv-field">In (s)<input type="number" min={0} value={start} step={1/fps} onChange={event=>setStart(Number(event.target.value))}/></label>
          <label className="hv-field">Out (s)<input type="number" min={0} value={end} step={1/fps} onChange={event=>setEnd(Number(event.target.value))}/></label>
        </div>
        <div className="hv-inline-actions"><button onClick={()=>setStart(head)}>Set In to playhead</button><button onClick={()=>setEnd(head)}>Set Out to playhead</button>
          <button disabled={!name.trim()||end<=start||start<0||end>durationOf(timeline)||(timeline.ranges?.length??0)>=128} onClick={saveRange}>Save range</button></div>
        {(timeline.ranges??[]).map(range=><div className="hv-inline-actions" key={range.id}>
          <button onClick={()=>onSeek(range.start)}>{range.name} · {clock(range.start)}–{clock(range.end)}</button>
          <button aria-label={'Remove range '+range.name} onClick={()=>onChange({...timeline,ranges:timeline.ranges?.filter(item=>item.id!==range.id)})}>×</button>
        </div>)}
      </div>}
      {tab==='otio'&&<div className="hv-editorial">
        <p>Exchange media references, gaps and cuts with OpenTimelineIO. Huelith-specific operations are listed in the export report.</p>
        <div className="hv-inline-actions">{(['import','export'] as const).map(mode=><button key={mode} onClick={()=>{
          void props.onOtio?.(mode).then(setError).catch(error=>setError(String(error)));
        }}>{mode==='import'?'Import into new sequence':'Export OTIO'}</button>)}</div>
      </div>}
      {tab==='mixer'&&<div className="hv-editorial hv-mixer">
        <div className="hv-inline-actions"><button onClick={props.onPlay}>{props.playing?'Pause mix':'Play mix'}</button>
          <VideoLevelMeter bus={props.meters}/></div>
        {timeline.tracks.filter(track=>track.kind!=='title'&&track.purpose!=='camera-angle'&&track.purpose!=='adjustment').map(track=>
          <div className="hv-mixer-channel" key={track.id}>
            <strong>{track.name}</strong><VideoLevelMeter bus={props.meters} id={track.id} name={track.name}/><span>{Math.round((track.gain??1)*100)}%</span>
            <input type="range" aria-label={track.name+' level'} min={0} max={2} step={.01} value={track.gain??1} disabled={track.locked}
              onChange={event=>props.onMixer(track.id,{gain:event.target.valueAsNumber},true)} onPointerUp={props.onCommit}
              onPointerCancel={props.onCommit} onKeyUp={props.onCommit} onBlur={props.onCommit}/>
            <label className="hv-field">Pan <input type="range" aria-label={track.name+' pan'} min={-1} max={1} step={.02} value={track.pan??0}
              disabled={track.locked} onChange={event=>props.onMixer(track.id,{pan:event.target.valueAsNumber},true)} onPointerUp={props.onCommit}
              onPointerCancel={props.onCommit} onKeyUp={props.onCommit} onBlur={props.onCommit}/></label>
            <button aria-pressed={!!track.audioSolo} disabled={track.locked} onClick={()=>props.onMixer(track.id,{audioSolo:!track.audioSolo})}>Solo audio</button>
          </div>)}
      </div>}
      {tab==='multicam'&&<div className="hv-editorial">
        <p>Select two to eight camera clips on the timeline. Align by their timeline positions or match their shared audio.</p>
        <div className="hv-inline-actions">{(['timeline','waveform','timecode'] as const).filter(method=>method!=='timecode'||props.nativeTimecode)
          .map(method=><button key={method} disabled={props.selectionCount<2||props.selectionCount>8}
            onClick={()=>{setError('');void props.onMulticam(method).catch(error=>setError(String(error)));}}>
            {method==='waveform'?'Match waveforms':method==='timecode'?'Use embedded timecode':'Use timeline alignment'}</button>)}</div>
        <small>The new sequence has an editable program track and a separate reference audio track from the first angle.</small>
      </div>}
      {error&&<p role="alert">{error}</p>}
    </DialogContent><DialogActions><Button onClick={props.onClose}>Close</Button></DialogActions>
  </Dialog>;
}
