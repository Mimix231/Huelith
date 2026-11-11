import { useEffect, useMemo, useRef,useState } from 'react';
import type { VideoTimeline } from '../editor/video/timeline';
import {audioGainAt,audioPanAt,audioPositionAt,audioVoiceMixAt,timelineAudioSources} from '../editor/video/audio-plan';
import voiceDspUrl from '../editor/video/voice-dsp.js?url';
import VideoLevelMeter,{createVideoMeterBus,MASTER_AUDIO_BUS,type VideoMeterBus} from './VideoLevelMeter';

type Voice = { element: HTMLAudioElement; path: string; gain?: GainNode; pan?:StereoPannerNode; source?: MediaElementAudioSourceNode;bus?:string;
  dsp?:AudioWorkletNode;dspSettings?:string };
type Props = { timeline: VideoTimeline; sources: Record<string, string>; time: number; playing: boolean;meters?:VideoMeterBus;muted?:boolean };
type Channel={input:GainNode;split:ChannelSplitterNode;left:AnalyserNode;right:AnalyserNode;clippedAt:number};

function channel(context:AudioContext,output:AudioNode):Channel{
  const input=context.createGain(),split=context.createChannelSplitter(2);
  const left=context.createAnalyser(),right=context.createAnalyser();
  left.fftSize=right.fftSize=2048;
  input.connect(output);input.connect(split);split.connect(left,0);split.connect(right,1);
  return {input,split,left,right,clippedAt:-Infinity};
}

function closeChannel(bus:Channel){
  bus.input.disconnect();bus.split.disconnect();bus.left.disconnect();bus.right.disconnect();
}

function release(voice: Voice) {
  voice.element.pause();
  voice.element.removeAttribute('src');
  voice.element.load();
  voice.source?.disconnect();
  voice.gain?.disconnect();
  voice.pan?.disconnect();
  voice.dsp?.disconnect();voice.dsp?.port.close();
}

export default function VideoAudioPreview({ timeline, sources, time, playing,meters:shared,muted=false }: Props) {
  const local=useMemo(createVideoMeterBus,[]);
  const meters=shared??local;
  const voices = useRef(new Map<string, Voice>());
  const audio = useRef<AudioContext | null>(null);
  const master = useRef<Channel | null>(null);
  const buses = useRef(new Map<string,Channel>());
  const [dspReady,setDspReady]=useState(false);
  const plan = useMemo(() => timelineAudioSources(timeline), [timeline]);

  useEffect(() => () => {
    for (const voice of voices.current.values()) release(voice);
    voices.current.clear();
    for(const bus of buses.current.values())closeChannel(bus);
    buses.current.clear();
    if(master.current)closeChannel(master.current);
    master.current = null;
    meters.publish({});
    void audio.current?.close();
    audio.current = null;
  }, []);

  useEffect(() => {
    if (!playing) { meters.publish({}); return; }
    if (!audio.current) {
      const context = new AudioContext();
      audio.current = context;
      master.current=channel(context,context.destination);
      void context.audioWorklet?.addModule(voiceDspUrl).then(()=>{if(audio.current===context)setDspReady(true);}).catch(()=>{});
    }
    void audio.current.resume().catch(() => {});
    const samples = new Float32Array(2048);
    const timer = setInterval(() => {
      if(!master.current)return;
      const now=performance.now(),levels:Record<string,{peak:number;clipped:boolean}>={};
      for(const [id,bus] of [[MASTER_AUDIO_BUS,master.current] as const,...buses.current]){
        let peak=0;
        for(const analyser of [bus.left,bus.right]){
          analyser.getFloatTimeDomainData(samples);
          for(const value of samples)peak=Math.max(peak,Math.abs(value));
        }
        if(peak>=1)bus.clippedAt=now;
        levels[id]={peak,clipped:now-bus.clippedAt<1500};
      }
      meters.publish(levels);
    }, 50);
    return () => clearInterval(timer);
  }, [playing,meters]);
  useEffect(()=>{
    if(audio.current&&master.current)master.current.input.gain.setTargetAtTime(muted?0:1,audio.current.currentTime,.008);
  },[muted,playing]);

  useEffect(() => {
    const keep = new Set<string>();
    const active = plan.filter(source => source.start < time + .5 && source.start + source.duration > time);
    for (const source of active) {
      const url = sources[source.assetId ?? ''];
      if (!url || !source.id) continue;
      keep.add(source.id);
      let voice = voices.current.get(source.id);
      if (voice?.path !== url) {
        if (voice) release(voice);
        const element = document.createElement('audio');
        element.preload = 'auto';
        element.crossOrigin = 'anonymous';
        element.preservesPitch = false;
        element.src = url;
        voice = { element, path: url };
        voices.current.set(source.id, voice);
      }
      const element = voice.element;
      const context = audio.current;
      if (context && master.current && !voice.gain) {
        voice.source = context.createMediaElementSource(element);
        voice.gain = context.createGain();
        voice.pan=context.createStereoPanner();
        voice.source.connect(voice.gain);
        voice.gain.connect(voice.pan);
      }
      const busId=source.trackId??MASTER_AUDIO_BUS;
      if(context&&master.current&&voice.pan&&voice.bus!==busId){
        let bus=buses.current.get(busId);
        if(!bus&&busId!==MASTER_AUDIO_BUS){bus=channel(context,master.current.input);buses.current.set(busId,bus);}
        voice.pan.disconnect();voice.pan.connect((bus??master.current).input);voice.bus=busId;
      }
      const gain = audioGainAt(source, time);
      const settings={channelMode:source.channelMode??'stereo',mode:source.voice?.mode};
      if(context&&voice.gain&&voice.pan&&dspReady&&(source.voice||settings.channelMode!=='stereo'||voice.dsp)){
        const key=JSON.stringify(settings);
        if(!voice.dsp){
          voice.dsp=new AudioWorkletNode(context,'huelith-voice',{outputChannelCount:[2],processorOptions:settings});
          voice.source!.disconnect();voice.source!.connect(voice.dsp);voice.dsp.connect(voice.gain);
          voice.dspSettings=key;
        }else if(voice.dspSettings!==key){voice.dsp.port.postMessage(settings);voice.dspSettings=key;}
        voice.dsp.parameters.get('mix')?.setTargetAtTime(audioVoiceMixAt(source,time),context.currentTime,.008);
      }
      if (voice.gain) voice.gain.gain.setTargetAtTime(gain, context!.currentTime, .008);
      else element.volume = Math.min(1, gain);
      voice.pan?.pan.setTargetAtTime(audioPanAt(source,time),context!.currentTime,.008);
      const { sourceTime, rate } = audioPositionAt(source, time);
      const audible = playing && time >= source.start;
      if (element.playbackRate !== rate) element.playbackRate = Math.min(16, Math.max(.0625, rate));
      if (!element.seeking && Math.abs(element.currentTime - sourceTime) > (audible && !element.paused ? .07 : .0001)) {
        try { element.currentTime = sourceTime; } catch { /* Metadata is loading. */ }
      }
      if (audible) {
        if (element.paused) void element.play().catch(() => {});
      } else element.pause();
    }
    for (const [id, voice] of voices.current) if (!keep.has(id)) {
      release(voice);
      voices.current.delete(id);
    }
    const activeBuses=new Set([...voices.current.values()].map(voice=>voice.bus));
    for(const [id,bus] of buses.current)if(!activeBuses.has(id)){closeChannel(bus);buses.current.delete(id);}
  }, [plan, sources, time, playing,dspReady]);

  return <VideoLevelMeter bus={meters}/>;
}
