/** Round 10: authored text and vector shapes are rasterized only when their
 * content changes. The resulting alpha texture is composited by the common
 * WebGPU scene graph on every frame, not redrawn by Canvas2D every frame.
 * This uses Huelith's reference text/shape renderer to preserve typography.
 */
import {createSurface} from '../../canvas-surface';
import {drawVideoShape} from '../graphics';
import {drawVideoText} from '../text-renderer';
import type {GpuFrameGraph,GpuSourceLayer} from './render-graph';
import {processVideoEffects} from '../process-effects';
import {ProcessedLayerCache} from '../export-static-scene';
import {OverlayWorkerClient} from './overlay-worker-client';
import {gpuFrameGraph} from './render-graph';
import type {VideoRenderContract} from '../preview-render-contract';

const MAX_OVERLAYS=12;
const RAW_BUDGET=64*1024*1024;
type Entry={signature:string;surface:HTMLCanvasElement};
export class GpuOverlayRasterCache {
  private entries=new Map<string,Entry>();
  private processed=new ProcessedLayerCache();
  private worker=new OverlayWorkerClient();
  private pending=new Map<string,Promise<HTMLCanvasElement>>();
  private generation=0;

  private signature(layer:GpuSourceLayer,graph:GpuFrameGraph,designWidth:number){
    return JSON.stringify([layer.kind,layer.kind==='text'?layer.clip.title:layer.clip.shape,
      layer.kind==='text'?layer.clip.textStyle:null,graph.width,graph.height,designWidth]);
  }

  async getProcessed(layer:GpuSourceLayer,graph:GpuFrameGraph,designWidth:number,signal?:AbortSignal){
    if(!layer.clip.effects?.some(e=>e.enabled)&&!layer.clip.grade)return this.get(layer,graph,designWidth);
    const key=JSON.stringify([this.signature(layer,graph,designWidth),layer.clip.effects,layer.clip.grade]);
    const old=this.processed.get(key);if(old)return old;
    let pending=this.pending.get(key);
    if(!pending){
      const raw=this.get(layer,graph,designWidth);
      const generation=this.generation;
      pending=(async()=>{
        const context={timestamp:layer.localTime,sourceTime:layer.sourceTime,
          frameIndex:Math.floor(layer.sourceTime*graph.fps),fps:graph.fps,referenceWidth:designWidth,grade:layer.clip.grade};
        let result:HTMLCanvasElement|null=null;
        try{result=await this.worker.render(raw,layer.clip.effects??[],context,layer.clip.grade,layer.id,!!signal);}
        catch(error){
          if(this.generation!==generation||error instanceof DOMException&&error.name==='AbortError')throw error;
          // Some platform-specific effects require a DOM canvas. Preserve the
          // exact processor for those stacks rather than losing their pixels.
          console.warn('Huelith processes this static overlay on the reference canvas.',error);
        }
        result??=await processVideoEffects(raw,layer.clip.effects??[],context);
        if(this.generation===generation)this.processed.remember(key,result);
        return result;
      })();
      this.pending.set(key,pending);
      void pending.finally(()=>{if(this.pending.get(key)===pending)this.pending.delete(key);}).catch(()=>{});
    }
    const result=await pending;signal?.throwIfAborted();return result;
  }

  prepareUpcoming(contract:VideoRenderContract,time:number){
    if(this.pending.size>=3)return;
    const titles=new Set(contract.timeline.tracks.filter(t=>t.kind==='title'&&!t.muted).map(t=>t.id));
    const upcoming=contract.timeline.clips.filter(c=>(titles.has(c.trackId)||c.shape)&&c.start>time&&c.start<=time+3)
      .sort((a,b)=>a.start-b.start).slice(0,2);
    for(const clip of upcoming){
      const at=clip.start+Math.min(clip.duration/2,1/contract.fps);
      const graph=gpuFrameGraph({...contract,timeline:{...contract.timeline,clips:[clip]}},at);
      const layer=graph?.layers.find(l=>l.id===clip.id&&l.kind!=='media');
      if(graph&&layer)void this.getProcessed(layer,graph,contract.designWidth??contract.width).catch(()=>{});
    }
  }

  get(layer:GpuSourceLayer,graph:GpuFrameGraph,designWidth:number):HTMLCanvasElement{
    if(layer.kind==='media')throw Error('Media frames cannot be cached as static overlays.');
    // Intentionally excludes transforms and opacity: their changes are
    // represented by shader uniforms, so the glyph/shape texture is reused.
    const signature=this.signature(layer,graph,designWidth);
    const old=this.entries.get(layer.id);
    if(old?.signature===signature){
      this.entries.delete(layer.id);this.entries.set(layer.id,old);
      return old.surface;
    }
    const surface=createSurface();surface.width=graph.width;surface.height=graph.height;
    const ctx=surface.getContext('2d');
    if(!ctx)throw Error('Huelith GPU overlay requires a 2D text/shape rasterizer.');
    ctx.translate(graph.width/2,graph.height/2);
    if(layer.kind==='shape'&&layer.clip.shape){
      drawVideoShape(ctx,layer.clip.shape,graph.width,graph.height,1);
    }else if(layer.kind==='text'){
      drawVideoText(ctx,{...layer.clip,scale:1},graph.width,graph.height,designWidth,0);
    }
    this.entries.delete(layer.id);this.entries.set(layer.id,{signature,surface});
    let bytes=[...this.entries.values()].reduce((total,e)=>total+e.surface.width*e.surface.height*4,0);
    while(this.entries.size>MAX_OVERLAYS||bytes>RAW_BUDGET){
      const oldest=this.entries.keys().next().value;
      if(oldest===undefined)break;
      const entry=this.entries.get(oldest)!;bytes-=entry.surface.width*entry.surface.height*4;
      this.entries.delete(oldest);
    }
    return surface;
  }
  clear():void{this.generation++;this.worker.close();this.pending.clear();this.entries.clear();this.processed.clear();}
}
