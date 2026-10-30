// Run against the actual Windows WebView2 target with playwright-cli run-code.
async page => {
  const slider=page.getByRole('slider',{name:'Chromatic Adaptation',exact:true});
  const box=await slider.evaluate(el=>{
    const track=el.closest('.MuiSlider-root');if(!track)throw Error('Native slider track missing');
    const r=track.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
  });
  await page.evaluate(()=>{
    window.huelithSliderMetrics=[];window.huelithDragStarted=performance.now();
    window.huelithCanvasChanges=[];window.huelithSampleFrame=0;
    const canvas=document.querySelector('canvas[aria-label="Huelith artwork canvas"]')??document.querySelector('main canvas');
    if(!canvas)throw Error('Actual viewport canvas missing');
    let last='';
    const sample=()=>{
      const ctx=canvas.getContext('2d');let signature='';
      for(let y=1;y<5;y++)for(let x=1;x<5;x++)signature+=Array.from(ctx.getImageData(Math.floor(canvas.width*x/5),Math.floor(canvas.height*y/5),1,1).data).join(',');
      if(signature!==last){window.huelithCanvasChanges.push({at:performance.now(),signature});last=signature;}
      window.huelithSampleFrame=requestAnimationFrame(sample);
    };sample();
  });
  await page.mouse.move(box.x+box.width*0.2,box.y+box.height/2);
  await page.mouse.down();
  for(let i=0;i<160;i++){
    const t=i/159;const fraction=0.5+0.4*Math.sin(t*Math.PI*4);
    await page.mouse.move(box.x+box.width*fraction,box.y+box.height/2);
    await page.waitForTimeout(16);
  }
  const during=await page.evaluate(()=>({ended:performance.now(),metrics:window.huelithSliderMetrics,canvasChanges:window.huelithCanvasChanges}));
  await page.mouse.up();
  await page.waitForTimeout(500);
  const final=await page.evaluate(()=>{
    cancelAnimationFrame(window.huelithSampleFrame);
    return {metrics:window.huelithSliderMetrics,slider:document.querySelector('input[aria-label="Chromatic Adaptation"]')?.value};
  });
  const frames=during.metrics.filter(m=>!m.aborted);
  const times=frames.map(m=>m.processingMs).sort((a,b)=>a-b);
  const result={
    surface:'Actual Windows Tauri/WebView2 app',width:1280,height:800,
    pointerMoves:160,completedFramesDuringDrag:frames.length,canvasChangesDuringDrag:during.canvasChanges.length,
    abortedDuringDrag:during.metrics.filter(m=>m.aborted).length,
    p50ProcessingMs:times[Math.floor(times.length*.5)],p95ProcessingMs:times[Math.floor(times.length*.95)],
    maximumQueueDepth:Math.max(0,...during.metrics.map(m=>m.queueDepth??0)),finalSlider:final.slider,
  };
  if(result.completedFramesDuringDrag<12||result.canvasChangesDuringDrag<12)throw Error('Visible preview stalled during continuous input: '+JSON.stringify(result));
  if(result.abortedDuringDrag!==0)throw Error('Unchanged-source frames were cancelled: '+JSON.stringify(result));
  return result;
}
