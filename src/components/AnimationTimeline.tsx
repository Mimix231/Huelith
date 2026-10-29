import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Delete, ContentCopy, Add, PlayArrow, Pause, SkipNext, SkipPrevious, Layers } from '@mui/icons-material';
import { activeTab, useEditor } from '../editor/store';
import { frameDocument } from '../editor/animation';
import { timelineRegionAt, timelineRegionOffset } from '../editor/playback-clock';
import { setAnimationPlayback } from '../editor/fx';
import { drawDocument, prepareImages } from '../editor/render';
import type { Document, AnimationFrame } from '../editor/types';
import '../styles/animation.css';

const CELL = 80;

const FramePreview = memo(function FramePreview({ doc, frame, index }: {
  doc: Document;
  frame: AnimationFrame;
  index: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setVisible(true);
    }, { rootMargin: '140px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const frame = frameDocument(doc, index);
    let active = true;
    void prepareImages(frame).then(() => {
      if (!active) return;
      ctx.setTransform(canvas.width / doc.width, 0, 0, canvas.height / doc.height, 0, 0);
      drawDocument(ctx, frame);
    }).catch(() => {
      if (active) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    return () => { active = false; };
  }, [frame, index, visible, doc.width, doc.height, doc.background, doc.animation?.trackEffects, doc.animation?.trackGradients,
    frame.holdFrom && doc.updatedAt]);

  return <canvas ref={ref} width={60} height={38} className="timeline-preview" aria-hidden="true" />;
}, (previous, next) => previous.frame === next.frame && previous.index === next.index
    && previous.doc.animation?.trackEffects === next.doc.animation?.trackEffects
    && previous.doc.animation?.trackGradients === next.doc.animation?.trackGradients
    && previous.doc.width === next.doc.width && previous.doc.height === next.doc.height
    && previous.doc.background === next.doc.background
    && (!previous.frame.holdFrom && !next.frame.holdFrom || previous.doc.updatedAt===next.doc.updatedAt));

export default function AnimationTimeline() {
  const doc = useEditor(state => activeTab(state).doc);
  const animation = doc.animation;
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<'frames'|'layers'>('layers');
  const [selectedFrames,setSelectedFrames]=useState<number[]>([]);
  const [anchorFrame,setAnchorFrame]=useState(0);
  const [batchDuration,setBatchDuration]=useState(100);
  const [gridOffset,setGridOffset]=useState(0);
  const [gridWidth,setGridWidth]=useState(900);
  const gridRef=useRef<HTMLDivElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const clock = useRef({ frames: animation?.frames, rate: playbackRate, current: animation?.currentFrame ?? 0 });
  clock.current = {frames: animation?.frames, rate: playbackRate, current: animation?.currentFrame ?? 0};
  const selectedCreativeId = useEditor(state => state.selectedCreativeId);
  const [expanded, setExpanded] = useState(true);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastDocument = useRef(doc.id);

  useEffect(() => {
    setAnimationPlayback(playing);
    return () => setAnimationPlayback(false);
  }, [playing, doc.id]);

  useEffect(() => {
    if (lastDocument.current !== doc.id) {
      setPlaying(false);
      lastDocument.current = doc.id;
    }
  }, [doc.id]);

  useEffect(() => {
    if (playing || !animation || animation.frames.length<2) return;
    // Browser idle callback: predecode three upcoming cels so the playhead
    // doesn't encounter an uninitialized image/mask on its first loop. Never
    // run synchronous high-resolution FX work inside a playback RAF tick.
    let cancelled=false;
    const upcoming=Array.from({length:Math.min(3,animation.frames.length-1)},(_,i)=>(animation.currentFrame+i+1)%animation.frames.length);
    let next=0, task=0;
    const schedule=()=>{
      if(cancelled||next>=upcoming.length)return;
      // Some TS DOM versions narrow window to `never` in this feature branch.
      // Use an optional method check on a structural window view instead.
      const idle=(globalThis as typeof globalThis & {requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions)=>number}).requestIdleCallback;
      if(typeof idle === 'function')task=idle(()=>{void run();},{timeout:1500});
      else task=globalThis.setTimeout(()=>{void run();},120) as unknown as number;
    };
    const run=async()=>{
      if(cancelled)return;
      const frame=frameDocument(doc,upcoming[next++]);
      try{await prepareImages(frame);}catch{/* Missing images do not prevent editing. */}
      schedule();
    };
    schedule();
    return()=>{cancelled=true;const cancelIdle=(globalThis as typeof globalThis & {cancelIdleCallback?:(handle:number)=>void}).cancelIdleCallback;
      if(typeof cancelIdle==='function')cancelIdle(task);else globalThis.clearTimeout(task);};
  },[playing,doc.id,doc.updatedAt,animation?.currentFrame,animation?.frames.length]);

  useEffect(() => {
    if (!playing || !clock.current.frames?.length) return;
    // Monotonic clock: use elapsed time, not a setTimeout per frame. Expensive
    // FX rendering can delay paints, but will never accumulate timeline drift.
    const started = performance.now();
    const region=activeTab(useEditor.getState()).doc.animation?.playback??{
      mode:'loop' as const,start:0,end:(clock.current.frames?.length??1)-1};
    const anchor = timelineRegionOffset(clock.current.frames,
      Math.max(region.start,Math.min(region.end,clock.current.current)),region);
    let running = true;
    let request = 0;
    const animate = (now: number): void => {
      if (!running) return;
      const frames = clock.current.frames;
      if (!frames?.length) return;
      const result = timelineRegionAt(frames, anchor + (now - started) * clock.current.rate,region);
      const desired=result.frame;
      const store = useEditor.getState();
      if (activeTab(store).doc.id !== doc.id) return;
      if (activeTab(store).doc.animation?.currentFrame !== desired) store.setActiveFrame(desired);
      if(result.completed){setPlaying(false);return;}
      request = requestAnimationFrame(animate);
    };
    request = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(request); };
  }, [playing, doc.id, playbackRate, animation?.playback?.mode, animation?.playback?.start, animation?.playback?.end]);

  useEffect(() => {
    if (animation && animation.frames.length < 2) setPlaying(false);
  }, [animation?.frames.length]);

  useEffect(() => {
    const rail = trackRef.current;
    if (!rail || !animation || draggingPlayhead) return;
    const markerX = animation.currentFrame * CELL + CELL / 2;
    if (markerX < rail.scrollLeft + 18) rail.scrollLeft = Math.max(0, markerX - CELL);
    if (markerX > rail.scrollLeft + rail.clientWidth - 18) {
      rail.scrollLeft = markerX - rail.clientWidth + CELL;
    }
  }, [animation?.currentFrame, draggingPlayhead]);

  if (!animation) return null;

  const { frames, currentFrame, onion } = animation;
  const region=animation.playback??{mode:'loop' as const,start:0,end:frames.length-1};
  const chosen=selectedFrames.filter(index=>index>=0&&index<frames.length);
  const sheetLayers=doc.layers.flatMap(layer => layer.type==='group'? [layer,...layer.children]:[layer]);
  const firstVisible=Math.max(0,Math.floor(gridOffset/CELL)-3);
  const lastVisible=Math.min(frames.length,Math.ceil((gridOffset+gridWidth)/CELL)+4);
  const pickFrame=(index:number,shift=false,toggle=false):void=>{
    setPlaying(false);
    if(shift){const start=Math.min(anchorFrame,index),end=Math.max(anchorFrame,index);
      setSelectedFrames(Array.from({length:end-start+1},(_,i)=>start+i));}
    else if(toggle){setSelectedFrames(prev=>prev.includes(index)?prev.filter(i=>i!==index):[...prev,index]);setAnchorFrame(index);}
    else{setSelectedFrames([index]);setAnchorFrame(index);}
    useEditor.getState().setActiveFrame(index);
  };
  const positionFromEvent = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || !trackRef.current) return currentFrame;
    const relative = event.clientX - bounds.left + trackRef.current.scrollLeft;
    return Math.max(0, Math.min(frames.length - 1, Math.floor(relative / CELL)));
  };
  const select = (index: number): void => {
    setPlaying(false);
    pickFrame(index);
  };
  const updateScrub = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const index = positionFromEvent(event);
    if (index !== useEditor.getState().tabs.find(tab => tab.doc.id === doc.id)?.doc.animation?.currentFrame) {
      useEditor.getState().setActiveFrame(index);
    }
  };

  return (
    <section className={`animation-timeline ${expanded ? 'expanded' : 'collapsed'}`} aria-label="Animation frame timeline">
      <div className="timeline-header">
        <button type="button" className="timeline-name" onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded} title={expanded ? 'Collapse timeline' : 'Expand timeline'}>
          <span className="timeline-symbol">▦</span> Frames <span className="timeline-chevron">{expanded ? '▾' : '▴'}</span>
        </button>
        <div className="timeline-playback">
          <button type="button" title="Previous frame" aria-label="Previous frame" onClick={() => select(Math.max(0, currentFrame - 1))}><SkipPrevious fontSize="small" /></button>
          <button type="button" className={playing ? 'timeline-playing' : ''}
            title={playing ? 'Pause animation' : 'Play animation'} aria-label={playing ? 'Pause animation' : 'Play animation'}
            onClick={() => setPlaying(!playing)}>
            {playing ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
          </button>
          <button type="button" title="Next frame" aria-label="Next frame" onClick={() => select(Math.min(frames.length - 1, currentFrame + 1))}><SkipNext fontSize="small" /></button>
          <label className="timeline-compact-field" title="Playback preview speed, independent of frame durations">
            Speed <select aria-label="Playback speed" value={playbackRate} onChange={event => setPlaybackRate(Number(event.target.value))}>
              {[0.25, 0.5, 1, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </label>
          <div className="timeline-view-toggle" role="group" aria-label="Timeline view">
            <button type="button" className={view==='frames'?'active':''} aria-pressed={view==='frames'} onClick={()=>setView('frames')}>◫</button>
            <button type="button" className={view==='layers'?'active':''} aria-pressed={view==='layers'} onClick={()=>setView('layers')}>▤ Layers</button>
          </div>
          <button type="button" title="Open keyframe editor for Huelith Originals" onClick={() => useEditor.getState().setCreativePanelOpen(true)}>◇ Keys</button>
          {doc.activeLayerId && Boolean(animation.trackEffects?.[doc.activeLayerId]?.length) &&
            <span className="timeline-shared-fx" title="This layer’s Creativity, Effects and FX settings persist across all animation frames">FX ∞ · {animation.trackEffects![doc.activeLayerId].length}</span>}
          <span className="timeline-position" aria-live="off">{String(currentFrame + 1).padStart(2, '0')} / {String(frames.length).padStart(2, '0')}</span>
        </div>
        <div className="timeline-options">
          <label title="Animation playback rate" className="timeline-compact-field">
            FPS <input type="number" min={1} max={60} aria-label="Animation FPS" value={animation.fps}
              onChange={event => useEditor.getState().setAnimationFps(Number(event.target.value))} />
          </label>
          <button type="button" className={onion.enabled ? 'timeline-onion active' : 'timeline-onion'}
            title="Toggle onion skin ghost frames" aria-pressed={onion.enabled}
            onClick={() => useEditor.getState().setOnion({ enabled: !onion.enabled })}>🧅 Onion</button>
          <label className="timeline-compact-field" title="Previous ghost frames">Prev
            <select aria-label="Previous ghost frames" value={onion.previous}
              onChange={event => useEditor.getState().setOnion({ previous: Number(event.target.value) })}>
              {[0, 1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="timeline-compact-field" title="Following ghost frames">Next
            <select aria-label="Next ghost frames" value={onion.next}
              onChange={event => useEditor.getState().setOnion({ next: Number(event.target.value) })}>
              {[0, 1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="timeline-compact-field" title="Ghost opacity">Ghost
            <input type="range" aria-label="Ghost opacity" min={0} max={100} value={Math.round(onion.opacity * 100)}
              onChange={event => useEditor.getState().setOnion({ opacity: Number(event.target.value) / 100 })} />
          </label>
        </div>
        <div className="timeline-loop-options">
          <select aria-label="Playback behavior" title="Playback mode" value={region.mode}
            onChange={event=>useEditor.getState().setPlaybackRegion({mode:event.target.value as typeof region.mode})}>
            <option value="loop">↻ Loop</option><option value="pingpong">⇄ Ping-pong</option><option value="once">▶ Once</option>
          </select>
          <label>In <input aria-label="Loop start frame" type="number" min={1} max={frames.length}
            value={region.start+1} onChange={event=>useEditor.getState().setPlaybackRegion({start:Number(event.target.value)-1})}/></label>
          <label>Out <input aria-label="Loop end frame" type="number" min={1} max={frames.length}
            value={region.end+1} onChange={event=>useEditor.getState().setPlaybackRegion({end:Number(event.target.value)-1})}/></label>
        </div>
        <div className="timeline-actions">
          <button type="button" title="Add blank frame" aria-label="Add blank frame" onClick={() => { setPlaying(false); useEditor.getState().appendFrame(false); }}><Add fontSize="small" /> Frame</button>
          <button type="button" title="Duplicate selected frame" aria-label="Duplicate frame" onClick={() => { setPlaying(false); useEditor.getState().appendFrame(true); }}><ContentCopy fontSize="small" /></button>
          <button type="button" title="Delete selected frame" aria-label="Delete frame" disabled={frames.length < 2}
            onClick={() => { setPlaying(false); useEditor.getState().deleteActiveFrame(); }}><Delete fontSize="small" /></button>
        </div>
      </div>
      {expanded && <>
        <div className="timeline-ruler-scroll" ref={trackRef}
          onPointerDown={event => {
            if (event.button !== 0 || (event.target as HTMLElement).closest('.timeline-frame-card')) return;
            setPlaying(false);
            setDraggingPlayhead(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            updateScrub(event);
          }}
          onPointerMove={event => { if (draggingPlayhead) updateScrub(event); }}
          onPointerUp={event => { setDraggingPlayhead(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => setDraggingPlayhead(false)}>
          <div className="timeline-track" style={{ width: frames.length * CELL }}>
            <div className="timeline-range-highlight" style={{left:region.start*CELL,width:(region.end-region.start+1)*CELL}} />
            <div className="timeline-ruler" aria-label="Drag to scrub frames">
              {frames.map((frame, index) => <span key={frame.id} style={{ left: index * CELL + CELL / 2 }}>{index + 1}</span>)}
              <div className="timeline-playhead" style={{ left: currentFrame * CELL + CELL / 2 }} aria-hidden="true"><span className="timeline-marker">▼</span></div>
            </div>
            <div className="timeline-frames" role="group" aria-label="Animation frames">
              {frames.map((frame, index) => (
                <button type="button" key={frame.id}
                  className={`timeline-frame-card ${index === currentFrame ? 'selected' : ''} ${chosen.includes(index)?'timeline-multi-selected':''}`}
                  aria-pressed={index === currentFrame} aria-label={`Frame ${index + 1}, ${frame.durationMs} milliseconds`}
                  title={`Frame ${index + 1} · ${frame.durationMs}ms · drag to reorder`}
                  draggable={!draggingPlayhead}
                  onDragStart={event => { event.dataTransfer.setData('application/x-huelith-frame', String(index)); event.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={event => { if (event.dataTransfer.types.includes('application/x-huelith-frame')) event.preventDefault(); }}
                  onDrop={event => {
                    const source = Number(event.dataTransfer.getData('application/x-huelith-frame'));
                    if (Number.isInteger(source)) {
                      event.preventDefault();
                      setPlaying(false);
                      useEditor.getState().reorderAnimationFrames(source, index);
                    }
                  }}
                  onClick={event => pickFrame(index,event.shiftKey,event.ctrlKey||event.metaKey)}
                  onKeyDown={event => {
                    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1
                      : event.key === 'PageUp' ? -10 : event.key === 'PageDown' ? 10 : 0;
                    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
                    event.preventDefault();
                    const destination = event.key === 'Home' ? 0 : event.key === 'End' ? frames.length - 1
                      : Math.max(0, Math.min(frames.length - 1, index + delta));
                    select(destination);
                    // Keyboard scrubbing keeps focus inside the timeline.
                    const rail = trackRef.current;
                    rail?.querySelectorAll<HTMLButtonElement>('.timeline-frame-card')[destination]?.focus({ preventScroll: true });
                  }}>
                  <FramePreview doc={doc} frame={frame} index={index} />
                  {doc.creative?.some(item => item.id === selectedCreativeId &&
                    Object.values(item.tracks ?? {}).some(keys => keys.some(key => key.frame === index))) &&
                    <span className="timeline-creative-key" title="Huelith Originals keyframe">◆</span>}
                  <span className="timeline-frame-duration">{index + 1} · {frame.durationMs}ms</span>
                  {frame.label && <span className="timeline-frame-tag" title={frame.label}>{frame.label}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
        {view==='layers' && <div className="timeline-layer-sheet" aria-label="Layer-based animation exposure sheet">
          <div className="timeline-sheet-scroll" ref={gridRef} onScroll={event=>{
            setGridOffset(event.currentTarget.scrollLeft);setGridWidth(event.currentTarget.clientWidth);
          }}>
            <div className="timeline-sheet-grid" style={{width:152+frames.length*CELL}}>
              <div className="timeline-sheet-row timeline-sheet-top" style={{height:27}}>
                <span className="timeline-sheet-layer-name">◈ Drawing layers</span>
                {frames.slice(firstVisible,lastVisible).map((frame,i)=><button type="button" key={frame.id}
                  className={`timeline-sheet-frame-head ${chosen.includes(i+firstVisible)?'active':''}`}
                  style={{left:152+(i+firstVisible)*CELL}}
                  title={`Frame ${i+firstVisible+1} · Shift/Ctrl select multiple`}
                  onClick={event=>pickFrame(i+firstVisible,event.shiftKey,event.ctrlKey||event.metaKey)}>{i+firstVisible+1}</button>)}
              </div>
              {sheetLayers.map(layer=><div className="timeline-sheet-row" key={layer.id}>
                <button type="button" className={`timeline-sheet-layer-name ${doc.activeLayerId===layer.id?'active':''}`}
                  title={layer.name} onClick={()=>useEditor.getState().selectLayer(layer.id)}>
                  <span>{layer.type==='raster'?'◧':layer.type==='vector'?'◇':layer.type==='gradient'?'◈':'▦'}</span>
                  <span className="timeline-name-clip">{layer.name}</span>
                  <span className="timeline-layer-fx">{animation.trackEffects?.[layer.id]?.length?'✦':''}</span>
                </button>
                {frames.slice(firstVisible,lastVisible).map((frame,i)=>{
                  const index=firstVisible+i;
                  const own=frame.layers.find(item=>item.id===layer.id);
                  const hold=frame.holdFrom?.[layer.id];
                  const drawn=own?.type==='raster'?Boolean(own.image):own?.type==='vector'?own.shapes.length>0:own?.type==='gradient';
                  return <button type="button" key={frame.id} style={{left:152+index*CELL}}
                    className={`timeline-sheet-cel ${hold?'held':drawn?'drawn':'empty'} ${currentFrame===index&&doc.activeLayerId===layer.id?'active':''} ${chosen.includes(index)?'multi':''}`}
                    aria-label={`${layer.name} frame ${index+1}: ${hold?'held drawing':drawn?'drawing':'empty'}`}
                    title={hold?'Held exposure · Alt-click to release':drawn?'Drawing cel · Alt-click to hold previous':'Empty cel · Alt-click to hold previous'}
                    onClick={event=>{
                      if(event.altKey){useEditor.getState().setAnimationHold(index,layer.id,!hold);return;}
                      pickFrame(index,event.shiftKey,event.ctrlKey||event.metaKey);
                      useEditor.getState().selectLayer(layer.id);
                    }}
                    onContextMenu={event=>{
                      event.preventDefault();useEditor.getState().setAnimationHold(index,layer.id,!hold);
                    }}>
                    {hold?'▰':drawn?'◆':'·'}
                  </button>;
                })}
              </div>)}
            </div>
          </div>
          <div className="timeline-cel-help">Click a cel to edit · Alt-click/right-click to hold or release · Shift/Ctrl selects multiple frames · FX stay on their layer</div>
        </div>}
        <div className="timeline-editbar">
          <label className="timeline-tag-input">Label <input aria-label="Selected frame label" maxLength={120} placeholder="Frame note"
            value={frames[currentFrame]?.label??''} onChange={event=>useEditor.getState().setAnimationFrameLabel(currentFrame,event.target.value)} /></label>
          <span>{chosen.length>1?`${chosen.length} selected frames`:'Frame tools'}</span>
          <button type="button" onClick={()=>useEditor.getState().duplicateAnimationFrames(chosen.length?chosen:[currentFrame])}>⧉ Duplicate selected</button>
          <label className="timeline-batch-time">Duration <input type="number" aria-label="Batch frame duration" value={batchDuration} min={16} max={60000}
            onChange={event=>setBatchDuration(Math.max(16,Math.min(60000,+event.target.value||16)))}/></label>
          <button type="button" onClick={()=>useEditor.getState().setAnimationFrameDurations(chosen.length?chosen:[currentFrame],batchDuration)}>Apply timing</button>
          <button type="button" disabled={!doc.activeLayerId || !chosen.some(index=>index>0)}
            title="Link selected cells to preceding drawings; editing a held cell makes an independent copy"
            onClick={()=>{if(doc.activeLayerId)useEditor.getState().setAnimationHolds(chosen.length?chosen:[currentFrame],doc.activeLayerId,true);}}>▰ Hold selected</button>
          <button type="button" disabled={!doc.activeLayerId}
            title="Make selected held drawings independent"
            onClick={()=>{if(doc.activeLayerId)useEditor.getState().setAnimationHolds(chosen.length?chosen:[currentFrame],doc.activeLayerId,false);}}>◇ Release holds</button>
          <button type="button" disabled={frames.length<2} title="Delete the selected frames; retain at least one frame"
            onClick={()=>{setPlaying(false);useEditor.getState().deleteAnimationFrames(chosen.length?chosen:[currentFrame]);setSelectedFrames([]);}}>⌫ Delete selected</button>
          <button type="button" disabled={!doc.activeLayerId} onClick={()=>doc.activeLayerId&&useEditor.getState().clearAnimationCel(currentFrame,doc.activeLayerId)}>◇ Clear cel</button>
        </div>
        <div className="timeline-foot">
          <span><Layers sx={{ fontSize: 12 }} /> Drag marker to scrub · Drag frame thumbnails to reorder</span>
          <label>Frame duration <input aria-label="Selected frame duration milliseconds" type="number" min={16} max={60000}
            value={frames[currentFrame].durationMs}
            onChange={event => useEditor.getState().setFrameDuration(currentFrame, Number(event.target.value))} /> ms</label>
        </div>
      </>}
    </section>
  );
}
