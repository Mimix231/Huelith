import {useEffect,useRef,useState} from 'react';
import {activeClips,type VideoTimeline} from '../editor/video/timeline';
import {evaluateVideoEffect} from '../editor/video/effects/types';
import {PreviewMediaSources} from '../editor/video/preview-media-sources';
import {createVideoRenderContract,previewFrameTime} from '../editor/video/preview-render-contract';
import {renderBrowserPreviewFrame} from '../editor/video/preview-frame-compositor';
import {PreviewRenderQueue,type PreviewFrameRequest} from '../editor/video/preview-render-queue';
import {gpuFrameGraph,type GpuPreparedScene} from '../editor/video/gpu/render-graph';
import {prepareGpuScene,WebGpuVideoScene} from '../editor/video/gpu/webgpu-scene';
import {GpuOverlayRasterCache} from '../editor/video/gpu/overlay-raster';
import type {VideoPlaybackTransport} from '../editor/video/playback-transport';
import {ProcessedLayerCache} from '../editor/video/export-static-scene';

type Props={timeline:VideoTimeline;width:number;height:number;fps:number;time:number;
  playing:boolean;transport?:VideoPlaybackTransport;synchronizeStart?:boolean;interactive?:boolean;
  quality?:number;cacheRequest?:number;transparent?:boolean;onError:(message:string)=>void};
type FrameInput={props:Props;width:number;height:number;scale:number;generation:number};

/** Round 2: latest-wins editing, playback frame coalescing, and source decoding
 * remain in the WebView. The Rust pipeline is exclusively an optional source
 * codec fallback or final-export backend, not a dependency of live editing.
 */
export default function VideoPreviewCanvas(props:Props){
  const canvas=useRef<HTMLCanvasElement>(null);
  const gpuCanvas=useRef<HTMLCanvasElement>(null);
  const gpuScene=useRef<WebGpuVideoScene|null>(null);
  const gpuDisabled=useRef(false);
  const overlayRasters=useRef(new GpuOverlayRasterCache());
  const processedLayers=useRef(new ProcessedLayerCache());
  const latest=useRef(props);latest.current=props;
  const sources=useRef<PreviewMediaSources|null>(null);
  const queue=useRef<PreviewRenderQueue<FrameInput,HTMLCanvasElement|GpuPreparedScene>|null>(null);
  const revision=useRef(0);
  const clock=useRef({time:props.time,at:performance.now()});
  const lastError=useRef('');
  const recent=useRef<number[]>([]);
  const lastMetricAt=useRef(0);
  const [metric,setMetric]=useState('');
  const scale=props.quality===0?((props.playing||props.interactive)? .5:1):props.quality??1;
  const pixelWidth=Math.max(1,Math.round(props.width*scale));
  const pixelHeight=Math.max(1,Math.round(props.height*scale));
  const dimensions=useRef({width:pixelWidth,height:pixelHeight,scale});
  dimensions.current={width:pixelWidth,height:pixelHeight,scale};

  function enqueue(){
    const q=queue.current,request=latest.current;
    if(!q)return;
    const {width,height,scale}=dimensions.current;
    const seconds=request.playing
      ?request.transport?.time()??clock.current.time+(performance.now()-clock.current.at)/1000
      :request.time;
    const at=previewFrameTime(seconds,request.fps);
    const frameIndex=Math.floor((at+1e-7)*request.fps);
    const generation=request.transport?.generation??0;
    const key=`${revision.current}:${generation}:${frameIndex}`;
    q.request({key,revision:revision.current,generation,seconds:at,
      mode:request.playing?'playback':'editing',payload:{props:request,width,height,scale,generation}});
  }

  function refresh(){
    revision.current++;
    queue.current?.invalidate();
    enqueue();
  }

  useEffect(()=>{
    sources.current=new PreviewMediaSources();
    queue.current=new PreviewRenderQueue(
      async(request:PreviewFrameRequest<FrameInput>,signal)=>{
        const {props:scene,width,height}=request.payload;
        const plan=createVideoRenderContract(scene.timeline,width,height,scene.fps,!!scene.transparent,scene.width);
        const running=scene.playing&&scene.transport?.playbackDirection!==-1;
        if(running){
          sources.current!.prepareUpcoming(scene.timeline,request.seconds);
          if(gpuScene.current&&!gpuDisabled.current)overlayRasters.current.prepareUpcoming(plan,request.seconds);
        }
        // Only verified graph operations use WebGPU. The CPU compositor still
        // owns complex effects until their GPU implementations are proven.
        const graph=!gpuDisabled.current&&gpuScene.current?gpuFrameGraph(plan,request.seconds):null;
        if(graph)return prepareGpuScene(graph,sources.current!,running,signal,
          overlayRasters.current,plan.designWidth??plan.width);
        return renderBrowserPreviewFrame(plan,request.seconds,sources.current!,running,signal,processedLayers.current);
      },
      (frame,{request,elapsedMs})=>{
        const {props:scene,width,height,scale,generation}=request.payload;
        const display=canvas.current;
        if(!display)return;
        const isGpu='graph' in frame;
        if(isGpu){
          try{gpuScene.current!.render(frame);}
          catch(error){
            // Do not repeatedly submit invalid frames to a lost GPU device.
            gpuDisabled.current=true;
            gpuScene.current?.close();gpuScene.current=null;
            refresh();throw error;
          }
        }else{
          if(display.width!==frame.width)display.width=frame.width;
          if(display.height!==frame.height)display.height=frame.height;
          const context=display.getContext('2d');
          if(!context)throw Error('Video preview surface unavailable');
          context.clearRect(0,0,frame.width,frame.height);
          context.drawImage(frame,0,0);
        }
        if(gpuCanvas.current){
          gpuCanvas.current.style.visibility=isGpu?'visible':'hidden';
          gpuCanvas.current.dataset.active=String(isGpu);
        }
        display.style.visibility=isGpu?'hidden':'visible';
        lastError.current='';
        if(scene.playing&&scene.synchronizeStart)scene.transport?.firstFrameReady(generation);
        const now=performance.now(),timestamps=recent.current;
        timestamps.push(now);
        while(timestamps.length>1&&timestamps[0]<now-1000)timestamps.shift();
        const displayedFps=timestamps.length>1?(timestamps.length-1)*1000/(timestamps.at(-1)!-timestamps[0]):0;
        if(now-lastMetricAt.current>=160){
          lastMetricAt.current=now;
          setMetric(`${scene.playing?`${displayedFps.toFixed(1)} / ${scene.fps} FPS · `:''}${elapsedMs.toFixed(0)} ms · ${isGpu?'WebGPU':'Live preview'}${scale<1?` · ${Math.round(scale*100)}%`:''}`);
        }
        window.dispatchEvent(new CustomEvent('huelith-video-frame',{detail:{
          timestamp:request.seconds,processingMs:elapsedMs,latencyMs:elapsedMs,pendingVersions:0,
          width,height,playing:scene.playing,presentationFps:displayedFps,
          projectFps:scene.fps,previewScale:scale,
          effects:activeClips(scene.timeline,request.seconds).flatMap(clip=>(clip.effects??[]).map(effect=>({
            clip:clip.id,id:effect.id,kind:effect.kind,amount:evaluateVideoEffect(effect,Math.max(0,request.seconds-clip.start)).amount,
          }))),
        }}));
      },
      (error,request)=>{
        // A failed decoder or unsupported effect should not spam the same
        // message 60 times a second while the transport is advancing.
        const message=String(error);
        if(message!==lastError.current){lastError.current=message;latest.current.onError(message);}
        setMetric('Preview unavailable');
        if(request.payload.props.playing&&request.payload.props.synchronizeStart)
          request.payload.props.transport?.firstFrameReady(request.payload.generation);
      },
    );
    let cancelled=false;
    // Request a GPU renderer asynchronously, preserving first-frame playback
    // while WebView2 initializes its adapter. A stale init never outlives us.
    if(gpuCanvas.current)void WebGpuVideoScene.create(gpuCanvas.current,()=>{
      if(cancelled)return;
      gpuDisabled.current=true;
      gpuScene.current?.close();gpuScene.current=null;
      refresh();
    }).then(renderer=>{
      if(cancelled){renderer?.close();return;}
      gpuScene.current=renderer;
      if(renderer){gpuDisabled.current=false;refresh();}
    }).catch(error=>{
      if(cancelled)return;
      gpuDisabled.current=true;
      console.warn('Huelith GPU preview unavailable; using the reference compositor.',error);
      refresh();
    });
    enqueue();
    return()=>{cancelled=true;queue.current?.close();queue.current=null;
      gpuScene.current?.close();gpuScene.current=null;
      sources.current?.close();sources.current=null;overlayRasters.current.clear();processedLayers.current.clear();};
  },[]);

  useEffect(()=>{refresh();},[props.timeline,pixelWidth,pixelHeight,props.fps,props.transparent,props.cacheRequest]);
  useEffect(()=>{
    // Detached monitors and source viewers have no shared transport object.
    // Anchor their local interpolation to each received timeline clock update,
    // including the first update arriving while playback is already running.
    if(!props.transport||!props.playing)clock.current={time:props.time,at:performance.now()};
    // Seeking while paused always invalidates previous decoder requests;
    // ordinary 30fps playhead publication must not cancel playback frames.
    if(!props.playing)refresh();else enqueue();
  },[props.time,props.playing,props.interactive]);
  useEffect(()=>{
    if(!props.playing)return;
    let id=0;
    const tick=()=>{enqueue();id=requestAnimationFrame(tick);};
    id=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(id);
  },[props.playing]);

  return <><canvas ref={canvas} width={pixelWidth} height={pixelHeight} className="hv-preview-canvas" aria-label="Live composited video frame"/>
    <canvas ref={gpuCanvas} width={pixelWidth} height={pixelHeight} className="hv-preview-canvas hv-preview-gpu"
      data-active="false" style={{visibility:'hidden'}} aria-hidden="true"/>
    {metric&&<span className="hv-preview-metric">{metric}</span>}</>;
}
