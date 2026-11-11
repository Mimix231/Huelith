import {useEffect,useMemo,useRef,useState} from 'react';
import {
  AUDIO_METER_STEP,AUDIO_RATE,AUDIO_WINDOW,audioBufferFor,PreviewAudioWindows,type AudioWindow,
} from '../editor/video/preview-audio';
import {isNativeMediaDesktop,type NativeAudioSource} from '../editor/video/native-media';
import type {VideoPlaybackTransport} from '../editor/video/playback-transport';
import VideoLevelMeter,{createVideoMeterBus,MASTER_AUDIO_BUS,type VideoMeterBus} from './VideoLevelMeter';

type Props={
  plan:NativeAudioSource[];sources:Record<string,string>;time:number;playing:boolean;
  transport:VideoPlaybackTransport;meters?:VideoMeterBus;muted?:boolean;onError:(message:string)=>void;
};
type Segment={first:number;offset:number;count:number;window:AudioWindow};
const startLead=.055;
const emptyUrls:Record<string,string>={};
const firstSample=(sample:number)=>Math.floor(sample/AUDIO_WINDOW)*AUDIO_WINDOW;

function outputClock(context:AudioContext){
  const stamp=context.getOutputTimestamp?.();
  if(stamp?.contextTime&&stamp.performanceTime&&Math.abs(performance.now()-stamp.performanceTime)<500)
    return Math.min(context.currentTime,stamp.contextTime+(performance.now()-stamp.performanceTime)/1000);
  return Math.max(0,context.currentTime-context.baseLatency);
}

export default function VideoAudioPreview({plan,sources,time,playing,transport,meters:shared,muted=false,onError}:Props){
  const signature=useMemo(()=>JSON.stringify(plan),[plan]);
  const urls=isNativeMediaDesktop()&&plan.every(source=>!source.path.startsWith('browser:'))?emptyUrls:sources;
  const local=useMemo(createVideoMeterBus,[]),meters=shared??local;
  const cache=useRef<PreviewAudioWindows|undefined>(undefined);
  const context=useRef<AudioContext|undefined>(undefined);
  const volume=useRef<GainNode|undefined>(undefined);
  const monitorMuted=useRef(muted);monitorMuted.current=muted;
  const [buffering,setBuffering]=useState(false);

  useEffect(()=>{
    const next=new PreviewAudioWindows(JSON.parse(signature) as NativeAudioSource[],urls);
    cache.current=next;
    return()=>{next.close();if(cache.current===next)cache.current=undefined;};
  },[signature,urls]);
  useEffect(()=>()=>{void context.current?.close();context.current=undefined;volume.current=undefined;},[]);
  useEffect(()=>{
    if(volume.current&&context.current)volume.current.gain.setTargetAtTime(muted?0:1,context.current.currentTime,.009);
  },[muted]);
  useEffect(()=>{
    if(playing||!plan.length||!cache.current)return;
    const window=cache.current,first=firstSample(Math.round(time*AUDIO_RATE));
    const timer=setTimeout(()=>{void window.get(first).catch(()=>{});},95);
    return()=>clearTimeout(timer);
  },[playing,plan.length,time,signature,urls]);

  useEffect(()=>{
    const windows=cache.current;
    if(!playing||!plan.length||!windows){
      if(playing)transport.continueWithoutAudio(transport.generation);
      setBuffering(false);meters.publish({});
      return;
    }
    const generation=transport.generation;
    transport.holdForAudio(generation);
    setBuffering(true);
    const loop=transport.span(),start=loop?Math.round(loop.start*AUDIO_RATE):0;
    const end=Math.round((loop?.end??transport.end)*AUDIO_RATE);
    let cursor=Math.max(start,Math.round(transport.time()*AUDIO_RATE));
    if(loop&&cursor>=end)cursor=start;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    let bufferDeadline:ReturnType<typeof setTimeout>|undefined;
    let nextAudioTime=0;
    const scheduled=new Set<AudioBufferSourceNode>();
    const levelWindows=new Map<number,AudioWindow>();
    const clippedAt=new Map<string,number>();
    let analyzer:AnalyserNode|undefined;

    async function nextSegment():Promise<Segment|undefined>{
      if(cursor>=end){if(!loop||end<=start)return;cursor=start;}
      const first=firstSample(cursor),offset=cursor-first,count=Math.min(AUDIO_WINDOW-offset,end-cursor);
      const window=await windows!.get(first);
      if(cancelled)return;
      cursor+=count;
      return {first,offset,count,window};
    }

    function schedule(audio:AudioContext,segment:Segment){
      const node=audio.createBufferSource();
      node.buffer=audioBufferFor(audio,segment.window);
      node.connect(volume.current!);
      scheduled.add(node);
      node.onended=()=>{scheduled.delete(node);node.disconnect();};
      node.start(nextAudioTime,segment.offset/AUDIO_RATE,segment.count/AUDIO_RATE);
      nextAudioTime+=segment.count/AUDIO_RATE;
      levelWindows.set(segment.first,segment.window);
      while(levelWindows.size>7)levelWindows.delete(levelWindows.keys().next().value!);
    }

    function publishLevels(audio:AudioContext,samples:Float32Array){
      if(!analyzer)return;
      const sample=Math.round(transport.time()*AUDIO_RATE),first=firstSample(sample);
      const peaks={...levelWindows.get(first)?.levels[Math.floor((sample-first)/AUDIO_METER_STEP)]};
      analyzer.getFloatTimeDomainData(samples as Float32Array<ArrayBuffer>);
      let master=0;
      for(const value of samples)master=Math.max(master,Math.abs(value));
      peaks[MASTER_AUDIO_BUS]=master;
      const now=audio.currentTime;
      meters.publish(Object.fromEntries(Object.entries(peaks).map(([id,peak])=>{
        if(peak>=.999)clippedAt.set(id,now);
        return [id,{peak,clipped:now-(clippedAt.get(id)??-Infinity)<1.5}];
      })));
    }

    async function run(){
      const audio=context.current??=new AudioContext({latencyHint:'playback'});
      if(!volume.current){
        const gain=audio.createGain();
        gain.connect(audio.destination);
        volume.current=gain;
      }
      volume.current.gain.value=monitorMuted.current?0:1;
      analyzer=audio.createAnalyser();
      analyzer.fftSize=1024;
      volume.current.connect(analyzer);
      const samples=new Float32Array(1024);
      const resume=audio.resume();
      const initial:Segment[]=[];
      let prepared=0;
      while(prepared<AUDIO_RATE*.55){
        const segment=await nextSegment();
        if(!segment)break;
        initial.push(segment);prepared+=segment.count;
      }
      await resume;
      if(!await transport.awaitFirstFrame(generation))return;
      if(cancelled)return;
      if(!initial.length){transport.continueWithoutAudio(generation);setBuffering(false);return;}
      const startAt=initial[0].first+initial[0].offset;
      nextAudioTime=audio.currentTime+startLead;
      if(!transport.useAudioClock(generation,startAt/AUDIO_RATE,nextAudioTime,()=>outputClock(audio)))return;
      for(const segment of initial)schedule(audio,segment);
      setBuffering(false);
      async function refill(){
        if(cancelled)return;
        publishLevels(audio,samples);
        while(!cancelled&&nextAudioTime-audio.currentTime<2.25){
          if(!loop&&cursor>=end)break;
          const missingAt=cursor>=end?start:cursor;
          bufferDeadline=setTimeout(()=>{
            if(!cancelled){
              transport.holdForAudio(generation,missingAt/AUDIO_RATE);
              setBuffering(true);
            }
          },Math.max(0,(nextAudioTime-outputClock(audio))*1000));
          const segment=await nextSegment();
          clearTimeout(bufferDeadline);
          if(cancelled||!segment)break;
          if(transport.waiting||nextAudioTime<audio.currentTime+.004){
            nextAudioTime=audio.currentTime+startLead;
            transport.useAudioClock(generation,(segment.first+segment.offset)/AUDIO_RATE,nextAudioTime,()=>outputClock(audio));
            setBuffering(false);
          }
          schedule(audio,segment);
        }
        if(!cancelled)timer=setTimeout(()=>{void refill().catch(fail);},45);
      }
      await refill();
    }

    function fail(error:unknown){
      if(cancelled)return;
      clearTimeout(bufferDeadline);
      transport.continueWithoutAudio(generation);
      setBuffering(false);
      onError('Audio preview could not start. '+String(error));
    }
    void run().catch(fail);
    return()=>{
      cancelled=true;
      clearTimeout(timer);
      clearTimeout(bufferDeadline);
      for(const node of scheduled){node.onended=null;node.stop();node.disconnect();}
      if(analyzer){volume.current?.disconnect(analyzer);analyzer.disconnect();}
      meters.publish({});
    };
  },[playing,plan.length>0,signature,urls,transport,meters,onError]);

  return <>
    <VideoLevelMeter bus={meters}/>
    {buffering&&<span className="hv-audio-buffering" role="status">Preparing audio</span>}
  </>;
}
