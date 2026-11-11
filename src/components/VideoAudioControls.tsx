import {useState} from 'react';
import {playbackRateAt} from '../editor/video/clip-timing';
import {CHANNEL_MODES,VOICE_MODES,type ChannelMode,type VoiceMode} from '../editor/video/voice-processing';
import type {VideoClip,VideoAsset} from '../editor/video/timeline';
import VideoKeyedValue,{type KeyClock} from './VideoKeyedValue';

type Props={clip:VideoClip;asset?:VideoAsset;clock:KeyClock;disabled:boolean;dialogue:boolean;
  onChange:(patch:Partial<VideoClip>,preview?:boolean)=>void;onCommit:()=>void;onSeparate:()=>void;
  onMatchLoudness?:()=>void;onDialogue:()=>void;onDetect:()=>void;analyzing:boolean};
const DEFAULT_DUCK={amount:.65,attack:.18,release:.4};
const voices:Record<VoiceMode,string>={radio:'Radio',warm:'Warm voice',robot:'Robot',cleanup:'Noise gate'};
const channels:Record<ChannelMode,string>={stereo:'Stereo',left:'Fill from left',right:'Fill from right',mono:'Mix to mono'};
const toDecibels=(value:number)=>value<=.001?-60:20*Math.log10(value);
const fromDecibels=(value:number)=>value<=-60?0:Math.min(2,10**(value/20));

export default function VideoAudioControls({clip,asset,clock,disabled,dialogue,onChange,onCommit,onSeparate,onMatchLoudness,onDialogue,onDetect,analyzing}:Props){
  const [page,setPage]=useState<'Basic'|'Voice'>('Basic');
  const audible=playbackRateAt(clip,0)>0&&!clip.audioMuted;
  const fadeIn=clip.audioFadeIn??clip.fadeIn,fadeOut=clip.audioFadeOut??clip.fadeOut;
  const duck=clip.ducking;
  return <fieldset disabled={disabled} className="hv-audio-inspector">
    <nav className="hv-inspector-subtabs" aria-label="Audio tools">
      <button type="button" aria-pressed={page==='Basic'} onClick={()=>setPage('Basic')}>Basic</button>
      {asset?.kind!=='image'&&asset&&<button type="button" aria-pressed={page==='Voice'} onClick={()=>setPage('Voice')}>Voice</button>}
    </nav>
    {page==='Voice'&&asset?<>
      <label className="hv-field">Voice treatment<select aria-label="Voice treatment" value={clip.voice?.mode??''} onChange={event=>{
        const mode=event.target.value as VoiceMode|'';
        onChange({voice:mode?{mix:.75,...clip.voice,mode}:undefined});
      }}><option value="">None</option>{VOICE_MODES.map(mode=><option key={mode} value={mode}>{voices[mode]}</option>)}</select></label>
      {clip.voice&&<VideoKeyedValue label="Voice mix" value={clip.voice.mix} min={0} max={100} step={1} unit="%" clock={clock}
        encode={value=>value*100} decode={value=>value/100} keys={clip.voice.keys} onCommit={onCommit}
        onValue={(mix,preview)=>onChange({voice:{...clip.voice!,mix}},preview)}
        onKeys={(keys,preview,mix)=>onChange({voice:{...clip.voice!,mix:mix??clip.voice!.mix,keys}},preview)}/>}
    </>:<>
      <VideoKeyedValue label="Volume" value={clip.volume} min={-60} max={6.02} step={.1} unit="dB" clock={clock}
        encode={toDecibels} decode={fromDecibels} keys={clip.volumeKeys} onCommit={onCommit}
        onValue={(volume,preview)=>onChange({volume},preview)}
        onKeys={(volumeKeys,preview,volume)=>onChange({volumeKeys,volume:volume??clip.volume},preview)}/>
      <VideoKeyedValue label="Pan" value={clip.pan??0} min={-100} max={100} step={1} clock={clock}
        encode={value=>value*100} decode={value=>value/100} keys={clip.panKeys} onCommit={onCommit}
        onValue={(pan,preview)=>onChange({pan},preview)} onKeys={(panKeys,preview,pan)=>onChange({panKeys,pan:pan??clip.pan},preview)}/>
      <VideoKeyedValue label="Audio fade in" value={fadeIn} min={0} max={Math.max(0,clip.duration-fadeOut)} step={1/clock.fps}
        unit="s" onValue={(audioFadeIn,preview)=>onChange({audioFadeIn},preview)} onCommit={onCommit}/>
      <VideoKeyedValue label="Audio fade out" value={fadeOut} min={0} max={Math.max(0,clip.duration-fadeIn)} step={1/clock.fps}
        unit="s" onValue={(audioFadeOut,preview)=>onChange({audioFadeOut},preview)} onCommit={onCommit}/>
      {asset&&<label className="hv-field">Channel fill<select value={clip.channelMode??'stereo'}
        onChange={event=>onChange({channelMode:event.target.value as ChannelMode})}>
        {CHANNEL_MODES.map(mode=><option value={mode} key={mode}>{channels[mode]}</option>)}</select></label>}
      <div className="hv-inline-actions">
        <button aria-pressed={!!clip.audioMuted} onClick={()=>onChange({audioMuted:!clip.audioMuted})}>{clip.audioMuted?'Unmute':'Mute clip'}</button>
        {asset?.kind==='video'&&<button disabled={asset.hasAudio!==true||!audible} onClick={onSeparate}>Separate audio</button>}
        {onMatchLoudness&&<button onClick={onMatchLoudness}>Match loudness</button>}
        <button aria-pressed={dialogue} onClick={onDialogue}>{dialogue?'Dialogue track':'Mark track as dialogue'}</button>
      </div>
      {!dialogue&&<label className="hv-source-favorite"><input type="checkbox" checked={!!duck}
        onChange={event=>onChange({ducking:event.target.checked?DEFAULT_DUCK:undefined})}/> Lower under dialogue</label>}
      {duck&&!dialogue&&<>
        <VideoKeyedValue label="Ducking amount" value={duck.amount} min={0} max={100} step={1} unit="%"
          encode={value=>value*100} decode={value=>value/100} onCommit={onCommit}
          onValue={(amount,preview)=>onChange({ducking:{...duck,amount}},preview)}/>
        {(['attack','release'] as const).map(name=><VideoKeyedValue key={name} label={`Ducking ${name}`} value={duck[name]}
          min={0} max={10} step={.01} unit="s" range={false} onCommit={onCommit}
          onValue={(value,preview)=>onChange({ducking:{...duck,[name]:value}},preview)}/>)}
      </>}
      {asset&&<button disabled={analyzing||asset.hasAudio===false||!audible} onClick={onDetect}>{analyzing?'Listening for beats…':'Detect beats in clip'}</button>}
    </>}
  </fieldset>;
}
