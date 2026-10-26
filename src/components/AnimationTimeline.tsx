import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Delete, ContentCopy, Add, PlayArrow, Pause, SkipNext, SkipPrevious, Layers } from '@mui/icons-material';
import { activeTab, useEditor } from '../editor/store';
import { frameDocument } from '../editor/animation';
import { timelineFrameAt, timelineOffset } from '../editor/playback-clock';
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
  }, [frame, index, visible, doc.width, doc.height, doc.background, doc.animation?.trackEffects, doc.animation?.trackGradients]);

  return <canvas ref={ref} width={60} height={38} className="timeline-preview" aria-hidden="true" />;
}, (previous, next) => previous.frame === next.frame && previous.index === next.index
    && previous.doc.animation?.trackEffects === next.doc.animation?.trackEffects
    && previous.doc.animation?.trackGradients === next.doc.animation?.trackGradients
    && previous.doc.width === next.doc.width && previous.doc.height === next.doc.height
    && previous.doc.background === next.doc.background);

export default function AnimationTimeline() {
  const doc = useEditor(state => activeTab(state).doc);
  const animation = doc.animation;
  const [playing, setPlaying] = useState(false);
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
    if (!playing || !clock.current.frames?.length) return;
    // Monotonic clock: use elapsed time, not a setTimeout per frame. Expensive
    // FX rendering can delay paints, but will never accumulate timeline drift.
    const started = performance.now();
    const anchor = timelineOffset(clock.current.frames, clock.current.current);
    let running = true;
    let request = 0;
    const animate = (now: number): void => {
      if (!running) return;
      const frames = clock.current.frames;
      if (!frames?.length) return;
      const desired = timelineFrameAt(frames, anchor + (now - started) * clock.current.rate);
      const store = useEditor.getState();
      if (activeTab(store).doc.id !== doc.id) return;
      if (activeTab(store).doc.animation?.currentFrame !== desired) store.setActiveFrame(desired);
      request = requestAnimationFrame(animate);
    };
    request = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(request); };
  }, [playing, doc.id, playbackRate]);

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
  const positionFromEvent = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || !trackRef.current) return currentFrame;
    const relative = event.clientX - bounds.left + trackRef.current.scrollLeft;
    return Math.max(0, Math.min(frames.length - 1, Math.floor(relative / CELL)));
  };
  const select = (index: number): void => {
    setPlaying(false);
    useEditor.getState().setActiveFrame(index);
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
            <div className="timeline-ruler" aria-label="Drag to scrub frames">
              {frames.map((frame, index) => <span key={frame.id} style={{ left: index * CELL + CELL / 2 }}>{index + 1}</span>)}
              <div className="timeline-playhead" style={{ left: currentFrame * CELL + CELL / 2 }} aria-hidden="true"><span className="timeline-marker">▼</span></div>
            </div>
            <div className="timeline-frames" role="group" aria-label="Animation frames">
              {frames.map((frame, index) => (
                <button type="button" key={frame.id}
                  className={`timeline-frame-card ${index === currentFrame ? 'selected' : ''}`}
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
                  onClick={() => select(index)}
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
                </button>
              ))}
            </div>
          </div>
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
