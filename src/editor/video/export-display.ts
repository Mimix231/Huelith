/** Compact presentation of the existing verified progress tracker.
 * This never makes export/quality decisions and tolerates older job journals.
 */
export type RenderStage='preparing'|'initializing'|'rendering'|'finalizing'|'verifying'|'complete';
export type RenderInsights={stage:RenderStage;label:string;fps:number|null;eta:string|null;
  completed:number|null;total:number|null;renderMs:number|null;encodeMs:number|null};
const value=(text:string,pattern:RegExp)=>{
  const match=text.match(pattern);return match?Number(match[1].replaceAll(',','')):null;
};
export function readRenderInsights(message:string,status?:string):RenderInsights{
  const text=message||'';
  const stage:RenderStage=status==='complete'||/^(?:Export verified|Finished)/i.test(text)?'complete'
    :/^Verifying|^Probing|^Decoding the finished/i.test(text)?'verifying'
    :/^Finalizing/i.test(text)?'finalizing'
    :/^Rendering \+ encoding/i.test(text)?'rendering'
    :/^Starting Windows|^Initializing/i.test(text)?'initializing':'preparing';
  const label={preparing:'Preparing the project',initializing:'Starting the encoder',
    rendering:'Rendering your video',finalizing:'Finalizing the MP4',
    verifying:'Checking the finished video',complete:'Video exported'}[stage];
  const match=text.match(/Rendering \+ encoding\s*·\s*([\d,]+)\s*\/\s*([\d,]+)\s*frames/i);
  const eta=text.match(/~\s*([^·]+?)\s+left(?:\s*·|$)/i);
  const completed=match?Number(match[1].replaceAll(',','')):null;
  const total=match?Number(match[2].replaceAll(',','')):null;
  return {stage,label,
    completed:Number.isFinite(completed)?completed:null,total:Number.isFinite(total)?total:null,
    fps:value(text,/·\s*([\d.]+)\s*fps\b/i),
    renderMs:value(text,/\brender\s+([\d.]+)\s*ms/i),
    encodeMs:value(text,/\bencode\s+([\d.]+)\s*ms/i),
    eta:eta?.[1]?.trim()||null};
}
