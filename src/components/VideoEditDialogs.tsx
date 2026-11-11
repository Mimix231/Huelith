import {useEffect,useMemo,useState} from 'react';
import {Button,Dialog,DialogActions,DialogContent,DialogTitle} from '@mui/material';
import type {VideoAsset,VideoClip,VideoTimeline} from '../editor/video/timeline';
import {ATTRIBUTE_OPTIONS,replacementPatch,type ClipAttribute,type StarterLayout} from '../editor/video/working-edit';
import VideoAudioPreview from './VideoAudioPreview';
import VideoMediaThumbnail from './VideoMediaThumbnail';

type PickMediaProps={assets:VideoAsset[];sources:Record<string,string>;onClose:()=>void};
export function StartFromFootage({assets,sources,onClose,onImport,onStart}:{onImport:()=>void;onStart:(asset:VideoAsset,layout:StarterLayout)=>void}&PickMediaProps){
  const [id,setId]=useState(assets[0]?.id??''),[layout,setLayout]=useState<StarterLayout>('footage');
  const asset=assets.find(item=>item.id===id)??assets[0];
  return <Dialog open maxWidth="xs" fullWidth onClose={onClose}>
    <DialogTitle>Start from footage</DialogTitle><DialogContent>
      <p>Choose a first clip and put it at the start of the timeline.</p>
      {asset&&<><label className="hv-field">First clip<select value={asset.id} onChange={event=>setId(event.target.value)}>
        {assets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="hv-dialog-media"><VideoMediaThumbnail asset={asset} url={sources[asset.id]}/></div>
        <label className="hv-field">Layout<select value={layout} onChange={event=>setLayout(event.target.value as StarterLayout)}>
          <option value="footage">Match footage</option><option value="gameplay">Gameplay and facecam</option><option value="amv">Music edit</option><option value="short">Portrait short</option>
        </select></label></>}
    </DialogContent><DialogActions><Button onClick={onClose}>Cancel</Button><Button onClick={onImport}>Import media</Button>
      <Button variant="contained" disabled={!asset} onClick={()=>asset&&onStart(asset,layout)}>Start edit</Button>
    </DialogActions>
  </Dialog>;
}

export function ReplaceFootage({assets,sources,clip,onClose,onApply}:{clip:VideoClip;onApply:(patch:Partial<VideoClip>)=>void}&PickMediaProps){
  const [id,setId]=useState(assets[0]?.id??'');
  const asset=assets.find(item=>item.id===id);
  const result=useMemo(()=>{
    if(!asset)return;
    try{return replacementPatch(clip,asset);}catch(error){return {error:String(error)};}
  },[clip,asset]);
  return <Dialog open maxWidth="xs" fullWidth onClose={onClose}>
    <DialogTitle>Replace footage</DialogTitle><DialogContent>
      <label className="hv-field">Replacement<select value={id} onChange={event=>setId(event.target.value)}>
        {!assets.length&&<option value="">Import another compatible source first</option>}
        {assets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {asset&&<div className="hv-dialog-media">{asset.kind==='video'?<video key={id} src={sources[id]} controls preload="metadata"/>:
        asset.kind==='audio'?<audio key={id} src={sources[id]} controls preload="metadata"/>:<VideoMediaThumbnail asset={asset} url={sources[id]}/>}</div>}
      {result&&('error' in result?<p role="alert">{result.error}</p>:<p>The cut stays {clip.duration.toFixed(2)} seconds.
        {result.rate!==undefined?' The replacement plays at '+result.rate.toFixed(2)+'× to fit.':''}</p>)}
    </DialogContent><DialogActions><Button onClick={onClose}>Cancel</Button>
      <Button variant="contained" disabled={!result||'error' in result} onClick={()=>{if(result&&'patch' in result)onApply(result.patch);}}>Replace clip</Button>
    </DialogActions>
  </Dialog>;
}

export function PasteClipSettings({source,count,onClose,onPaste}:{source:string;count:number;onClose:()=>void;onPaste:(groups:ClipAttribute[])=>void}){
  const [groups,setGroups]=useState<ClipAttribute[]>(['effects','grade']);
  return <Dialog open maxWidth="xs" fullWidth onClose={onClose}><DialogTitle>Paste clip settings</DialogTitle>
    <DialogContent><p>Copy from <strong>{source}</strong> to {count} selected {count===1?'clip':'clips'}.</p>
      <div className="hv-editorial">{ATTRIBUTE_OPTIONS.map(([key,label])=><label key={key} className="hv-source-favorite">
        <input type="checkbox" checked={groups.includes(key)} onChange={event=>setGroups(previous=>event.target.checked?[...previous,key]:previous.filter(group=>group!==key))}/>{label}
      </label>)}</div>
    </DialogContent><DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!groups.length||!count}
      onClick={()=>onPaste(groups)}>Paste checked settings</Button></DialogActions>
  </Dialog>;
}

export function AuditionSoundtrack({timeline,sources,start,end,count,onClose,onApply}:{timeline:VideoTimeline;sources:Record<string,string>;
  start:number;end:number;count:number;onClose:()=>void;onApply:()=>void}){
  const [playing,setPlaying]=useState(false),[head,setHead]=useState(start);
  useEffect(()=>{
    if(!playing)return;
    let first:number|undefined;
    let frame=requestAnimationFrame(tick);
    function tick(stamp:number){
      first??=stamp;
      const time=start+(stamp-first)/1000;
      setHead(Math.min(time,end));
      if(time>=end)setPlaying(false);else frame=requestAnimationFrame(tick);
    }
    return()=>cancelAnimationFrame(frame);
  },[playing,start,end]);
  function toggle(){
    if(playing){setPlaying(false);return;}
    setHead(start);setPlaying(true);
  }
  // The isolated audio preview follows the proposed source cuts.
  return <Dialog open maxWidth="xs" fullWidth onClose={onClose}><DialogTitle>Fit music to range</DialogTitle>
    <DialogContent><p>{count} editable {count===1?'section':'sections'} across {(end-start).toFixed(2)} seconds, with short edge fades.</p>
      <VideoAudioPreview timeline={timeline} sources={sources} time={head} playing={playing}/>
      <div className="hv-inline-actions"><button onClick={toggle}>{playing?'Stop preview':'Play music preview'}</button>
        <span>{(head-start).toFixed(1)} / {(end-start).toFixed(1)} s</span></div>
    </DialogContent><DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={onApply}>Use these cuts</Button></DialogActions>
  </Dialog>;
}
