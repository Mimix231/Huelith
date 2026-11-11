import { useEffect, useRef, useState } from 'react';
import { TimelineCompositor, VideoDecoderPool } from '../editor/video/compositor';
import { activeClips, durationOf, type VideoTimeline } from '../editor/video/timeline';
import { evaluateVideoEffect } from '../editor/video/effects/types';
import { VideoEffectsWorkerClient } from '../editor/video/effects-worker-client';
import type { VideoPlaybackTransport } from '../editor/video/playback-transport';

type Props = {
  timeline: VideoTimeline; width: number; height: number; fps: number; time: number;
  playing: boolean; transport?: VideoPlaybackTransport; synchronizeStart?:boolean; interactive?: boolean; quality?: number; cacheRequest?:number;transparent?:boolean;onError: (message: string) => void;
};

function scene(request: Props) {
  return activeClips(request.timeline, request.time).map(clip =>
    [clip.id, request.timeline.assets.find(asset => asset.id === clip.assetId)?.revision ?? 0].join(':')).join('|');
}

/** Paint completed frames during an interaction and keep only the newest
 * waiting request. Full quality resumes when the gesture or playback ends. */
export default function VideoPreviewCanvas(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const clockSample=useRef({time:props.time,at:performance.now()});
  if(clockSample.current.time!==props.time)clockSample.current={time:props.time,at:performance.now()};
  const pending = useRef(false), working = useRef(false), scheduled = useRef(0);
  const pool = useRef(new Map<number, TimelineCompositor>());
  const effectWorker = useRef<VideoEffectsWorkerClient | undefined>(undefined);
  const decoders = useRef<VideoDecoderPool | undefined>(undefined);
  const lifetime = useRef<AbortController | undefined>(undefined);
  const warm=useRef<{controller:AbortController}|undefined>(undefined);
  const warmed=useRef(0);
  const suggested = useRef(.5), fastFrames = useRef(0), metricAt = useRef(0);
  const requestedAt=useRef(0), requestVersion=useRef(0);
  const latencies=useRef<number[]>([]);
  const presentationTimes=useRef<number[]>([]);
  const lastFrame=useRef<{frame:number;generation:number;timeline:VideoTimeline;scale:number;playing:boolean}|undefined>(undefined);
  const [metric, setMetric] = useState('');
  latest.current = props;

  async function warmPreview(request:Props,controller:AbortController){
    const {signal}=controller;
    const scale=request.quality===0?Math.min(.5,suggested.current):request.quality??1;
    const renderer=rendererFor(request,scale);
    const first=Math.floor(request.time*request.fps+1e-7);
    const bytes=renderer.width*renderer.height*4;
    const count=Math.min(Math.max(0,Math.floor(64*1024*1024/bytes)-1),request.fps*3,
      Math.ceil(durationOf(request.timeline)*request.fps)-first);
    renderer.setPlayback(false);
    for(let index=0;index<count;index++){
      signal.throwIfAborted();
      if(index%4===0)setMetric('Caching '+index+' / '+count+' frames');
      await renderer.render(request.timeline,(first+index)/request.fps,signal);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    if(request.quality===0)suggested.current=scale;
    setMetric(count>0?count+' frames cached · '+Math.round(scale*100)+'%':'No frames to cache at this point');
  }

  function rendererFor(request: Props, scale: number) {
    const existing = pool.current.get(scale);
    if (existing) {
      pool.current.delete(scale);
      pool.current.set(scale, existing);
      return existing;
    }
    const renderer = new TimelineCompositor(Math.max(1, Math.round(request.width * scale)),
      Math.max(1, Math.round(request.height * scale)), request.fps, request.width, true, effectWorker.current,decoders.current);
    pool.current.set(scale, renderer);
    if (pool.current.size > 2) {
      const oldest = pool.current.keys().next().value!;
      pool.current.get(oldest)?.dispose();
      pool.current.delete(oldest);
    }
    return renderer;
  }

  async function drain() {
    if (working.current || !lifetime.current) return;
    working.current = true;
    try {
      while ((pending.current||warm.current) && lifetime.current && !lifetime.current.signal.aborted) {
        if(!pending.current&&warm.current){
          const job=warm.current;
          try{await warmPreview(latest.current,job.controller);}
          catch(error){if(!job.controller.signal.aborted)latest.current.onError(String(error));}
          finally{if(warm.current===job)warm.current=undefined;}
          continue;
        }
        pending.current = false;
        const snapshot = latest.current, controller = lifetime.current;
        const transport=snapshot.transport,generation=transport?.generation??0;
        const clock=snapshot.playing?(transport?.time()??clockSample.current.time+(performance.now()-clockSample.current.at)/1000):snapshot.time;
        const frameIndex=Math.floor((clock+1e-7)*snapshot.fps);
        const playing=snapshot.playing&&(!transport||transport.advancing);
        const request={...snapshot,time:frameIndex/snapshot.fps,playing};
        const received=request.playing?performance.now():requestedAt.current,version=requestVersion.current;
        const auto = request.quality === 0;
        const moving = request.playing || !!request.interactive;
        const scale = auto ? moving ? suggested.current : 1 : request.quality ?? 1;
        const last=lastFrame.current;
        if(snapshot.playing&&last?.frame===frameIndex&&last.generation===generation&&last.timeline===request.timeline
          &&last.scale===scale&&last.playing===playing)break;
        const renderer = rendererFor(request, scale);
        decoders.current?.setPlayback(request.playing);
        for (const item of pool.current.values()) item.setPlayback(item === renderer && request.playing);
        const started = performance.now();
        try {
          const frame = await renderer.render(request.timeline, request.time, controller.signal,request.transparent);
          if (controller.signal.aborted) continue;
          const current = latest.current;
          const elapsed = performance.now() - started;
          const budget = 1000 / request.fps;
          if (auto && elapsed > budget * 1.5) {
            let next = scale;
            while (next > .25 && elapsed * (next / scale) ** 2 > budget * .9) next /= 2;
            suggested.current = Math.max(.25, next);
            fastFrames.current = 0;
          } else if (auto && moving && elapsed < budget * .45 && ++fastFrames.current >= 24) {
            suggested.current = Math.min(1, scale * 2);
            fastFrames.current = 0;
          } else if (elapsed >= budget * .45) fastFrames.current = 0;
          // A matching draft frame can paint while the full-resolution frame
          // is queued after release. Discard frames with older edits or times.
          if(current.playing!==snapshot.playing||current.quality!==request.quality||generation!==(current.transport?.generation??0)
            ||(snapshot.playing?current.timeline!==snapshot.timeline:scene(current)!==scene(request))
            ||(!snapshot.playing&&!current.interactive&&(current.timeline!==snapshot.timeline||current.time!==snapshot.time))){
            pending.current = true;
            continue;
          }
          const target = canvas.current;
          if(!target)break;
          if(target.width!==frame.width)target.width=frame.width;
          if(target.height!==frame.height)target.height=frame.height;
          const ctx = target.getContext('2d');
          if (!target || !ctx) break;
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(frame, 0, 0, target.width, target.height);
          if(snapshot.playing&&snapshot.synchronizeStart)transport?.firstFrameReady(generation);
          const latency=performance.now()-received;
          lastFrame.current={frame:frameIndex,generation,timeline:request.timeline,scale,playing};
          const now=performance.now(),presentations=presentationTimes.current;
          if(playing){presentations.push(now);while(presentations.length>1&&presentations[0]<now-1000)presentations.shift();}
          const presentationFps=presentations.length>1?(presentations.length-1)*1000/(now-presentations[0]):0;
          if(moving){
            latencies.current.push(latency);
            if(latencies.current.length>60)latencies.current.shift();
          }
          if (performance.now() - metricAt.current > 140 || !moving) {
            metricAt.current = performance.now();
            const samples=latencies.current;
            const p95=samples.length>=5?[...samples].sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1]:undefined;
            setMetric(`${request.playing?`${presentationFps.toFixed(1)} / ${request.fps} fps · `:''}${latency.toFixed(1)} ms${p95!==undefined?` · P95 ${p95.toFixed(1)} ms`:''}${scale < 1 ? ` · ${Math.round(scale * 100)}% preview` : ''}`);
          }
          window.dispatchEvent(new CustomEvent('huelith-video-frame', { detail: {
            timestamp: request.time, processingMs: elapsed, latencyMs:latency, pendingVersions:requestVersion.current-version,
            width: target.width, height: target.height, playing: request.playing, presentationFps, projectFps:request.fps,
            previewScale: scale, effects: activeClips(request.timeline, request.time).flatMap(clip => (clip.effects ?? []).map(effect => ({
              clip: clip.id, id: effect.id, kind: effect.kind, amount: evaluateVideoEffect(effect, Math.max(0, request.time - clip.start)).amount,
            }))),
          } }));
          if(snapshot.playing)break;
        } catch (error) {
          if (controller.signal.aborted) continue;
          if(snapshot.playing&&snapshot.synchronizeStart)transport?.firstFrameReady(generation);
          latest.current.onError(String(error));
          break;
        }
      }
    } finally {
      working.current = false;
      if ((pending.current||warm.current) && lifetime.current && !scheduled.current) schedule();
    }
  }

  function schedule(immediate=false) {
    if (working.current || scheduled.current) return;
    if(immediate){void drain();return;}
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = 0;
      void drain();
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    const worker = new VideoEffectsWorkerClient();
    const decoderPool=new VideoDecoderPool();
    effectWorker.current = worker;
    decoders.current=decoderPool;
    lifetime.current = controller;
    worker.prewarm();
    return () => {
      lifetime.current = undefined;
      controller.abort();
      worker.dispose();
      decoderPool.dispose();
      decoders.current=undefined;
      effectWorker.current = undefined;
      warm.current?.controller.abort();
      warm.current=undefined;
      cancelAnimationFrame(scheduled.current);
      scheduled.current = 0;
      for (const renderer of pool.current.values()) renderer.dispose();
      pool.current.clear();
      suggested.current = .5;
      latencies.current=[];
      fastFrames.current = 0;
    };
  }, [props.width, props.height, props.fps]);

  useEffect(() => {
    warm.current?.controller.abort();
    warm.current=undefined;
    requestedAt.current=performance.now();
    requestVersion.current++;
    lastFrame.current=undefined;
    pending.current = true;
    schedule(props.playing||!!props.interactive);
  }, [props.timeline, props.playing?0:props.time, props.playing, props.interactive, props.quality, props.width, props.height, props.fps,props.transparent]);

  useEffect(()=>{
    presentationTimes.current=[];
    lastFrame.current=undefined;
    clockSample.current={time:props.time,at:performance.now()};
    decoders.current?.setPlayback(props.playing);
    if(!props.playing){for(const item of pool.current.values())item.setPlayback(false);return;}
    let frame=0;
    const tick=()=>{
      if(!working.current){pending.current=true;schedule(true);}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[props.playing,props.width,props.height,props.fps]);

  useEffect(()=>{
    if(!props.cacheRequest||props.cacheRequest===warmed.current||props.playing||props.interactive)return;
    warmed.current=props.cacheRequest;
    warm.current?.controller.abort();
    warm.current={controller:new AbortController()};
    schedule();
  },[props.cacheRequest,props.playing,props.interactive]);

  return <>
    <canvas ref={canvas} width={props.width} height={props.height} className="hv-preview-canvas" aria-label="Composited video frame" />
    {metric && <span className="hv-preview-metric">{metric}</span>}
  </>;
}
