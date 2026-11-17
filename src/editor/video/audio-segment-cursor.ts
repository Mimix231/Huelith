/** Round 3: integer-sample timeline scheduling for browser audio preview.
 * A segment never crosses an audio buffer, playback end or loop boundary.
 * Integer arithmetic avoids accumulating floating-point drift on long edits.
 */
export const AUDIO_PREVIEW_RATE=48_000;
export const AUDIO_PREVIEW_WINDOW=AUDIO_PREVIEW_RATE;
export type AudioSegmentSlice={first:number;offset:number;count:number;timelineSample:number};

export class AudioSegmentCursor {
  private position:number;
  readonly end:number;
  readonly loopStart?:number;
  constructor(startSample:number,endSample:number,loopStartSample?:number){
    for(const sample of [startSample,endSample,...(loopStartSample===undefined?[]:[loopStartSample])]){
      if(!Number.isSafeInteger(sample)||sample<0)throw Error('Invalid audio sample cursor.');
    }
    if(endSample<startSample||loopStartSample!==undefined&&loopStartSample>=endSample)
      throw Error('Invalid audio preview range.');
    this.position=startSample;
    this.end=endSample;
    this.loopStart=loopStartSample;
  }
  get nextSample(){return this.position>=this.end&&this.loopStart!==undefined?this.loopStart:this.position;}
  take():AudioSegmentSlice|undefined {
    if(this.position>=this.end){
      if(this.loopStart===undefined)return undefined;
      this.position=this.loopStart;
    }
    const sample=this.position;
    const first=Math.floor(sample/AUDIO_PREVIEW_WINDOW)*AUDIO_PREVIEW_WINDOW;
    const offset=sample-first;
    const count=Math.min(AUDIO_PREVIEW_WINDOW-offset,this.end-sample);
    if(count<=0)return undefined;
    this.position+=count;
    return {first,offset,count,timelineSample:sample};
  }
}
