export type PlaybackLoop = { start: number; end: number };

export class VideoPlaybackTransport {
  private origin = 0;
  private startedAt = 0;
  private running = false;
  private duration = 0;
  private direction: 1 | -1 = 1;
  private loop: () => PlaybackLoop | undefined = () => undefined;
  private clock: () => number;
  private waitingForAudio = false;
  private epoch = 0;
  private firstVideoFrame?:{ready:Promise<boolean>;finish:(ready:boolean)=>void};

  constructor(private readonly now = () => performance.now()) { this.clock=now; }

  start(time: number, duration: number, direction: 1 | -1 = 1, loop: () => PlaybackLoop | undefined = () => undefined, bufferAudio=false, waitForVideo=false) {
    this.firstVideoFrame?.finish(false);
    this.firstVideoFrame=undefined;
    this.origin = time;
    this.duration = duration;
    this.direction = direction;
    this.loop = loop;
    this.clock=this.now;
    this.startedAt = this.clock();
    this.running = true;
    this.waitingForAudio=bufferAudio&&direction===1;
    this.epoch++;
    if(this.waitingForAudio&&waitForVideo){
      let finish!:(ready:boolean)=>void;
      const ready=new Promise<boolean>(resolve=>{finish=resolve;});
      this.firstVideoFrame={ready,finish};
    }
  }

  get generation(){return this.epoch;}
  get waiting(){return this.waitingForAudio;}
  get advancing(){return this.running&&!this.waitingForAudio&&this.clock()>=this.startedAt;}
  get end(){return this.duration;}

  awaitFirstFrame(generation:number):Promise<boolean>{
    if(!this.running||generation!==this.epoch)return Promise.resolve(false);
    return this.firstVideoFrame?.ready??Promise.resolve(true);
  }

  firstFrameReady(generation:number){
    if(generation!==this.epoch)return;
    this.firstVideoFrame?.finish(true);
    this.firstVideoFrame=undefined;
  }

  span():PlaybackLoop|undefined {
    const loop=this.loop();
    return loop&&this.direction===1&&loop.end<=this.duration&&loop.end>loop.start?loop:undefined;
  }

  useAudioClock(generation:number,time:number,when:number,clock:()=>number){
    if(!this.running||generation!==this.epoch)return false;
    this.origin=time;
    this.startedAt=when*1000;
    this.clock=()=>clock()*1000;
    this.waitingForAudio=false;
    return true;
  }

  holdForAudio(generation:number,time=this.time()){
    if(this.running&&generation===this.epoch){this.origin=time;this.waitingForAudio=true;}
  }

  continueWithoutAudio(generation:number){
    if(!this.running||generation!==this.epoch)return;
    this.origin=this.time();
    this.clock=this.now;
    this.startedAt=this.clock();
    this.waitingForAudio=false;
  }

  time(): number {
    if (!this.running||this.waitingForAudio) return this.origin;
    const elapsed = Math.max(0, this.clock() - this.startedAt) / 1000;
    const loop = this.span();
    if (loop) {
      return loop.start + (Math.max(0, this.origin - loop.start) + elapsed) % (loop.end - loop.start);
    }
    return Math.max(0, Math.min(this.duration, this.origin + this.direction * elapsed));
  }

  pause(): number {
    this.origin = this.time();
    this.running = false;
    this.waitingForAudio=false;
    this.firstVideoFrame?.finish(false);
    this.firstVideoFrame=undefined;
    return this.origin;
  }
}

export function synchronizedPlaybackRate(actual: number, target: number, rate: number): number {
  const drift = target - actual;
  const correction = Math.abs(drift) > .015 ? Math.max(-.03, Math.min(.03, drift * .15)) : 0;
  return Math.max(.0625, Math.min(16, rate * (1 + correction)));
}

export function needsPlaybackSeek(actual: number, target: number, rate: number): boolean {
  return Math.abs(actual - target) > Math.max(.35, Math.abs(rate) * .25);
}
