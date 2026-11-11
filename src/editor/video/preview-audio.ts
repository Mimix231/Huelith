import {invoke} from '@tauri-apps/api/core';
import {audioGainAt,audioPanAt,audioPositionAt,audioVoiceMixAt} from './audio-plan';
import {isNativeMediaDesktop,type NativeAudioSource} from './native-media';

export const AUDIO_RATE=48_000;
export const AUDIO_WINDOW=AUDIO_RATE;
export const AUDIO_METER_STEP=2400;
export type AudioWindow={samples:Int16Array;levels:Record<string,number>[];buffer?:AudioBuffer};

function readPacket(data:ArrayBuffer):AudioWindow {
  const header=new DataView(data),size=header.getUint32(0,true);
  const offset=(4+size+3)&~3;
  if(size>data.byteLength-4||data.byteLength-offset!==AUDIO_WINDOW*4)throw Error('Invalid preview audio packet.');
  const levels=JSON.parse(new TextDecoder().decode(new Uint8Array(data,4,size))) as AudioWindow['levels'];
  return {samples:new Int16Array(data,offset),levels};
}

export function audioBufferFor(context:AudioContext,window:AudioWindow):AudioBuffer {
  if(window.buffer)return window.buffer;
  const buffer=context.createBuffer(2,window.samples.length/2,AUDIO_RATE);
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  for(let frame=0;frame<left.length;frame++){
    left[frame]=window.samples[frame*2]/32768;
    right[frame]=window.samples[frame*2+1]/32768;
  }
  window.buffer=buffer;
  return buffer;
}

/** Only a few seconds of the timeline are retained. Native readers stay open
 * across sequential windows, and a new seek repositions to that source time. */
export class PreviewAudioWindows {
  private readonly native:boolean;
  private readonly windows=new Map<number,Promise<AudioWindow>>();
  private readonly decoded=new Map<string,Promise<AudioBuffer>>();
  private session?:Promise<number>;
  private queue:Promise<unknown>=Promise.resolve();
  private closed=false;

  constructor(private readonly plan:readonly NativeAudioSource[],private readonly urls:Record<string,string>){
    this.native=isNativeMediaDesktop()&&plan.every(source=>!source.path.startsWith('browser:'));
  }

  get(first:number):Promise<AudioWindow>{
    if(this.closed)return Promise.reject(new DOMException('Audio preview closed','AbortError'));
    const cached=this.windows.get(first);
    if(cached){this.windows.delete(first);this.windows.set(first,cached);return cached;}
    const pending=this.queue.catch(()=>{}).then(()=>{
      if(this.closed)throw new DOMException('Audio preview closed','AbortError');
      return this.native?this.readNative(first):this.readWeb(first);
    });
    this.queue=pending;
    this.windows.set(first,pending);
    void pending.catch(()=>{if(this.windows.get(first)===pending)this.windows.delete(first);});
    while(this.windows.size>7)this.windows.delete(this.windows.keys().next().value!);
    return pending;
  }

  close(){
    this.closed=true;
    this.windows.clear();
    this.decoded.clear();
    void this.session?.then(id=>invoke('media_close_preview_audio',{id})).catch(()=>{});
  }

  private async readNative(first:number){
    this.session??=invoke<number>('media_open_preview_audio',{audio:this.plan}).catch(error=>{
      this.session=undefined;
      throw error;
    });
    const id=await this.session;
    if(this.closed)throw new DOMException('Audio preview closed','AbortError');
    return readPacket(await invoke<ArrayBuffer>('media_read_preview_audio',{id,first,count:AUDIO_WINDOW}));
  }

  private decode(url:string):Promise<AudioBuffer>{
    const existing=this.decoded.get(url);
    if(existing)return existing;
    const buffer=fetch(url).then(response=>{
      if(!response.ok)throw Error('Audio source is unavailable.');
      return response.arrayBuffer();
    }).then(bytes=>new OfflineAudioContext(1,1,AUDIO_RATE).decodeAudioData(bytes));
    this.decoded.set(url,buffer);
    void buffer.catch(()=>this.decoded.delete(url));
    while(this.decoded.size>4)this.decoded.delete(this.decoded.keys().next().value!);
    return buffer;
  }

  private async readWeb(first:number):Promise<AudioWindow>{
    const mixed=new Float32Array(AUDIO_WINDOW*2);
    const levels=Array.from({length:AUDIO_WINDOW/AUDIO_METER_STEP},()=>Object.create(null) as Record<string,number>);
    const start=first/AUDIO_RATE,end=(first+AUDIO_WINDOW)/AUDIO_RATE;
    const audible=this.plan.filter(source=>source.start<end&&source.start+source.duration>start);
    for(const source of audible){
      const url=this.urls[source.assetId??''];
      if(!url)continue;
      let buffer:AudioBuffer;
      try{buffer=await this.decode(url);}catch(error){if(source.required)throw error;else continue;}
      const begin=Math.max(0,Math.ceil(source.start*AUDIO_RATE)-first);
      const limit=Math.min(AUDIO_WINDOW,Math.ceil((source.start+source.duration)*AUDIO_RATE)-first);
      const channel=[buffer.getChannelData(0),buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1))];
      const low=[0,0],band=[0,0],envelope=[0,0];
      for(let i=begin;i<limit;i++){
        const time=(first+i)/AUDIO_RATE,{sourceTime}=audioPositionAt(source,time);
        const cursor=sourceTime*buffer.sampleRate,index=Math.floor(cursor),blend=cursor-index;
        const frame=channel.map(data=>(data[index]??0)*(1-blend)+(data[index+1]??0)*blend);
        if(source.channelMode==='left')frame[1]=frame[0];
        if(source.channelMode==='right')frame[0]=frame[1];
        if(source.channelMode==='mono')frame[0]=frame[1]=(frame[0]+frame[1])*.5;
        if(source.voice){
          const mix=audioVoiceMixAt(source,time);
          for(let ch=0;ch<2;ch++){
            const dry=frame[ch];
            let wet=dry;
            switch(source.voice.mode){
              case 'radio':
                low[ch]+=(dry-low[ch])*.0435315;
                band[ch]+=(dry-low[ch]-band[ch])*.329148;
                wet=Math.tanh(band[ch]*2.5)*.82;break;
              case 'warm':
                low[ch]+=(dry-low[ch])*.209919;
                wet=Math.tanh((dry*.56+low[ch]*.74)*1.32)*.9;break;
              case 'robot':wet=dry*(.17+.83*Math.sin((time-source.start)*Math.PI*84));break;
              case 'cleanup':
                envelope[ch]=Math.max(Math.abs(dry),envelope[ch]*.99953714);
                wet=dry*Math.min(1,envelope[ch]/.037)**2;break;
            }
            frame[ch]=dry+(wet-dry)*mix;
          }
        }
        const pan=audioPanAt(source,time),gain=audioGainAt(source,time);
        if(pan<0){const angle=(pan+1)*Math.PI/2;frame[0]+=frame[1]*Math.cos(angle);frame[1]*=Math.sin(angle);}
        if(pan>0){const angle=pan*Math.PI/2;frame[1]+=frame[0]*Math.sin(angle);frame[0]*=Math.cos(angle);}
        mixed[i*2]+=frame[0]*gain;mixed[i*2+1]+=frame[1]*gain;
        const meter=levels[Math.floor(i/AUDIO_METER_STEP)];
        if(source.trackId)meter[source.trackId]=Math.max(meter[source.trackId]??0,Math.abs(frame[0]*gain),Math.abs(frame[1]*gain));
      }
    }
    return {samples:Int16Array.from(mixed,value=>Math.round(Math.max(-1,Math.min(1,value))*32767)),levels};
  }
}
