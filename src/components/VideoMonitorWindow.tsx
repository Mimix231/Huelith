import {useEffect,useRef,useState} from 'react';
import {emitTo,listen} from '@tauri-apps/api/event';
import {invoke} from '@tauri-apps/api/core';
import type {VideoTimeline} from '../editor/video/timeline';
import {isNativeMediaDesktop} from '../editor/video/native-media';
import VideoPreviewCanvas from './VideoPreviewCanvas';
import './VideoWorkspace.css';

type MonitorScene={timeline:VideoTimeline;width:number;height:number;fps:number;quality:number;key:string};
type MonitorClock={time:number;playing:boolean;interactive:boolean;key:string};
const ready='huelith-video-monitor-ready',sceneEvent='huelith-video-monitor-scene',clockEvent='huelith-video-monitor-clock';

export function useDetachedMonitor(scene:MonitorScene,clock:MonitorClock){
  const [open,setOpen]=useState(false);
  const latest=useRef({scene,clock});latest.current={scene,clock};
  useEffect(()=>{
    if(!isNativeMediaDesktop())return;
    let mounted=true;
    const unregister=listen(ready,()=>{
      if(!mounted)return;
      setOpen(true);
      void emitTo('video-monitor',sceneEvent,latest.current.scene).then(()=>emitTo('video-monitor',clockEvent,latest.current.clock)).catch(()=>{});
    });
    return ()=>{mounted=false;void unregister.then(remove=>remove()).catch(()=>{});void invoke('video_close_monitor').catch(()=>{});};
  },[]);
  useEffect(()=>{
    if(open)void emitTo('video-monitor',sceneEvent,scene).catch(()=>setOpen(false));
  },[open,scene]);
  useEffect(()=>{
    if(open)void emitTo('video-monitor',clockEvent,clock).catch(()=>setOpen(false));
  },[open,clock]);
  return ()=>invoke<void>('video_open_monitor');
}

export default function VideoMonitorWindow(){
  const [scene,setScene]=useState<MonitorScene>(),[clock,setClock]=useState<MonitorClock>(),[error,setError]=useState('');
  useEffect(()=>{
    let mounted=true;
    const listeners=Promise.all([
      listen<MonitorScene>(sceneEvent,event=>{if(mounted){setScene(event.payload);setError('');}}),
      listen<MonitorClock>(clockEvent,event=>{if(mounted)setClock(event.payload);}),
    ]);
    void listeners.then(()=>{if(mounted)return emitTo('main',ready);}).catch(reason=>{if(mounted)setError(String(reason));});
    return ()=>{mounted=false;void listeners.then(registered=>registered.forEach(remove=>remove())).catch(()=>{});};
  },[]);
  return <main className="hv-detached-monitor">
    {scene?<div style={{aspectRatio:scene.width/scene.height}}><VideoPreviewCanvas key={scene.key} timeline={scene.timeline}
      width={scene.width} height={scene.height} fps={scene.fps} quality={scene.quality} time={clock?.key===scene.key?clock.time:0}
      playing={clock?.key===scene.key&&clock.playing} interactive={clock?.key===scene.key&&clock.interactive} onError={setError}/></div>
      :<span>Waiting for Video Studio…</span>}
    {error&&<p role="alert">{error}</p>}
  </main>;
}
