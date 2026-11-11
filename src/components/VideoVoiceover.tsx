import {useEffect,useRef,useState} from 'react';
import {Button} from '@mui/material';
import {invoke} from '@tauri-apps/api/core';
import {pcmWave} from '../editor/video/audio-catalogue';
import {isNativeMediaDesktop} from '../editor/video/native-media';

export type VoiceTake={path?:string;file?:File;name:string;duration:number;waveform:number[]};
type Props={onClose:()=>void;onStart:()=>void;onStop:()=>void;onTake:(take:VoiceTake)=>void};

export default function VideoVoiceover(props:Props){
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState('');
  const [status,setStatus]=useState(''),[error,setError]=useState('');
  const [recording,setRecording]=useState(false);
  const stream=useRef<MediaStream|null>(null),recorder=useRef<MediaRecorder|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),live=useRef(true);
  const takeProps=useRef(props);takeProps.current=props;
  async function readDevices(){
    const items=await navigator.mediaDevices?.enumerateDevices();
    if(items&&live.current)setDevices(items.filter(item=>item.kind==='audioinput'&&item.deviceId&&item.deviceId!=='default'));
  }
  useEffect(()=>{
    live.current=true;
    const refresh=()=>{void readDevices().catch(()=>{});};
    refresh();
    navigator.mediaDevices?.addEventListener('devicechange',refresh);
    return()=>{live.current=false;clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();
      navigator.mediaDevices?.removeEventListener('devicechange',refresh);
      stream.current?.getTracks().forEach(track=>track.stop());};
  },[]);
  async function findMicrophones(){
    let access:MediaStream|undefined;
    setError('');setStatus('Checking microphone access…');
    try{
      if(!navigator.mediaDevices)throw Error('Microphone access is unavailable.');
      access=await navigator.mediaDevices.getUserMedia({audio:true});
      await readDevices();
    }catch(reason){if(live.current)setError(String(reason));}
    finally{access?.getTracks().forEach(track=>track.stop());if(live.current)setStatus('');}
  }
  async function start(){
    try{
      setError('');setStatus('Opening microphone…');
      if(!navigator.mediaDevices)throw Error('Microphone access is unavailable.');
      const media=await navigator.mediaDevices.getUserMedia({audio:device?{deviceId:{exact:device}}:true});
      if(!live.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;
      void readDevices().catch(()=>{});
      const recorderInstance=new MediaRecorder(media);
      recorder.current=recorderInstance;
      const chunks:Blob[]=[];
      recorderInstance.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorderInstance.onstop=()=>{
        clearTimeout(timer.current);media.getTracks().forEach(track=>track.stop());
        if(!live.current)return;
        takeProps.current.onStop();setRecording(false);setStatus('Saving voiceover…');
        void (async()=>{
          const blob=new Blob(chunks,{type:recorderInstance.mimeType});
          const buffer=await new OfflineAudioContext(2,1,44100).decodeAudioData(await blob.arrayBuffer());
          if(buffer.duration<.1)throw Error('Record at least a tenth of a second.');
          const {bytes,waveform}=pcmWave(buffer);
          const name='Voiceover '+new Date().toLocaleTimeString()+'.wav';
          const path=isNativeMediaDesktop()?await invoke<string>('video_store_recording',bytes):undefined;
          if(live.current)takeProps.current.onTake({name,path,file:path?undefined:new File([bytes],name,{type:'audio/wav'}),duration:buffer.duration,waveform});
        })().catch(reason=>{if(live.current)setError(String(reason));}).finally(()=>{if(live.current)setStatus('');});
      };
      function count(left:number){
        if(!live.current)return;
        if(left){setStatus('Recording in '+left+'…');timer.current=setTimeout(()=>count(left-1),1000);return;}
        try{
          recorderInstance.start(300);takeProps.current.onStart();setRecording(true);setStatus('Recording');
          timer.current=setTimeout(()=>{if(recorderInstance.state==='recording')recorderInstance.stop();},599000);
        }catch(reason){
          media.getTracks().forEach(track=>track.stop());setError(String(reason));setStatus('');
        }
      }
      count(3);
    }catch(reason){setError(String(reason));setStatus('');stream.current?.getTracks().forEach(track=>track.stop());}
  }
  return <section className="hv-record-dock" aria-label="Record voiceover">
    <header><strong>Record voiceover</strong><button disabled={recording} aria-label="Close voiceover" onClick={props.onClose}>×</button></header>
      <label className="hv-field">Microphone<select value={device} disabled={!!status} onChange={event=>setDevice(event.target.value)}>
        <option value="">System default</option>{devices.map((item,index)=>
          <option key={item.deviceId} value={item.deviceId}>{item.label||'Microphone '+(index+1)}</option>)}</select></label>
      <p>Recording starts at the playhead after a three-second countdown. The new take goes on a Voiceover track.</p>
      {status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}
      <div className="hv-inline-actions">
        <Button size="small" disabled={!!status} onClick={()=>void findMicrophones()}>Find microphones</Button>
        <Button size="small" variant="contained" disabled={!recording&&!!status} onClick={()=>recording?recorder.current?.stop():void start()}>
          {recording?'Stop and save':'Record'}
        </Button>
      </div>
  </section>;
}
