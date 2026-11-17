import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { StudioLayout } from '../editor/video/workspace-preferences';

type Side = 'library' | 'inspector';
type Props = {
  side: Side;
  swapped: boolean;
  workspace: RefObject<HTMLDivElement | null>;
  layout: StudioLayout;
  onCommit: (side: Side, width: number) => void;
};
const bounds = {library:[175,720],inspector:[180,600]} as const;
const clamp = (value:number, low:number, high:number) => Math.max(low,Math.min(high,value));

/** Lightweight divider: updates one CSS variable during pointer motion.
 * React state and the editor's history are touched only when the drag ends. */
export default function VideoPaneSplitter({side,swapped,workspace,layout,onCommit}:Props) {
  const gesture = useRef<{pointer:number;startX:number;startWidth:number;latest:number;previous:string}|null>(null);
  const isLeft = (side === 'library') !== swapped;
  const offset = isLeft ? 1 : -1;
  const property = `--hv-${side}-width`;
  const min = bounds[side][0], max = bounds[side][1];
  function panelWidth() {
    const panel = workspace.current?.querySelector<HTMLElement>(side === 'library' ? '.hv-library' : '.hv-inspector');
    return panel?.getBoundingClientRect().width || layout[side];
  }
  function maxAvailable() {
    const host = workspace.current;
    if (!host) return max;
    const other = host.querySelector<HTMLElement>(side === 'library' ? '.hv-inspector' : '.hv-library');
    return Math.max(min,Math.min(max,host.getBoundingClientRect().width-(other?.getBoundingClientRect().width??240)-260));
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !workspace.current) return;
    event.preventDefault(); event.stopPropagation();
    const initial = panelWidth();
    gesture.current = {
      pointer:event.pointerId,startX:event.clientX,startWidth:initial,latest:initial,
      previous:workspace.current.style.getPropertyValue(property),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId || !workspace.current) return;
    current.latest = Math.round(clamp(current.startWidth+(event.clientX-current.startX)*offset,min,maxAvailable()));
    workspace.current.style.setProperty(property,`${current.latest}px`);
  }
  function end(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (commit) move(event);
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!commit) {
      if (current.previous) workspace.current?.style.setProperty(property,current.previous);
      else workspace.current?.style.removeProperty(property);
      return;
    }
    onCommit(side,current.latest);
  }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const movement = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
    if (!movement && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === 'Home' ? min : event.key === 'End' ? maxAvailable() : panelWidth() + movement * offset;
    onCommit(side,Math.round(clamp(next,min,maxAvailable())));
  }
  return <div className={`hv-pane-splitter hv-pane-splitter--${side}`} role="separator" tabIndex={0}
    aria-label={`Resize ${side === 'library' ? 'media library' : 'inspector'}`}
    aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max}
    aria-valuenow={Math.round(panelWidth())} title={`Drag to resize ${side}; arrows adjust width`}
    onPointerDown={begin} onPointerMove={move}
    onPointerUp={event=>end(event,true)} onPointerCancel={event=>end(event,false)}
    onKeyDown={keys}><span aria-hidden="true"/></div>;
}
