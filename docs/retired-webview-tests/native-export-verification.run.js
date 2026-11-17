async page => {
  const result=await page.evaluate(async () => {
    const {readProjectFile}=await import('/src/editor/files.ts');
    const {mediaUrl}=await import('/src/editor/video/media-assets.ts');
    const {makeAsset}=await import('/src/editor/video/timeline.ts');
    const {TimelineCompositor,seekVideo}=await import('/src/editor/video/compositor.ts');
    const {frameDocument}=await import('/src/editor/animation.ts');
    const {exportCanvas,prepareImages}=await import('/src/editor/render.ts');
    const base='E:\\ChatGPTProjects\\Huelith\\output\\stage-dg\\';
    const bytes=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
    const difference=(a,b)=>{let sum=0,max=0;const histogram=new Uint32Array(256);
      for(let i=0;i<a.length;i+=4)for(let ch=0;ch<3;ch++){const d=Math.abs(a[i+ch]-b[i+ch]);sum+=d;max=Math.max(max,d);histogram[d]++;}
      let count=0,p95=0;for(;p95<255;p95++){count+=histogram[p95];if(count>=a.length/4*3*.95)break;}
      return {mean:sum/(a.length/4*3),p95,max};};
    const results=[];
    for(const type of ['video','animation']){
      const project=JSON.parse(await readProjectFile(base+type+'-fixture.huelith'));
      const name=type==='video'?'video-editor-effects-audio.mp4':'animation-held-effects.mp4';
      const url=await mediaUrl(makeAsset(name,base+name,'video',type==='video'?3:.6,project.width,project.height));
      const video=document.createElement('video');video.crossOrigin='anonymous';video.muted=true;video.preload='auto';
      await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Cannot play '+name));video.src=url;});
      const actual=document.createElement('canvas');actual.width=project.width;actual.height=project.height;
      const ctx=actual.getContext('2d',{willReadFrequently:true}),checks=[];
      const compositor=type==='video'?new TimelineCompositor(project.width,project.height,30):null;
      try{
        for(const time of type==='video'?[.05,.5,.9,1.4,2.2,2.7]:[.05,.2,.45,.55]){
          await seekVideo(video,time);ctx.drawImage(video,0,0);let expected;
          if(compositor)expected=await compositor.render(project.timeline,time);
          else{const frame=frameDocument(project,time<.1?0:time<.4?1:2);await prepareImages(frame);expected=exportCanvas(frame);}
          const actualBytes=bytes(actual),expectedBytes=bytes(expected),d=difference(actualBytes,expectedBytes);
          checks.push({time,...d,pixels:[(30*project.width+30)*4,(650*project.width+1100)*4].filter(i=>i<actualBytes.length).map(i=>({actual:Array.from(actualBytes.slice(i,i+4)),expected:Array.from(expectedBytes.slice(i,i+4))}))});
          if(d.mean>5||d.p95>14)throw Error(`Encoded ${type} frame differs from its renderer: ${JSON.stringify(checks)}`);
          if(time===(type==='video'?1.4:.45)){
            const comparison=document.createElement('canvas');comparison.width=project.width*2;comparison.height=project.height;
            const painter=comparison.getContext('2d');painter.drawImage(expected,0,0);painter.drawImage(actual,project.width,0);
            comparison.dataset.qaComparison=type;comparison.style.cssText='position:fixed;left:0;top:0;z-index:2147483646';document.body.append(comparison);
          }
        }
        actual.dataset.qaEncodedFrame=type;actual.style.cssText='position:fixed;left:0;top:0;z-index:2147483647';document.body.append(actual);
        let audio;
        if(type==='video'){
          const ac=new AudioContext();try{
            const decoded=await ac.decodeAudioData(await (await fetch(url)).arrayBuffer()),samples=decoded.getChannelData(0),rate=decoded.sampleRate;
            const rms=(at,duration=.025)=>{let sum=0,n=0;for(let i=Math.round(at*rate);i<Math.min(samples.length,Math.round((at+duration)*rate));i++){sum+=samples[i]**2;n++;}return Math.sqrt(sum/Math.max(1,n));};
            let onset=null,offset=null;for(let t=0;t<2;t+=.005)if(rms(t,.01)>.04){onset??=t;offset=t+.01;}
            audio={sampleRate:rate,channels:decoded.numberOfChannels,duration:decoded.duration,silenceRms:rms(.3),beepRms:rms(.9),afterRms:rms(1.5),onset,offset};
            if(audio.beepRms<.12||audio.silenceRms>.01||audio.afterRms>.01||Math.abs(onset-.75)>.035||Math.abs(offset-1.25)>.04)throw Error('Encoded audio clock mismatch: '+JSON.stringify(audio));
          }finally{await ac.close();}
        }
        results.push({type,path:base+name,duration:video.duration,width:video.videoWidth,height:video.videoHeight,checks,audio});
      }finally{compositor?.dispose();video.removeAttribute('src');video.load();}
    }
    return results;
  });
  for(const type of ['video','animation']){
    await page.locator('[data-qa-encoded-frame],[data-qa-comparison]').evaluateAll(nodes=>nodes.forEach(c=>c.style.visibility='hidden'));
    await page.locator(`[data-qa-encoded-frame="${type}"]`).evaluate(c=>c.style.visibility='visible');
    await page.locator(`[data-qa-encoded-frame="${type}"]`).screenshot({path:`output/stage-dg/decoded-${type}-export.png`});
    await page.locator(`[data-qa-encoded-frame="${type}"]`).evaluate(c=>c.remove());
    await page.locator(`[data-qa-comparison="${type}"]`).evaluate(c=>c.style.visibility='visible');
    await page.locator(`[data-qa-comparison="${type}"]`).screenshot({path:`output/stage-dg/renderer-encoded-${type}.png`});
    await page.locator(`[data-qa-comparison="${type}"]`).evaluate(c=>c.remove());
  }
  return result;
}
