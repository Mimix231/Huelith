import {activeClips, type VideoClip, type VideoTimeline} from './timeline';
import {VIDEO_TEMPORAL_KINDS,VIDEO_TIME_VARYING_KINDS} from './effects/catalog';

/** Parameter keys are a map of parameter names to keyframe arrays. */
function hasParameterKeyframes(keys:object|undefined):boolean {
  return !!keys&&Object.values(keys).some(entries=>Array.isArray(entries)&&entries.length>0);
}

/** Return a stable signature ONLY for time-invariant parts of the timeline.
 * This is deliberately conservative: dynamic footage, GIFs, fades, enabled
 * effects, transitions, keyframes, captions and compounds MUST render anew.
 * The call is used only during sequential exports of an immutable snapshot.
 */
export function staticExportSignature(timeline:VideoTimeline,clock:number):string|null {
  const tracks=new Map(timeline.tracks.map(t=>[t.id,t]));
  const assets=new Map(timeline.assets.map(a=>[a.id,a]));
  const clips=activeClips(timeline,clock).filter(c=>tracks.get(c.trackId)?.kind!=='audio');
  const signature:string[]=[];
  for(const c of clips){
    const track=tracks.get(c.trackId);
    const asset=assets.get(c.assetId??'');
    if(!track||c.adjustment||c.compound||c.smart||c.keyframes?.length||c.animation||c.caption||
      c.speedCurve?.length||c.sourceMap?.length||c.transitionIn||c.transitionOut||
      c.fadeIn>0||c.fadeOut>0||c.grade||c.chromaKey||c.mask||c.effects?.some(effect=>effect.enabled)||
      c.textStyle?.reveal||asset?.animated||asset?.kind==='video'||asset?.kind==='audio' ||
      (!asset&&track.kind!=='title')|| c.opacity<0 || c.opacity>1) return null;
    // Title and still-image geometry is time-invariant once the above is true.
    signature.push(`${c.id}:${c.assetId??'title'}:${asset?.revision??0}`);
  }
  // Includes identity of track order and background. Export owns a frozen
  // scene snapshot; the caller additionally tests its object identity.
  return JSON.stringify([timeline.background??'#000000',signature]);
}

/** A clip-local cache rule for exports. Unlike whole-scene caching, this can
 * reuse a static title or still-image effect layer underneath moving footage.
 * Opacity/fades are composited after this cache, so they do not invalidate it.
 * Unknown video effects are treated conservatively as changing over time.
 */
export function canReuseStaticProcessedClip(timeline:VideoTimeline,clip:VideoClip):boolean {
  const track=timeline.tracks.find(t=>t.id===clip.trackId);
  const asset=timeline.assets.find(a=>a.id===clip.assetId);
  if(!track||!(asset?.kind==='image'&&!asset.animated||track.kind==='title'&&!asset))return false;
  if(clip.compound||clip.adjustment||clip.smart||clip.keyframes?.length||clip.animation||clip.caption?.words?.length||
    clip.textStyle?.reveal||hasParameterKeyframes(clip.mask?.keys)||clip.mask?.featherKeys?.length||
    hasParameterKeyframes(clip.grade?.keys)||hasParameterKeyframes(clip.grade?.mask?.keys)||clip.grade?.basic?.grain||clip.sourceMap?.length||clip.speedCurve?.length)
    return false;
  if(clip.effects?.some(e=>e.enabled&&(e.keyframes?.length||hasParameterKeyframes(e.mask?.keys)||
    VIDEO_TEMPORAL_KINDS.has(e.kind)||VIDEO_TIME_VARYING_KINDS.has(e.kind))))return false;
  return true;
}

/** Bound retained, already-processed still/title layers during one immutable
 * export. Reusing pixels is safe only when canReuseStaticProcessedClip has
 * rejected keyframes, temporal effects, animated masks and source footage.
 */
export class ProcessedLayerCache {
  private entries=new Map<string,HTMLCanvasElement>();
  private bytes=0;
  hits=0;
  constructor(private readonly budgetBytes=96*1024*1024){}
  get(key:string):HTMLCanvasElement|undefined{
    const image=this.entries.get(key);
    if(image){this.entries.delete(key);this.entries.set(key,image);this.hits++;}
    return image;
  }
  remember(key:string,image:HTMLCanvasElement):void{
    if(this.entries.has(key))return;
    const cost=image.width*image.height*4;
    if(cost>this.budgetBytes)return;
    this.entries.set(key,image);this.bytes+=cost;
    while(this.bytes>this.budgetBytes){
      const oldest=this.entries.keys().next().value!;
      const dropped=this.entries.get(oldest)!;
      this.bytes-=dropped.width*dropped.height*4;
      this.entries.delete(oldest);
    }
  }
  clear():void{this.entries.clear();this.bytes=0;this.hits=0;}
}
