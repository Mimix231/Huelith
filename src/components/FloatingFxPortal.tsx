import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './FloatingFxPortal.css';

interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  closing: boolean;
  children: ReactNode;
}

/**
 * The Studio used to render inside the inspector. Its z-index was trapped in
 * that panel's stacking context, below the animation timeline; its bottom
 * position also ignored the timeline. Portal it to the themed app root and
 * position against the usable canvas area instead.
 *
 * Positioning changes are DOM-only: changing a timeline's height must never
 * rerender 200+ Studio controls or enqueue an effect processing request.
 */
export default function FloatingFxPortal({ anchorRef, closing, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const portalRoot = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.app');

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const overlay = host.querySelector<HTMLElement>('.fx-overlay');
    if (!overlay) return;
    let frame = 0;
    const position = () => {
      frame = 0;
      const inspector = anchorRef.current;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(345, Math.max(180, viewportWidth - 16));
      const inspectorBounds = inspector?.getBoundingClientRect();
      const left = Math.max(8, Math.min(viewportWidth - width - 8,
        (inspectorBounds?.left ?? viewportWidth) - width - 10));
      const main = inspector?.parentElement?.querySelector<HTMLElement>('.main-editor');
      const timeline = main?.querySelector<HTMLElement>('.animation-timeline');
      const mainBounds = main?.getBoundingClientRect();
      const top = Math.min(Math.max(8, (mainBounds?.top ?? 50) + 7), Math.max(8, viewportHeight - 205));
      // Make room above the timeline whenever possible. On very small windows
      // the floating panel may overlap it, but remains ABOVE it and scrollable.
      const bottom = timeline ? timeline.getBoundingClientRect().top - 8
        : (mainBounds?.bottom ?? viewportHeight) - 27;
      const maxHeight = Math.min(690, viewportHeight - top - 8,
        Math.max(188, bottom - top));
      overlay.style.left = `${left}px`;
      overlay.style.top = `${top}px`;
      overlay.style.width = `${width}px`;
      overlay.style.maxHeight = `${Math.max(100, maxHeight)}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(position);
    };
    position();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const main = anchorRef.current?.parentElement?.querySelector<HTMLElement>('.main-editor');
    const timeline = main?.querySelector<HTMLElement>('.animation-timeline');
    for (const element of [anchorRef.current, main, timeline]) if (element) resizeObserver?.observe(element);
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      resizeObserver?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [anchorRef]);

  if (!portalRoot) return null;
  return createPortal(
    <div ref={hostRef} className={`fx-host portal-fx-host${closing ? ' closing' : ''}`}>
      {children}
    </div>, portalRoot,
  );
}
