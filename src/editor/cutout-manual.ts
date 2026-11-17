/** Start manual removal from an entirely visible image.
 * An empty alpha mask would make the Clear brush appear broken. A full white
 * base mask makes Clear remove pixels and Keep restore them, without changing
 * the original raster. The document still stores the editable mask separately.
 */
export function initializeFullCutoutMask(base:HTMLCanvasElement, working:HTMLCanvasElement):void{
  if(base.width!==working.width||base.height!==working.height)
    throw Error('Cutout base and working mask dimensions must agree.');
  for(const canvas of [base,working]){
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Cannot initialize the manual Cutout mask.');
    ctx.save();
    ctx.globalCompositeOperation='source-over';
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();
  }
}
