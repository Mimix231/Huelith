import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress } from '@mui/material';
import { analyzeFootage, footagePoster, MAX_ANALYSIS_SECONDS, type FootageJob } from '../editor/video/smart-analysis';
import { sourceBounds } from '../editor/video/clip-timing';
import type { SmartFootage } from '../editor/video/smart-footage';
import type { CropRegion } from '../editor/video/studio-types';
import type { VideoAsset, VideoClip } from '../editor/video/timeline';

const LABELS: Record<FootageJob,string> = {
  stabilize: 'Stabilize camera motion', track: 'Track subject',
  reframe: 'Auto reframe', cutout: 'Remove background',
};
const defaultBox: CropRegion = { x: .23, y: .14, width: .54, height: .72 };

type Props = { asset: VideoAsset; clip: VideoClip; onApply: (value?: SmartFootage) => void; showGuide: boolean; onGuide: () => void;
  section?:'background'|'retouch' };

export default function VideoFootageTools({asset,clip,onApply,showGuide,onGuide,section}:Props) {
  const [job, setJob] = useState<FootageJob>();
  const [poster, setPoster] = useState('');
  const [box, setBox] = useState<CropRegion>(defaultBox);
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState('');
  const task = useRef<AbortController | undefined>(undefined);
  const gesture = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const smart = clip.smart?.revision === (asset.revision ?? 0) ? clip.smart : undefined;
  const [start, end] = sourceBounds(clip);
  const allowed = end - start <= MAX_ANALYSIS_SECONDS;
  useEffect(() => () => task.current?.abort(), []);

  function begin(kind: FootageJob) {
    task.current?.abort();
    setError(''); setJob(kind); setPoster(''); setProgress(undefined);
    setBox(smart?.track?.box ?? defaultBox);
    if (kind === 'stabilize') return;
    const controller = new AbortController();
    task.current = controller;
    void footagePoster(asset, clip, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setPoster(result.url);
      if (!smart?.track && result.box) setBox(result.box);
    }).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
  }

  function close() {
    task.current?.abort();
    task.current = undefined;
    setJob(undefined);
    setProgress(undefined);
  }

  async function run() {
    if (!job || progress !== undefined) return;
    task.current?.abort();
    const controller = new AbortController();
    task.current = controller;
    setError(''); setProgress(0);
    try {
      const updated = await analyzeFootage(asset,clip,job,job === 'stabilize' ? undefined : box,controller.signal,setProgress);
      controller.signal.throwIfAborted();
      onApply(updated);
      close();
    } catch (error) {
      if (!controller.signal.aborted) { setError(String(error)); setProgress(undefined); }
    }
  }

  function position(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
      y: Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)) };
  }

  return <div className="hv-footage-actions">
    <div className="hv-inline-actions">{(Object.keys(LABELS) as FootageJob[]).filter(kind=>!section||(section==='background')===(kind==='cutout'))
      .map(kind => <button key={kind} disabled={!allowed} onClick={() => begin(kind)}>{LABELS[kind]}</button>)}</div>
    {!allowed && <small>Trim or split to a source range of up to {MAX_ANALYSIS_SECONDS} seconds for analysis.</small>}
    {section!=='background'&&smart?.track&&<button aria-pressed={showGuide} onClick={onGuide}>{showGuide?'Hide track guide':'Show track guide'}</button>}
    {section!=='background'&&smart?.track&&!smart.reframe&&<button onClick={()=>onApply({...smart,reframe:true})}>Reframe using track</button>}
    {section!=='background'&&smart?.stabilization&&<button onClick={()=>onApply({...smart,stabilization:undefined})}>Remove stabilization</button>}
    {section!=='background'&&smart?.reframe&&<button onClick={()=>onApply({...smart,reframe:false})}>Remove reframe</button>}
    {section!=='retouch'&&smart?.matte&&<button onClick={()=>onApply({...smart,matte:undefined})}>Restore background</button>}
    <Dialog open={!!job} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{job ? LABELS[job] : 'Footage analysis'}</DialogTitle>
      <DialogContent>
        <div className="hv-footage-dialog">
          {job === 'stabilize' ? <p>Analyze camera shake in the selected source range. Huelith will smooth the camera path and crop the edges to keep the frame filled.</p>
            : <p>Draw a box around the subject in the first frame. Keep the full subject inside the box, with a little room around the edges.</p>}
          {job && job !== 'stabilize' && (poster ? <div className="hv-footage-poster">
            <img src={poster} alt="First frame of the selected source range" draggable={false} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Draw tracking region"
              onPointerDown={event => {
                if (event.button !== 0 || progress !== undefined) return;
                gesture.current = { pointer: event.pointerId, ...position(event) };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={event => {
                const from = gesture.current;
                if (from?.pointer !== event.pointerId) return;
                const point = position(event);
                const width = Math.abs(point.x-from.x), height = Math.abs(point.y-from.y);
                if (width >= .04 && height >= .04) setBox({ x:Math.min(point.x,from.x),y:Math.min(point.y,from.y),width,height });
              }}
              onLostPointerCapture={() => { gesture.current = null; }}>
              <rect x={box.x*100} y={box.y*100} width={box.width*100} height={box.height*100}
                fill="#71e7cb27" stroke="#71e7cb" vectorEffect="non-scaling-stroke" />
            </svg>
          </div> : !error && <LinearProgress aria-label="Loading first source frame"/>)}
          {progress !== undefined && <><LinearProgress variant="determinate" value={progress*100}/><small>{Math.round(progress*100)}% of source range analyzed</small></>}
          {error && <Alert severity="error">{error}</Alert>}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{progress === undefined ? 'Close' : 'Cancel analysis'}</Button>
        <Button variant="contained" disabled={!job || progress !== undefined || job !== 'stabilize' && !poster} onClick={() => void run()}>Analyze and apply</Button>
      </DialogActions>
    </Dialog>
  </div>;
}
