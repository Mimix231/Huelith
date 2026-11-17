/** Coarse visual signature: intentionally tolerant of H.264 quantization.
 * Detects catastrophic errors (blank/black video, channel swaps, wrong
 * render output) without pretending compressed video is pixel-exact.
 */
export type FrameSignature={width:number;height:number;rgb:number[]};
export function frameSignature(pixels:Uint8ClampedArray|Uint8Array|number[],width:number,height:number,
  columns=12,rows=7):FrameSignature{
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||pixels.length!==width*height*4)
    throw Error('Invalid video frame for fidelity analysis.');
  const rgb:number[]=[];
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const px=Math.min(width-1,Math.floor((x+.5)*width/columns));
    const py=Math.min(height-1,Math.floor((y+.5)*height/rows));
    const i=(py*width+px)*4;
    rgb.push(pixels[i],pixels[i+1],pixels[i+2]);
  }
  return {width,height,rgb};
}

/** Only very large deviations are considered a failure. The objective is to
 * report a broken export, not reject normal H.264 compression or film grain.
 */
export function verifyFirstFrameFidelity(reference:FrameSignature,decoded:{width:number;height:number;rgba:number[]}):void{
  if(!reference.rgb.length)return;
  const actual=frameSignature(decoded.rgba,decoded.width,decoded.height);
  if(actual.rgb.length!==reference.rgb.length)throw Error('Video reference signature has unexpected dimensions.');
  let total=0;
  for(let i=0;i<actual.rgb.length;i++)total+=Math.abs(actual.rgb[i]-reference.rgb[i]);
  const difference=total/actual.rgb.length;
  if(difference>80)throw Error(`The MP4 first frame differs strongly from Huelith's rendered frame (mean channel difference ${difference.toFixed(0)}/255). The output may be blank, incorrectly oriented or color-corrupted.`);
}
