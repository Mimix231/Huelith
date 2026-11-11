import { useRef, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import type { VideoAsset,VideoSourceSelect } from '../editor/video/timeline';
import VideoMediaThumbnail from './VideoMediaThumbnail';
import VideoSourceTransport from './VideoSourceTransport';

type Props = {
  asset: VideoAsset;
  url?: string;
  onClose: () => void;
  onSave: (asset: VideoAsset) => void;
  onInsert: (asset: VideoAsset,mode?:'insert'|'overwrite'|'selects') => boolean|void;
  onRecordingTool?:(mode:'proxy'|'streams'|'voice')=>void;
  proxy?:boolean;
};

export default function VideoSourceViewer({ asset, url, onClose, onSave, onInsert,onRecordingTool,proxy }: Props) {
  const [bin, setBin] = useState(asset.bin ?? '');
  const [tags, setTags] = useState(asset.tags?.join(', ') ?? '');
  const [favorite, setFavorite] = useState(!!asset.favorite);
  const [markIn, setMarkIn] = useState(asset.sourceRange?.in ?? 0);
  const [markOut, setMarkOut] = useState(asset.sourceRange?.out ?? asset.duration);
  const [selects,setSelects]=useState<VideoSourceSelect[]>(asset.selects??[]);
  const [selectName,setSelectName]=useState('');
  const media = useRef<HTMLMediaElement | null>(null);
  const still = asset.kind === 'image';
  const valid = still || markIn >= 0 && markOut <= asset.duration && markOut - markIn >= .1 - 1e-6;

  function finish(mode?:'insert'|'overwrite'|'selects'|'place') {
    if (!valid) return;
    const updated: VideoAsset = {
      ...asset, bin: bin.trim() || undefined, favorite,
      tags: [...new Set(tags.split(',').map(tag => tag.trim().slice(0, 48)).filter(Boolean))].slice(0, 32),
      sourceRange: still ? undefined : { in: markIn, out: markOut },
      selects: selects.length ? selects : undefined,
    };
    media.current?.pause();
    if (mode) {
      if(onInsert(updated,mode==='place'?undefined:mode)===false)return;
    }
    else onSave(updated);
    onClose();
  }

  return <Dialog open onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>Source viewer</DialogTitle>
    <DialogContent>
      <div className="hv-source-viewer">
        <strong>{asset.name}</strong>
        <small>{asset.kind} · {asset.duration.toFixed(2)} s{asset.width && asset.height ? ` · ${asset.width} × ${asset.height}` : ''}</small>
        {url&&(still?<VideoMediaThumbnail asset={asset} url={url}/>:
          <VideoSourceTransport key={url} asset={asset} url={url} media={media}/>)}
        {!url && <small>Source is offline. Relink this media to preview it.</small>}
        {url&&onRecordingTool&&!still&&<div className="hv-inline-actions">
          {asset.kind==='video'&&<button aria-pressed={!!proxy} onClick={()=>onRecordingTool('proxy')}>{proxy?'Use original preview':'Build preview proxy'}</button>}
          <button onClick={()=>onRecordingTool('streams')}>Add recording audio streams</button>
          <button onClick={()=>onRecordingTool('voice')}>Add cleaned voice take</button>
        </div>}
        {!still && <>
          <div className="hv-pair">
            <label className="hv-field">Source In (s)<input type="number" min={0} max={asset.duration} step={.001}
              value={markIn} onChange={event => setMarkIn(event.target.valueAsNumber || 0)} /></label>
            <label className="hv-field">Source Out (s)<input type="number" min={0} max={asset.duration} step={.001}
              value={markOut} onChange={event => setMarkOut(event.target.valueAsNumber || 0)} /></label>
          </div>
          <div className="hv-inline-actions">
            <button disabled={!url} onClick={() => setMarkIn(Math.min(asset.duration, media.current?.currentTime ?? 0))}>Mark In</button>
            <button disabled={!url} onClick={() => setMarkOut(Math.min(asset.duration, media.current?.currentTime ?? 0))}>Mark Out</button>
            <button onClick={() => { setMarkIn(0); setMarkOut(asset.duration); }}>Full source</button>
            <button disabled={!url || !valid} onClick={() => {
              const element = media.current;
              if (!element) return;
              element.currentTime = markIn;
              const stop = () => {
                if (element.currentTime >= markOut) { element.pause(); element.removeEventListener('timeupdate', stop); }
              };
              element.addEventListener('timeupdate', stop);
              void element.play().catch(() => element.removeEventListener('timeupdate', stop));
            }}>Play range</button>
          </div>
          <small>{valid ? `${(markOut - markIn).toFixed(2)} s selected` : 'Choose at least 0.1 seconds inside the source.'}</small>
          <div className="hv-inline-actions">
            <input aria-label="Name source selection" placeholder="Name this range" value={selectName} maxLength={120} onChange={event=>setSelectName(event.target.value)}/>
            <button disabled={!valid||!selectName.trim()||selects.length>=128} onClick={()=>{
              setSelects(items=>[...items,{id:crypto.randomUUID(),name:selectName.trim(),in:markIn,out:markOut}]);setSelectName('');
            }}>Save range</button>
          </div>
          {selects.map((item,index)=><div className="hv-inline-actions" key={item.id}>
            <button onClick={()=>{setMarkIn(item.in);setMarkOut(item.out);if(media.current)media.current.currentTime=item.in;}}>
              {item.name} · {item.in.toFixed(2)}–{item.out.toFixed(2)} s</button>
            <button disabled={!index} aria-label={`Move ${item.name} up`} onClick={()=>setSelects(items=>{
              const next=[...items];[next[index-1],next[index]]=[next[index],next[index-1]];return next;
            })}>↑</button>
            <button aria-label={`Remove ${item.name}`} onClick={()=>setSelects(items=>items.filter(range=>range.id!==item.id))}>×</button>
          </div>)}
        </>}
        <label className="hv-field">Bin<input value={bin} maxLength={80} placeholder="e.g. Episode 1" onChange={event => setBin(event.target.value)} /></label>
        <label className="hv-field">Tags (comma separated)<input value={tags} maxLength={1024} onChange={event => setTags(event.target.value)} /></label>
        <label className="hv-source-favorite"><input type="checkbox" checked={favorite} onChange={event => setFavorite(event.target.checked)} /> Favourite</label>
        {asset.credit && <p>{asset.credit.creator} · <a href={asset.credit.sourceUrl} target="_blank" rel="noreferrer">Recording source</a> · <a href={asset.credit.licenseUrl} target="_blank" rel="noreferrer">{asset.credit.license}</a></p>}
      </div>
    </DialogContent>
    <DialogActions sx={{flexWrap:'wrap'}}><Button onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={() => finish()}>Save details</Button>
      {selects.length>0&&<Button disabled={!valid||!url} onClick={()=>finish('selects')}>Assemble selects</Button>}
      <Button disabled={!valid||!url} onClick={()=>finish('overwrite')}>Overwrite lane</Button>
      <Button disabled={!valid||!url} onClick={()=>finish('insert')}>Insert and ripple</Button>
      <Button variant="contained" disabled={!valid || !url} onClick={() => finish('place')}>Place at playhead</Button></DialogActions>
  </Dialog>;
}
