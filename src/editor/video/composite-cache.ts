import {sourceTimeAt} from './clip-timing';
import {activeClips,type VideoClip,type VideoTimeline} from './timeline';

/** Cache exact preview frames. Object identity of active authored clips keeps
 * edits on other parts of the timeline from invalidating this frame. */
export class CompositeCache {
  private ids=new WeakMap<VideoClip,number>();
  private nextId=0;
  private frames=new Map<string,HTMLCanvasElement>();
  private bytes=0;
  constructor(private readonly budget=64*1024*1024){}

  key(timeline:VideoTimeline,time:number,transparent:boolean,fps:number):string{
    const assets=new Map(timeline.assets.map(asset=>[asset.id,asset]));
    const visit=(scene:VideoTimeline,clock:number):unknown=>{
      const frame=Math.floor((clock+1e-7)*fps)/fps;
      const tracks=new Map(scene.tracks.map(track=>[track.id,track.kind]));
      return [scene.background,activeClips(scene,frame).filter(clip=>tracks.get(clip.trackId)!=='audio').map(clip=>{
        let id=this.ids.get(clip);
        if(id===undefined){id=++this.nextId;this.ids.set(clip,id);}
        const asset=assets.get(clip.assetId??'');
        const media=asset&&[asset.id,asset.path,asset.revision,asset.libraryId,asset.crop,asset.kind,asset.animated,asset.missing];
        return [id,tracks.get(clip.trackId),media,clip.compound&&visit({...clip.compound,assets:scene.assets},sourceTimeAt(clip,frame-clip.start))];
      })];
    };
    return JSON.stringify([time,transparent,visit(timeline,time)]);
  }

  get(key:string):HTMLCanvasElement|undefined{
    const frame=this.frames.get(key);
    if(frame){this.frames.delete(key);this.frames.set(key,frame);}
    return frame;
  }

  put(key:string,frame:HTMLCanvasElement):void{
    const size=frame.width*frame.height*4;
    if(size>this.budget||this.frames.has(key))return;
    this.frames.set(key,frame);this.bytes+=size;
    while(this.bytes>this.budget){
      const oldest=this.frames.keys().next().value!;
      const entry=this.frames.get(oldest)!;
      this.bytes-=entry.width*entry.height*4;
      this.frames.delete(oldest);
    }
  }

  clear():void{this.frames.clear();this.bytes=0;}
}
