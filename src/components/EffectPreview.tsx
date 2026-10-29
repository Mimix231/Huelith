import { queueThumbnail } from '../editor/thumbnail-queue';
import { memo, useEffect, useRef, useState } from 'react';
import type { EffectKind } from '../editor/types';
import { FX_PRESETS, newEffect, processEffects } from '../editor/fx';

const previewCache = new Map<string, string>();
const MAX_PREVIEWS = 100;

/** True effect-pipeline thumbnails, generated lazily to keep the 70-filter catalog fast. */
function renderSample(kind?: EffectKind, preset?: string): string {
  const source = document.createElement('canvas');
  source.width = source.height = 64;
  const context = source.getContext('2d');
  if (!context) return '';

  const backdrop = kind === 'cutout';
  if (backdrop) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 64, 64);
  }
  const gradient = context.createLinearGradient(6, 8, 56, 56);
  gradient.addColorStop(0, '#f4a768');
  gradient.addColorStop(0.45, '#724ccb');
  gradient.addColorStop(1, '#34c5db');
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(33, 31, 23, 21, -0.35, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(255,239,180,.92)';
  context.fillRect(17, 24, 17, 17);
  context.fillStyle = '#16345a';
  context.beginPath();
  context.arc(41, 26, 7, 0, Math.PI * 2);
  context.fill();

  const presetIndex = preset ? Object.keys(FX_PRESETS).indexOf(preset) : -1;
  const effects = presetIndex >= 0
    ? [newEffect(`sig_${presetIndex}` as EffectKind)]
    : kind ? [newEffect(kind)] : [];
  const processed = processEffects(source, effects);
  const composite = document.createElement('canvas');
  composite.width = composite.height = 64;
  const canvas = composite.getContext('2d');
  if (!canvas) return '';
  canvas.fillStyle = '#353648';
  canvas.fillRect(0, 0, 64, 64);
  canvas.fillStyle = '#444659';
  for (let y = 0; y < 64; y += 10) {
    for (let x = (y / 10) % 2 === 0 ? 0 : 10; x < 64; x += 20) canvas.fillRect(x, y, 10, 10);
  }
  canvas.drawImage(processed, 0, 0);
  return composite.toDataURL('image/png');
}

function EffectPreview({ kind, preset, className, onDemand = false }: {
  kind?: EffectKind;
  preset?: string;
  className?: string;
  onDemand?: boolean;
}) {
  const key = preset ? `preset:${preset}` : `filter:${kind}`;
  const [image, setImage] = useState(previewCache.get(key) ?? '');
  const element = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const cached = previewCache.get(key);
    if (cached) {
      setImage(cached);
      return;
    }
    let canceled = false;
    const render = () => {
      if (canceled) return;
      try {
        const result = renderSample(kind, preset);
        if (!result || canceled) return;
        if (previewCache.size >= MAX_PREVIEWS) previewCache.delete(previewCache.keys().next().value!);
        previewCache.set(key, result);
        setImage(result);
      } catch (cause) {
        console.warn(`Preview for ${key} could not render`, cause);
      }
    };
    // Deferred and globally time-sliced: opening the Studio no longer launches
    // dozens of synchronous Canvas2D processors in the same frame.
    let observer: IntersectionObserver | undefined;
    let cancelJob: (() => void) | undefined;
    let parent:HTMLElement|null=null;
    let requested=false;
    const askRender=()=>{
      if(requested||canceled)return;
      requested=true;
      cancelJob=queueThumbnail(render);
    };
    if(onDemand){
      // Order 7 thumbnails run the same CPU pixel kernels as export. Browsing
      // dozens of cards must NEVER launch those jobs automatically. The
      // checked-in SVG icon provides an immediate, distinct preview; optional
      // accurate thumbnails render only for a card the user actually hovers.
      parent=element.current?.closest('button')??null;
      parent?.addEventListener('pointerenter',askRender,{passive:true});
      parent?.addEventListener('focusin',askRender,{passive:true});
    } else if ('IntersectionObserver' in window && element.current) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer?.disconnect();askRender();
        }
      }, { rootMargin: '50px' });
      observer.observe(element.current);
    } else askRender();
    return () => { canceled = true; observer?.disconnect(); cancelJob?.();
      parent?.removeEventListener('pointerenter',askRender);
      parent?.removeEventListener('focusin',askRender);
    };
  }, [key, kind, preset, onDemand]);

  return <img ref={element} className={className} src={image || undefined}
    aria-hidden="true" alt="" loading="lazy" draggable={false} />;
}

export default memo(EffectPreview);
