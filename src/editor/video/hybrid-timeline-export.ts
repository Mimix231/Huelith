/** Round 1 export routing. Native Rust remains the fastest path; operations
 * without native counterparts can be rendered by the same browser processor
 * that drives interactive previews and streamed into the native MP4 encoder.
 * This is intentionally capability-checked, never an effect-dropping mode.
 */
import {VIDEO_EFFECT_LOOKUP} from './effects/catalog';
import {VIDEO_FILTER_LOOKUP} from './filters';
import {collectNativeRenderIssues} from './native-timeline-export';
import type {VideoTimeline,VideoScene} from './timeline';
import {AUTHORED_TRANSITION_LOOKUP} from './transition-recipes';
import {TRANSITION_LOOKUP} from './transitions';
import {authoredTransitions} from './transition-placement';
import type {ExportFrameTelemetry} from './export-progress';
import type {NativeExportReport,NativeStreamSettings} from './native-media';
import {streamNativeVideo} from './native-media';
import {PreviewMediaSources} from './preview-media-sources';
import {createVideoRenderContract} from './preview-render-contract';
import {renderBrowserPreviewFrame} from './preview-frame-compositor';
import {ProcessedLayerCache} from './export-static-scene';
import {createExportFrameReuse} from './export-frame-reuse';

export type VideoExportBackend='native'|'browser-frames';
export type VideoExportCompatibility={backend:VideoExportBackend;nativeMissing:string[];notes:string[]};

/** A real limitation is reported before opening Save As; known unsupported
 * browser operations are not silently flattened or skipped. */
export function browserFrameExportIssues(timeline:VideoTimeline,range:{start:number;end:number},fps=30):string[]{
  const assets=new Map(timeline.assets.map(a=>[a.id,a]));
  const issues:string[]=[];
  const walk=(scene:VideoScene,start:number,end:number,depth:number,path:string)=>{
    if(depth>6){issues.push(`${path}: compound nesting exceeds six levels`);return;}
    const tracks=new Map(scene.tracks.map(t=>[t.id,t]));
    const spans=authoredTransitions({...scene,assets:timeline.assets},fps)
      .filter(span=>span.start<end&&span.end>start);
    // Verify that every centered combo transition has its required neighbor,
    // including before a native-only export could silently ignore that cut.
    for(const clip of scene.clips){
      const transition=clip.transitionIn;
      if(clip.start<end&&clip.start+clip.duration>start&&transition?.placement==='cut'&&transition.preset?.startsWith('combo-')
        &&!scene.clips.some(peer=>peer.id!==clip.id&&peer.trackId===clip.trackId&&!peer.adjustment
          &&Math.abs(peer.start+peer.duration-clip.start)<.5/fps))
        issues.push(`${path}${clip.title||clip.id}: cut transition has no adjacent outgoing clip`);
    }
    for(let i=0;i<spans.length;i++)for(let j=i+1;j<spans.length;j++){
      const a=spans[i],b=spans[j];
      if(Math.max(a.start,b.start)<Math.min(a.end,b.end)-1e-7
        &&[a.from?.id,a.to?.id].some(id=>id&&(b.from?.id===id||b.to?.id===id)))
        issues.push(`${path}overlapping transitions on ${a.to?.title||a.from?.title||a.to?.id||a.from?.id}`);
    }
    for(const clip of scene.clips){
      const track=tracks.get(clip.trackId);
      if(!track||track.muted||track.kind==='audio'||clip.start>=end||clip.start+clip.duration<=start)continue;
      const name=clip.title||assets.get(clip.assetId??'')?.name||clip.id;
      const fail=(feature:string)=>issues.push(`${path}${name}: ${feature}`);
      const asset=assets.get(clip.assetId??'');
      if(asset?.missing)fail('missing source media');
      if(!asset&&!clip.compound&&!clip.adjustment&&!clip.shape&&!clip.title&&track.kind!=='title')fail('missing visual source');
      for(const transition of [clip.transitionIn,clip.transitionOut]){
        if(transition?.kind==='effect'&&!AUTHORED_TRANSITION_LOOKUP.has(transition.preset??'')
          &&!TRANSITION_LOOKUP.has(transition.preset??''))fail(`unknown transition preset ${transition.preset}`);
      }
      for(const effect of clip.effects??[]){
        if(!effect.enabled)continue;
        if(!VIDEO_EFFECT_LOOKUP.has(effect.kind)&&effect.kind!=='video-filter')fail(`unknown effect ${effect.kind}`);
        if(effect.kind==='video-filter'&&!VIDEO_FILTER_LOOKUP.has(effect.parameters?.lookId??''))fail('missing video filter look');
      }
      if(clip.compound){
        // Compound time is expressed in the clip's source clock. Preserve the
        // authoring contents; recurse instead of flattening or dropping them.
        const sourceStart=Math.max(0,clip.sourceIn+Math.max(start,clip.start)-clip.start);
        const sourceEnd=clip.sourceIn+Math.min(end,clip.start+clip.duration)-clip.start;
        walk(clip.compound,sourceStart,sourceEnd,depth+1,`${path}${name} / `);
      }
    }
  };
  walk(timeline,range.start,range.end,0,'');
  return [...new Set(issues)];
}
export function selectVideoExportBackend(timeline:VideoTimeline,range:{start:number;end:number},fps=30):VideoExportCompatibility{
  const native=collectNativeRenderIssues(timeline,range);
  const browser=browserFrameExportIssues(timeline,range,fps);
  // Missing/malformed authored operations are never a valid native fast path.
  if(!native.length&&!browser.length)return {backend:'native',nativeMissing:[],notes:[]};
  if(browser.length)throw Error(`This edit cannot be exported with full fidelity yet: ${browser.join('; ')}. `+
    `Native renderer also lacks ${native.length} operation(s). No effects will be silently omitted.`);
  return {backend:'browser-frames',nativeMissing:native.map(issue=>`${issue.clipLabel}: ${issue.operation}`),
    notes:['Compatible frames are composed in the WebView and encoded/mixed by Rust. This path may be slower than native effects.']};
}

export async function exportCompatibleVideoFrames(args:{timeline:VideoTimeline;range:{start:number;end:number};
  settings:NativeStreamSettings;designWidth?:number;signal?:AbortSignal;onProgress:(completed:number,total:number,details?:ExportFrameTelemetry)=>void}):Promise<NativeExportReport>{
  const {timeline,range,settings,signal,onProgress}=args;
  // Routing must be done again at job execution time, not just in Save As.
  const issues=browserFrameExportIssues(timeline,range,settings.fps);
  if(issues.length)throw Error('Browser-frame export cannot reproduce: '+issues.join('; '));
  const sources=new PreviewMediaSources();
  const retained=new ProcessedLayerCache();
  let previousHits=0;
  const reusePrevious=createExportFrameReuse(timeline,range.start,settings.fps);
  const plan=createVideoRenderContract(timeline,settings.width,settings.height,settings.fps,false,args.designWidth??settings.width);
  try{
    return await streamNativeVideo(settings,
      index=>renderBrowserPreviewFrame(plan,range.start+index/settings.fps,sources,false,signal,retained),
      (completed,total,details)=>onProgress(completed,total,{...details,
        // Some encoder progress notifications omit optional telemetry.
        // ExportFrameTelemetry requires an explicit phase in every callback.
        phase:details?.phase??'rendering',
        sourceBackend:'WebView Canvas2D → Rust Media Foundation',native:details?.native}),signal,
      ()=>{const hits=retained.hits;const staticReuse=hits>previousHits;previousHits=hits;
        return {sourceMs:0,compositeMs:0,staticReuse,sourceBackend:'WebView Canvas2D → Rust Media Foundation'};},reusePrevious);
  }finally{retained.clear();sources.close();}
}
