import {createSurface} from '../../canvas-surface';
/** Weighted premultiplied blend: transparent sources do not darken one another. */
export function crossDissolve(from:HTMLCanvasElement,to:HTMLCanvasElement,progress:number):HTMLCanvasElement{
  const out=createSurface();out.width=to.width;out.height=to.height;const ctx=out.getContext('2d')!;
  const t=Math.max(0,Math.min(1,progress));ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=1-t;ctx.drawImage(from,0,0);ctx.globalAlpha=t;ctx.drawImage(to,0,0);
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';return out;
}
