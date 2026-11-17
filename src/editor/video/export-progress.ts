import type {NativeFrameStages} from './native-media';
/** Presentation-only export telemetry. Never skips, coalesces, or fabricates frames. */
export type ExportPhase = 'preparing' | 'initializing' | 'rendering' | 'finalizing' | 'verifying' | 'verified';
export type ExportFrameTelemetry = { phase: ExportPhase; renderMs?: number; encodeMs?: number; elapsedMs?: number; sourceMs?:number; compositeMs?:number; readbackMs?:number; envelopeMs?:number; native?:NativeFrameStages; staticReuse?:boolean; sourceBackend?:string; previewDataUrl?:string };
export type ExportProgress = { message:string; fraction:number; fps:number; remainingSeconds:number|null; previewDataUrl?:string };

export function formatExportDuration(seconds:number):string {
  if(!Number.isFinite(seconds)||seconds<0)return 'calculating';
  const whole=Math.ceil(seconds);
  const hours=Math.floor(whole/3600),minutes=Math.floor(whole%3600/60),secs=whole%60;
  return hours?`${hours}h ${minutes}m`:minutes?`${minutes}m ${secs}s`:`${secs}s`;
}

/** An acknowledged encode is authoritative; the display rate is throttled, not the job. */
export function createExportProgressTracker(
  emit:(value:ExportProgress)=>void,
  opts:{intervalMs?:number;now?:()=>number;frameBytes?:number}={},
){
  const now=opts.now??(()=>performance.now()),interval=Math.max(80,opts.intervalMs??200);
  const frameBytes=opts.frameBytes&&Number.isSafeInteger(opts.frameBytes)&&opts.frameBytes>0?opts.frameBytes:0;
  const begin=now();let last=-Infinity,lastFrame=0,lastTime=begin,speed=0;
  let measurements=0,renderTotal=0,decodeTotal=0,composeTotal=0,encodeTotal=0;
  let nativeMeasurements=0,readbackTotal=0,envelopeTotal=0,nativeCopyTotal=0,queueTotal=0,
    bufferTotal=0,convertTotal=0,submitTotal=0,audioTotal=0,nativeTotal=0;
  let transferredBytes=0,repeatedFrames=0;
  const renderSamples:number[]=[];
  let sawDecoder='Native timeline engine';
  const percentile=(values:readonly number[],p:number)=>{
    if(!values.length)return 0;
    const sorted=[...values].sort((a,b)=>a-b);
    return sorted[Math.max(0,Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1))];
  };
  return (completed:number,total:number,details?:ExportFrameTelemetry)=>{
    const current=now();
    const isTerminal=details?.phase==='verified';
    if(details?.phase==='rendering'&&Number.isFinite(details.renderMs)&&Number.isFinite(details.encodeMs)){
      measurements++;renderTotal+=details.renderMs!;encodeTotal+=details.encodeMs!;
      if(details.sourceBackend==='Rust retained-frame encoder')repeatedFrames++;
      else if(frameBytes)transferredBytes+=frameBytes;
      decodeTotal+=Number.isFinite(details.sourceMs)?details.sourceMs!:0;
      composeTotal+=Number.isFinite(details.compositeMs)?details.compositeMs!:0;
      if(measurements%40===1)renderSamples.push(details.renderMs!);
      if(details.sourceBackend)sawDecoder=details.sourceBackend;
      readbackTotal+=Number.isFinite(details.readbackMs)?details.readbackMs!:0;
      envelopeTotal+=Number.isFinite(details.envelopeMs)?details.envelopeMs!:0;
      const measured=details.native;
      if(measured && Number.isFinite(measured.nativeTotalMs) && measured.nativeTotalMs>0){
        nativeMeasurements++;
        nativeCopyTotal+=measured.copyMs;
        queueTotal+=measured.queueMs;
        bufferTotal+=measured.bufferMs;
        convertTotal+=measured.convertMs;
        submitTotal+=measured.submitMs;
        audioTotal+=measured.audioMs;
        nativeTotal+=measured.nativeTotalMs;
      }
    }
    if(current-last<interval&&completed>0&&completed<total&&!isTerminal)return;
    const delta=Math.max(.001,(current-lastTime)/1000);
    if(completed>lastFrame){
      const instant=(completed-lastFrame)/delta;
      speed=speed?speed*.7+instant*.3:instant;
      lastFrame=completed;lastTime=current;
    }
    const safeTotal=Math.max(1,total);
    const fps=Math.max(0,speed);
    const remaining=fps>0.05&&completed<total?(total-completed)/fps:null;
    const label=details?.phase==='preparing'?'Loading source footage and composing first frame'
      :details?.phase==='initializing'?'Starting Windows Media Foundation encoder'
      :details?.phase==='finalizing'?'Finalizing MP4 container'
      :details?.phase==='verifying'?'Verifying exported video'
      :details?.phase==='verified'?'Export verified'
      :`Rendering + encoding · ${completed.toLocaleString()} / ${total.toLocaleString()} frames`;
    // Raw pixel throughput is NOT network download speed or final MP4 bitrate.
    // It is the count of ACKNOWLEDGED 4-byte-per-pixel frames per second.
    const rate=details?.phase==='rendering'&&fps>0?` · ${fps.toFixed(1)} fps`+
      (details?.sourceBackend==='Rust retained-frame encoder'?' · retained frame (no RGBA IPC)':
        frameBytes?` · raw ${(fps*frameBytes/1_000_000).toFixed(1)} MB/s`:''):'';
    const steps=details?.phase==='rendering'&&Number.isFinite(details.renderMs)&&Number.isFinite(details.encodeMs)
      ?` · render ${details.renderMs!.toFixed(0)} ms / encode ${details.encodeMs!.toFixed(0)} ms`:'';
    const stages=details?.phase==='rendering'&&Number.isFinite(details.sourceMs)&&Number.isFinite(details.compositeMs)
      ?` · source ${details.sourceMs!.toFixed(0)} ms / composite ${details.compositeMs!.toFixed(0)} ms${details.staticReuse?' (static frame reused)':''}`:'';
    const nativeStages=details?.phase==='rendering'&&details.native&&details.native.nativeTotalMs>0
      ?` · transfer ${details.native.copyMs.toFixed(0)} / pixel ${details.native.convertMs.toFixed(0)}`+
        ` / MF submit ${details.native.submitMs.toFixed(0)}`+
        ` / audio ${details.native.audioMs.toFixed(0)}`+
        ` / queue ${details.native.queueMs.toFixed(0)} ms`+
        (details.native.inputFormat?` · ${details.native.inputFormat} input`:'' ):'';
    const decoder=details?.phase==='rendering'&&details.sourceBackend?` · ${details.sourceBackend}`:'';
    const eta=details?.phase==='rendering' &&remaining!==null?` · ~${formatExportDuration(remaining)} left`:'';
    const fraction=isTerminal?1:Math.min(.995,Math.max(0,completed/safeTotal));
    last=current;
    const summary=isTerminal&&measurements>0
      ?` · ${measurements.toLocaleString()} frames in ${formatExportDuration((current-begin)/1000)}`+
        ` · render avg ${(renderTotal/measurements).toFixed(1)} ms (p95 ${percentile(renderSamples,.95).toFixed(1)} ms)`+
        ` · decode ${(decodeTotal/measurements).toFixed(1)} ms`+
        ` · composite ${(composeTotal/measurements).toFixed(1)} ms`+
        ` · readback ${(readbackTotal/measurements).toFixed(1)} ms`+
        ` · envelope ${(envelopeTotal/measurements).toFixed(1)} ms`+
        ` · encode round-trip ${(encodeTotal/measurements).toFixed(1)} ms · ${sawDecoder}`+
        (frameBytes?` · actual RGBA IPC ${(transferredBytes/Math.max(.001,(current-begin)/1000)/1_000_000).toFixed(1)} MB/s`+
          ` · ${repeatedFrames} native frame repeats`:'')+
        (nativeMeasurements?` · native buffer ${(bufferTotal/nativeMeasurements).toFixed(1)}`+
          ` / convert ${(convertTotal/nativeMeasurements).toFixed(1)}`+
          ` / MF submit ${(submitTotal/nativeMeasurements).toFixed(1)}`+
          ` / audio ${(audioTotal/nativeMeasurements).toFixed(1)}`+
          ` / IPC copy ${(nativeCopyTotal/nativeMeasurements).toFixed(1)}`+
          ` / queue ${(queueTotal/nativeMeasurements).toFixed(1)}`+
          ` / native total ${(nativeTotal/nativeMeasurements).toFixed(1)} ms`: ''):'';
    emit({message:label+rate+steps+stages+nativeStages+decoder+eta+summary,fraction,fps,remainingSeconds:remaining,
      previewDataUrl:details?.previewDataUrl});
  };
}
