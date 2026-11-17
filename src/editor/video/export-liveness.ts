/** Native exports are long-running operations; give individual startup steps
 * bounded, actionable failures rather than showing an indefinite 0% spinner.
 * This does not interrupt synchronous painting; callers must close their
 * media sources and cancel the native session when a step times out.
 */
export async function awaitExportStage<T>(name:string, operation:()=>Promise<T>, timeoutMs:number,
  signal?:AbortSignal):Promise<T>{
  signal?.throwIfAborted();
  return new Promise<T>((resolve,reject)=>{
    let settled=false;
    const finish=(result:{value:T}|{error:unknown})=>{
      if(settled)return;
      settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
      if('error' in result)reject(result.error);else resolve(result.value);
    };
    const onAbort=()=>finish({error:new DOMException('Video export cancelled','AbortError')});
    const timer=setTimeout(()=>finish({error:Error(`${name} exceeded ${Math.round(timeoutMs/1000)} seconds. Check the source file and decoder, or try exporting a short range.`)}),timeoutMs);
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted){onAbort();return;}
    Promise.resolve().then(operation).then(value=>finish({value}),error=>finish({error}));
  });
}

/** Compact preview of an actual compositor output, never a second render.
 * Thumbnail failure is cosmetic and must not make a playable MP4 fail.
 */
export function captureEncodedFramePreview(frame:HTMLCanvasElement,maxWidth=480):string|undefined{
  try{
    if(typeof document==='undefined'||!frame.width||!frame.height)return;
    const ratio=Math.min(1,maxWidth/frame.width);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(frame.width*ratio));
    canvas.height=Math.max(1,Math.round(frame.height*ratio));
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.drawImage(frame,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.72);
  }catch{return undefined;}
}
