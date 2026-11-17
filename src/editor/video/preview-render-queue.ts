/** Latest-frame presentation queue for the interactive editor.
 *
 * Scrubbing and authoring changes supersede in-flight work immediately.
 * Playback, however, may take longer than a display refresh: aborting every
 * unfinished frame would starve the monitor. We retain one active frame and
 * coalesce future playback requests into the newest pending frame instead.
 *
 * This scheduler knows nothing about React, decoding or Rust. It is easy to
 * test independently, and is shared by every type of authored preview frame.
 */
export type PreviewFrameRequest<T> = {
  key: string;
  revision: number;
  /** Changes when an audio/video transport is restarted without editing. */
  generation?:number;
  seconds: number;
  mode: 'editing'|'playback';
  payload: T;
};

export type PreviewPresented<T> = {
  request:PreviewFrameRequest<T>;
  elapsedMs:number;
};

export class PreviewRenderQueue<T, R> {
  private pending?:PreviewFrameRequest<T>;
  private latest?:PreviewFrameRequest<T>;
  private active?:{request:PreviewFrameRequest<T>;controller:AbortController};
  private lastPresented='';
  private closed=false;
  private busy=false;

  constructor(
    private readonly render:(request:PreviewFrameRequest<T>,signal:AbortSignal)=>Promise<R>,
    private readonly present:(result:R,info:PreviewPresented<T>)=>void,
    private readonly failed:(error:unknown,request:PreviewFrameRequest<T>)=>void,
    private readonly now:()=>number=()=>performance.now(),
  ){}

  request(request:PreviewFrameRequest<T>){
    if(this.closed)return;
    // Do not repeatedly draw an already presented frame or requeue the same
    // in-flight frame when requestAnimationFrame runs faster than decoding.
    if(request.key===this.lastPresented && !this.active && !this.pending)return;
    if(request.key===this.latest?.key)return;
    this.latest=request;
    this.pending=request;
    if(request.mode==='editing' && this.active?.request.key!==request.key)
      this.active?.controller.abort();
    void this.drain();
  }

  /** Cancel all older revisions, e.g. after changing the clip/effect stack. */
  invalidate(){
    this.pending=undefined;
    this.latest=undefined;
    this.lastPresented='';
    this.active?.controller.abort();
  }

  close(){
    if(this.closed)return;
    this.closed=true;
    this.invalidate();
  }

  private stillRelevant(request:PreviewFrameRequest<T>){
    const latest=this.latest;
    if(this.closed||!latest||latest.revision!==request.revision||
      latest.generation!==request.generation)return false;
    if(latest.key===request.key)return true;
    if(request.mode!=='playback'||latest.mode!=='playback')return false;
    // Showing a frame a quarter second behind the audible transport is worse
    // than dropping it and processing the newest queued frame. For moderately
    // expensive effects, allow a small amount of latency instead of freezing.
    return latest.seconds>=request.seconds && latest.seconds-request.seconds<=.25;
  }

  private async drain(){
    if(this.busy||this.closed)return;
    this.busy=true;
    try{
      while(!this.closed&&this.pending){
        const request=this.pending;
        this.pending=undefined;
        const controller=new AbortController();
        this.active={request,controller};
        const started=this.now();
        try{
          const result=await this.render(request,controller.signal);
          if(!controller.signal.aborted&&this.stillRelevant(request)){
            // Rendering a frame may reveal a clip loading error or a canvas
            // failure; both are routed through the same error callback.
            this.present(result,{request,elapsedMs:this.now()-started});
            this.lastPresented=request.key;
          }
        }catch(error){
          if(!controller.signal.aborted&&this.stillRelevant(request))this.failed(error,request);
        }finally{if(this.active?.controller===controller)this.active=undefined;}
      }
    }finally{
      this.busy=false;
      if(!this.closed&&this.pending)void this.drain();
    }
  }
}
