/**
 * Bounded producer/consumer export pipeline.
 *
 * The timeline renderer has mutable decoder, effect history, and Canvas2D
 * state, so preparing frames must be strictly SEQUENTIAL. Each prepared
 * payload owns an independent snapshot of its RGBA bytes. Only one encode is
 * submitted at once, preserving the exact frame ordering expected by the
 * Media Foundation sink writer. Up to `maxReady` prepared jobs may exist;
 * additional frames are never rendered into an unbounded queue.
 *
 * This overlaps slow encoding of frame N with preparation of N+1..N+K,
 * but it does not fabricate frames or guarantee a particular throughput.
 */
export async function overlapRenderAndEncode<Frame, Payload>(
  count:number,
  render:(index:number)=>Promise<Frame>,
  prepare:(frame:Frame,index:number)=>Payload,
  encode:(payload:Payload,index:number)=>Promise<void>,
  completed:(index:number)=>void,
  maxReady=3,
):Promise<void>{
  if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid output frame count');
  if(!Number.isSafeInteger(maxReady)||maxReady<1||maxReady>6)throw Error('Export lookahead must be 1..6 frames');
  if(count===0)return;
  // A serialized chain ensures two renders never touch the same canvas or
  // temporal effect state at once, even when encoding is significantly slower.
  let latest:Promise<void>=Promise.resolve();
  let stopped=false;
  let nextFrame=0;
  const pending:Array<Promise<Payload>>=[];
  const schedule=()=>{
    if(nextFrame>=count)return;
    const index=nextFrame++;
    const job=latest.then(async()=>{
      if(stopped)throw Error('Export stopped');
      const frame=await render(index);
      if(stopped)throw Error('Export stopped');
      // Required: encode gets an owned byte buffer, not the shared canvas.
      return prepare(frame,index);
    });
    // Preserve rejection for the ordered consumer while preventing an
    // unhandled-rejection event before it reaches this frame.
    void job.catch(()=>{});
    latest=job.then(()=>undefined,()=>undefined);
    pending.push(job);
  };
  try{
    while(pending.length<maxReady&&nextFrame<count)schedule();
    for(let index=0;index<count;index++){
      const prepared=await pending.shift()!;
      const acknowledged=encode(prepared,index);
      // Refill the queue while the native encoder works on this frame.
      if(nextFrame<count)schedule();
      await acknowledged;
      completed(index);
    }
  }catch(error){
    stopped=true;
    // Drain any already-scheduled render before callers dispose the shared
    // compositor/decoders; otherwise cancellation could race with dispose().
    await Promise.allSettled(pending);
    throw error;
  }
}
