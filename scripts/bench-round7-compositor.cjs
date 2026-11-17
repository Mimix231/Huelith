/** Non-gating benchmark of the pure pixel-copy saved by Round 7.
 * Skia CPU Canvas is NOT the WebView GPU, not Media Foundation and not a
 * prediction of full-editor export FPS. Run at identical output dimensions. */
const {Canvas}=require('skia-canvas');
const {performance}=require('node:perf_hooks');
const width=1920,height=1080,frames=45;
const image=new Canvas(width,height),ctx=image.getContext('2d');
ctx.fillStyle='#253669';ctx.fillRect(0,0,width,height);
ctx.fillStyle='#d8a5fa';ctx.fillRect(120,200,600,650);
ctx.fillStyle='#75a8e4';ctx.fillRect(740,350,800,520);
function measure(twoStage){
  const source=twoStage?new Canvas(width,height):null;
  const src=source?.getContext('2d');
  const target=new Canvas(width,height),output=target.getContext('2d');
  const started=performance.now();
  for(let n=0;n<frames;n++){
    output.fillStyle='#101b2a';output.fillRect(0,0,width,height);
    if(src){src.clearRect(0,0,width,height);src.drawImage(image,0,0);output.drawImage(source,0,0);}
    else output.drawImage(image,0,0);
  }
  // Force an observable read to avoid purely deferred measurements.
  output.getImageData(0,0,1,1);
  return (performance.now()-started)/frames;
}
measure(false);measure(true);
const direct=[measure(false),measure(false),measure(false)].sort((a,b)=>a-b)[1];
const reference=[measure(true),measure(true),measure(true)].sort((a,b)=>a-b)[1];
console.log(`1080p native-sized plain frames, ${frames} frames/trial (Skia CPU Canvas):`);
console.log(`  reference two-stage compositor: ${reference.toFixed(2)} ms/frame`);
console.log(`  direct one-stage compositor:   ${direct.toFixed(2)} ms/frame`);
console.log(`  relative copy-stage saving:    ${((reference-direct)/Math.max(0.001,reference)*100).toFixed(1)}%`);
console.log('This measures only the copy path. Real source decoding, effects, 8MB IPC and H.264 encoding are excluded.');
