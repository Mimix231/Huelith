import {useEffect,useRef,useState,type DragEvent, type RefObject} from 'react';
import {getCurrentWebview} from '@tauri-apps/api/webview';
import {isNativeMediaDesktop} from '../editor/video/native-media';

export type FileDropTarget={time:number;trackId:string};
export function useVideoFileDrop(root:RefObject<HTMLElement|null>,timeAt:(x:number)=>number,
  onFiles:(input:string[]|File[],target?:FileDropTarget)=>void){
  const [over,setOver]=useState<'media'|'timeline'>();
  const latest=useRef({timeAt,onFiles});latest.current={timeAt,onFiles};
  function hit(x:number,y:number){
    const lane=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-lane-id]');
    if(!lane||!root.current?.contains(lane)||!lane.dataset.laneId)return;
    return {time:Math.max(0,latest.current.timeAt(x)),trackId:lane.dataset.laneId};
  }
  useEffect(()=>{
    if(!isNativeMediaDesktop())return;
    let mounted=true,unlisten:(()=>void)|undefined;
    void getCurrentWebview().onDragDropEvent(event=>{
      if(!mounted)return;
      const payload=event.payload;
      if(payload.type==='leave'){setOver(undefined);return;}
      const x=payload.position.x/window.devicePixelRatio,y=payload.position.y/window.devicePixelRatio;
      const target=hit(x,y);
      if(payload.type==='drop'){
        setOver(undefined);
        if(root.current?.contains(document.elementFromPoint(x,y)))latest.current.onFiles(payload.paths,target);
      }else setOver(target?'timeline':'media');
    }).then(stop=>{if(mounted)unlisten=stop;else stop();}).catch(()=>{});
    return()=>{mounted=false;unlisten?.();};
  },[]);
  function filesOnly(event:DragEvent){
    return !isNativeMediaDesktop()&&event.dataTransfer.types.includes('Files');
  }
  return {over,handlers:{
    onDragOver:(event:DragEvent)=>{if(filesOnly(event)){event.preventDefault();setOver(hit(event.clientX,event.clientY)?'timeline':'media');}},
    onDragLeave:(event:DragEvent)=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOver(undefined);},
    onDrop:(event:DragEvent)=>{
      if(!filesOnly(event))return;
      event.preventDefault();setOver(undefined);
      latest.current.onFiles(Array.from(event.dataTransfer.files),hit(event.clientX,event.clientY));
    },
  }};
}
