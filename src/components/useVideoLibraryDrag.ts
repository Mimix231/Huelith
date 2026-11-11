import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { TimelineDrop, TimelineDropHit, VideoLibraryCard } from '../editor/video/library-drop';
import { TIMELINE_RULER_HEIGHT, TRACK_HEADER_WIDTH } from './useTimelineNavigation';

export type StartVideoCardDrag = (event: ReactPointerEvent<HTMLElement>, card: VideoLibraryCard, name: string) => void;
type Options = {
  scroll: RefObject<HTMLDivElement | null>;
  timeAt: (x: number) => number;
  pixelsPerSecond: number;
  sceneKey: string;
  resolve: (card: VideoLibraryCard, hit: TimelineDropHit) => TimelineDrop | undefined;
  drop: (card: VideoLibraryCard, target: TimelineDrop) => void;
};
type Gesture = {
  pointerId: number; source: HTMLElement; card: VideoLibraryCard; name: string;
  startX: number; startY: number; x: number; y: number; active: boolean;
  verticalEdge?:number;edgeEnteredAt?:number;
  artwork?: DragArtwork;
};
type DragArtwork = { image: string } | { backgroundImage: string; backgroundPosition: string; backgroundSize: string };
type Hover = { name: string; kind: VideoLibraryCard['kind']; artwork?: DragArtwork; target?: TimelineDrop };

function cardArtwork(source: HTMLElement): DragArtwork | undefined {
  const image = source.querySelector('img');
  if (image?.currentSrc) return { image: image.currentSrc };
  const sprite = source.querySelector('.hv-sticker-sprite');
  if (sprite) {
    const { backgroundImage, backgroundPosition, backgroundSize } = getComputedStyle(sprite);
    return { backgroundImage, backgroundPosition, backgroundSize };
  }
  const frame = source.querySelector<HTMLCanvasElement | HTMLVideoElement>('canvas, video');
  if (!frame) {
    const vector=source.querySelector('.hv-card-image svg, .hv-audio-info svg');
    if(vector)return {image:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(vector))};
    return;
  }
  const width = frame instanceof HTMLVideoElement ? frame.videoWidth : frame.width;
  const height = frame instanceof HTMLVideoElement ? frame.videoHeight : frame.height;
  if (!width || !height) return;
  const thumbnail = document.createElement('canvas');
  thumbnail.width = 224;
  thumbnail.height = Math.max(1, Math.min(224, Math.round(224 * height / width)));
  const ctx = thumbnail.getContext('2d');
  if (!ctx) return;
  const scale = Math.min(thumbnail.width / width, thumbnail.height / height);
  try {
    ctx.drawImage(frame, (thumbnail.width - width * scale) / 2, (thumbnail.height - height * scale) / 2, width * scale, height * scale);
    return { image: thumbnail.toDataURL('image/png') };
  } catch {
    return;
  }
}

export function useVideoLibraryDrag(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<Gesture | null>(null);
  const suppress = useRef<HTMLElement | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover>();

  const start: StartVideoCardDrag = useCallback((event, card, name) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    suppress.current = null;
    gesture.current = {
      pointerId: event.pointerId, source: event.currentTarget, card, name,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false,
    };
  }, []);

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!event.detail || !suppress.current?.contains(event.target as Node)) return;
    suppress.current = null;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    let frame = 0;

    function hitAt(current: Gesture) {
      const { scroll, timeAt, pixelsPerSecond, resolve } = latest.current;
      const scroller = scroll.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect(), { x, y } = current;
      if (x < rect.left + TRACK_HEADER_WIDTH || x >= rect.left + scroller.clientWidth ||
        y < rect.top || y >= rect.top + scroller.clientHeight) return;

      for (const element of document.elementsFromPoint(x, y)) {
        if (!scroller.contains(element)) continue;
        if (element.closest('.hv-ruler, .hv-track-name')) return;
        const lane = element.closest<HTMLElement>('[data-lane-id]');
        if (!lane?.dataset.laneId) continue;
        const target = resolve(current.card, {
          trackId: lane.dataset.laneId, clipId: element.closest<HTMLElement>('[data-clip-id]')?.dataset.clipId,
          time: Math.max(0, timeAt(x)), edgeWindow: 9 / pixelsPerSecond,
        });
        return { target, lane };
      }
    }

    function scrollAt(current: Gesture) {
      const scroller = latest.current.scroll.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const left = rect.left + TRACK_HEADER_WIDTH, right = rect.left + scroller.clientWidth;
      const top = rect.top + TIMELINE_RULER_HEIGHT, bottom = rect.top + scroller.clientHeight;
      if (current.x < left || current.x >= right || current.y < top || current.y >= bottom) {
        current.verticalEdge=0;
        return;
      }
      const edge = (value: number, min: number, max: number) =>
        value < min + 25 ? -(min + 25 - value) * .65 : value > max - 25 ? (value - max + 25) * .65 : 0;
      const x = edge(current.x, left, right), y = edge(current.y, top, bottom);
      if (x) scroller.scrollLeft += x;
      const vertical=Math.sign(y);
      if(vertical!==current.verticalEdge){
        current.verticalEdge=vertical;
        current.edgeEnteredAt=performance.now();
      }
      if(y&&performance.now()-(current.edgeEnteredAt??0)>160)scroller.scrollTop+=y;
    }

    function update() {
      const current = gesture.current;
      if (!current?.active) return;
      if (!current.source.isConnected) { finish(true); return; }
      scrollAt(current);
      const hit = hitAt(current), target = hit?.target;
      if (ghost.current) {
        const { offsetWidth: width, offsetHeight: height } = ghost.current;
        const x = current.x + width + 26 > window.innerWidth ? current.x - width - 16 : current.x + 16;
        const y = current.y + height + 26 > window.innerHeight ? current.y - height - 14 : current.y + 16;
        ghost.current.style.transform = `translate3d(${Math.max(6, x)}px,${Math.max(6, y)}px,0)`;
      }
      if (line.current) {
        const lane = target?.kind === 'insert' ? hit?.lane.getBoundingClientRect() : undefined;
        line.current.hidden = !lane;
        if (lane) {
          line.current.style.left = `${current.x}px`;
          line.current.style.top = `${lane.top}px`;
          line.current.style.height = `${lane.height}px`;
        }
      }
      setHover(previous => previous?.name === current.name && previous.target?.kind === target?.kind &&
        previous.target?.clipId === target?.clipId && previous.target?.trackId === target?.trackId &&
        previous.target?.transition?.placement===target?.transition?.placement &&
        previous.target?.transition?.start===target?.transition?.start &&
        previous.target?.transition?.end===target?.transition?.end
        ? previous : { name: current.name, kind: current.card.kind, artwork: current.artwork, target });
      frame = requestAnimationFrame(update);
    }

    function finish(cancelled: boolean) {
      const current = gesture.current;
      if (!current) return;
      const target = !cancelled && current.active && current.source.isConnected ? hitAt(current)?.target : undefined;
      gesture.current = null;
      cancelAnimationFrame(frame);
      if (current.active) {
        current.source.classList.remove('is-dragging');
        suppress.current = current.source;
        setHover(undefined);
        if (line.current) line.current.hidden = true;
      }
      if (current.source.hasPointerCapture(current.pointerId)) current.source.releasePointerCapture(current.pointerId);
      if (target) latest.current.drop(current.card, target);
    }

    function move(event: PointerEvent) {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.x = event.clientX;
      current.y = event.clientY;
      if (!current.active && Math.hypot(current.x - current.startX, current.y - current.startY) >= 5) {
        if (!current.source.isConnected) { finish(true); return; }
        current.active = true;
        try { current.source.setPointerCapture(event.pointerId); }
        catch { finish(true); return; }
        current.artwork = cardArtwork(current.source);
        current.source.classList.add('is-dragging');
        update();
      }
      if (current.active) event.preventDefault();
    }

    function end(event: PointerEvent) {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (event.type === 'lostpointercapture' && event.target !== current.source) return;
      current.x = event.clientX;
      current.y = event.clientY;
      finish(event.type !== 'pointerup');
    }

    const resetClick = () => { suppress.current = null; };
    const cancel = () => finish(true);
    function key(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !gesture.current?.active) return;
      event.preventDefault();
      finish(true);
    }
    window.addEventListener('pointerdown', resetClick, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    window.addEventListener('lostpointercapture', end, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointerdown', resetClick, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      window.removeEventListener('lostpointercapture', end, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', cancel);
      finish(true);
    };
  }, [options.sceneKey]);

  return { start, onClickCapture, hover, ghost, line };
}
