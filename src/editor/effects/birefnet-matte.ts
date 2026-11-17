/** Small, testable, model-independent alpha helpers.
 * The model is allowed to identify a subject, never to restore pixels that
 * were already transparent in the original painted image. */
export function clampPredictedMatte(predicted:ArrayLike<number>,sourceRGBA:ArrayLike<number>,width:number,height:number):Uint8ClampedArray {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>64_000_000)
    throw Error('Invalid Cutout dimensions');
  const count=width*height;
  if(predicted.length<count||sourceRGBA.length!==count*4)throw Error('Invalid Cutout mask or source length');
  const alpha=new Uint8ClampedArray(count);
  for(let p=0;p<count;p++){
    const candidate=Number(predicted[p]);
    alpha[p]=Math.min(sourceRGBA[p*4+3],Number.isFinite(candidate)?Math.max(0,Math.min(255,Math.round(candidate))):0);
  }
  return alpha;
}
export function matteToRgba(alpha:ArrayLike<number>):Uint8ClampedArray {
  const rgba=new Uint8ClampedArray(alpha.length*4);
  for(let i=0;i<alpha.length;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=255;rgba[i*4+3]=alpha[i];}
  return rgba;
}
