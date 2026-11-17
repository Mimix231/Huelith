import type { VideoTextStyle } from './studio-types';

/** The video Focus Text draft is deliberately isolated from project state until Apply. */
export interface VideoTextDraft { text: string; style: VideoTextStyle; }
export const DEFAULT_VIDEO_FONTS = ['Segoe UI', 'Arial', 'Georgia', 'Verdana', 'Trebuchet MS', 'Consolas', 'Bahnschrift'];
const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n));
export function initialVideoTextDraft(text:string,style?:VideoTextStyle):VideoTextDraft {
  return {text:text.slice(0,2000),style:{...style}};
}
export function prepareVideoTextDraft(draft:VideoTextDraft):VideoTextDraft {
  const style={...draft.style};
  style.fontSize=clamp(Number.isFinite(style.fontSize)?style.fontSize!:54,8,500);
  style.fontWeight=clamp(Number.isFinite(style.fontWeight)?style.fontWeight!:700,100,900);
  style.width=clamp(Number.isFinite(style.width)?style.width!:.85,.1,.98);
  style.strokeWidth=clamp(Number.isFinite(style.strokeWidth)?style.strokeWidth!:0,0,15);
  style.letterSpacing=clamp(Number.isFinite(style.letterSpacing)?style.letterSpacing!:0,-8,40);
  return {text:draft.text.slice(0,2000),style};
}
export function hasVideoTextContent(text:string){return text.trim().length>0;}
