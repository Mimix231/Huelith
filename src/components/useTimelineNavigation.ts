import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {snapPlayhead,type PlayheadStop} from '../editor/video/playhead-stops';

export const TRACK_HEADER_WIDTH = 200;
export const TIMELINE_RULER_HEIGHT = 45;
const ZOOM_STEPS = [0.04, 0.08, 0.16, 0.32, 0.64, 1.25, 2.5, 5, 10, 20, 35, 60, 90, 120, 180, 240, 360];

type ScrubOptions={fps:number;enabled:boolean;stops:readonly PlayheadStop[]};
type Drag={pointerId:number;x:number;offset:number;frame:number;element:HTMLElement;alt:boolean;input?:number;held?:PlayheadStop};

export function useTimelineNavigation(zoom:number,seek:(seconds:number,stop?:PlayheadStop)=>void,snap?:ScrubOptions) {
  const scroll = useRef<HTMLDivElement>(null);
  const gesture = useRef<Drag|null>(null);
  const [viewport, setViewport] = useState({ x: 0, width: 900 });
  const [scrubbing,setScrubbing]=useState(false);
  const [stop,setStop]=useState<PlayheadStop>();
  const current = useRef({ zoom, seek,snap });
  current.current = { zoom, seek,snap };

  function timeAt(x: number) {
    const element = scroll.current;
    if (!element) return 0;
    const left = element.getBoundingClientRect().left + TRACK_HEADER_WIDTH;
    return (x - left + element.scrollLeft) / current.current.zoom;
  }

  function measure() {
    const element = scroll.current;
    if (element) setViewport({ x: element.scrollLeft, width: Math.max(1, element.clientWidth - TRACK_HEADER_WIDTH) });
  }

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (gesture.current) cancelAnimationFrame(gesture.current.frame);
    };
  }, []);

  function scrub(drag:Drag,x:number,force=false){
    const value=timeAt(x)-drag.offset;
    const {snap,zoom,seek}=current.current;
    const fps=snap?.fps??30,raw=value*fps;
    const radius=Math.min(8*fps/zoom,Math.max(1,.45*fps));
    if(!force&&raw===drag.input&&(!drag.held||Math.abs(raw-drag.held.frame)<=radius*1.65))return;
    drag.held=snap?.enabled&&!drag.alt?snapPlayhead(snap.stops,raw,radius,drag.input,drag.held):undefined;
    drag.input=raw;
    setStop(drag.held);
    seek(drag.held?drag.held.frame/fps:value,drag.held);
  }

  function tick() {
    const drag = gesture.current;
    const element = scroll.current;
    if (!drag || !element) return;
    const rect = element.getBoundingClientRect();
    const left = rect.left + TRACK_HEADER_WIDTH;
    const right = rect.left + element.clientWidth;
    const margin = 40;
    const pressure = drag.x < left + margin ? (drag.x - left - margin) / margin
      : drag.x > right - margin ? (drag.x - right + margin) / margin : 0;
    if (pressure) element.scrollLeft += Math.sign(pressure) * 27 * Math.min(2, Math.abs(pressure)) ** 2;
    const x = Math.max(left, Math.min(right, drag.x));
    scrub(drag,x);
    drag.frame = requestAnimationFrame(tick);
  }

  function start(event: PointerEvent<HTMLElement>, head?: number) {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    const offset = head === undefined ? 0 : timeAt(event.clientX) - head;
    gesture.current = { pointerId: event.pointerId, x: event.clientX, offset, frame: 0, element: event.currentTarget,alt:event.altKey };
    scrub(gesture.current,event.clientX,true);
    gesture.current.frame = requestAnimationFrame(tick);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const drag=gesture.current;
    if(drag?.pointerId!==event.pointerId)return;
    drag.x=event.clientX;
    if(drag.alt!==event.altKey){drag.alt=event.altKey;scrub(drag,drag.x,true);}
  }

  function finish(event: PointerEvent<HTMLElement>, commit: boolean) {
    const drag = gesture.current;
    if (drag?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setScrubbing(false);
    cancelAnimationFrame(drag.frame);
    if(commit){
      drag.alt=event.altKey;
      drag.input=(timeAt(event.clientX)-drag.offset)*(current.current.snap?.fps??30);
      scrub(drag,event.clientX,true);
    }
    setStop(undefined);
    if (drag.element.hasPointerCapture(event.pointerId)) drag.element.releasePointerCapture(event.pointerId);
  }

  const pointerHandlers = {
    onPointerMove: move,
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, false),
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => finish(event, false),
  };

  return { scroll, viewport, measure, start, timeAt, pointerHandlers, scrubbing,stop };
}

export const maxTimelineZoom=(fps:number)=>Math.max(360,Math.min(1440,fps*12));
export function zoomTimeline(value:number,direction:number,fps=30):number {
  const max=maxTimelineZoom(fps);
  const steps=[...ZOOM_STEPS,...[480,600,720,960,1200,1440].filter(step=>step<max),max];
  return direction>0?steps.find(step=>step>value)??max:steps.reverse().find(step=>step<value)??ZOOM_STEPS[0];
}

export function visibleRulerTicks(left: number, width: number, zoom: number, duration: number, fps: number) {
  const target = 155 / zoom;
  const order = 10 ** Math.floor(Math.log10(target));
  const interval = zoom/fps>=7?Math.max(1,Math.round(target*fps))/fps:
    Math.max(1 / fps, ([1, 2, 4, 8, 10].find(n => n * order >= target) ?? 10) * order);
  const first = Math.max(0, Math.floor(left / zoom / interval) - 1);
  const last = Math.min(Math.floor(duration / interval), Math.ceil((left + width) / zoom / interval) + 1);
  return { interval, ticks: Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => (first + index) * interval) };
}
