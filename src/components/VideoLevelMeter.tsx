import {useSyncExternalStore} from 'react';

type Level={peak:number;clipped:boolean};
export const MASTER_AUDIO_BUS='master';
const silent={peak:0,clipped:false};

export function createVideoMeterBus(){
  let levels:Record<string,Level>={};
  const listeners=new Set<()=>void>();
  return {
    publish(next:Record<string,Level>){levels=next;for(const listener of listeners)listener();},
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    read(id:string){return levels[id]??silent;},
  };
}
export type VideoMeterBus=ReturnType<typeof createVideoMeterBus>;

export default function VideoLevelMeter({bus,id=MASTER_AUDIO_BUS,name='Master mix'}:{bus:VideoMeterBus;id?:string;name?:string}){
  const level=useSyncExternalStore(bus.subscribe,()=>bus.read(id));
  const db=20*Math.log10(Math.max(.001,level.peak));
  const label=level.peak?db.toFixed(1)+' dBFS':'Silent';
  return <span className="hv-level-meter" title={name+' · '+label+(level.clipped?' · Clipping':'')}>
    <meter className="hv-audio-meter" min={0} max={1} value={Math.max(0,Math.min(1,1+db/60))}
      aria-label={name+' peak level'} aria-valuetext={label}/>
    <i className={level.clipped?'is-clipping':undefined} aria-label={level.clipped?'Clipping':undefined}/>
  </span>;
}
