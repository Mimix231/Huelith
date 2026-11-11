async page=>{
  await page.getByRole('main',{name:'Video Editor workspace'}).waitFor();
  // The test fixture was opened through the native Windows project chooser.
  const result=await page.evaluate(async()=>{
    const {readRecentProjects}=await import('/src/editor/project-hub.ts');
    const {readProjectFile}=await import('/src/editor/files.ts');
    const {TimelineCompositor}=await import('/src/editor/video/compositor.ts');
    const {VideoEffectsWorkerClient}=await import('/src/editor/video/effects-worker-client.ts');
    const {processVideoEffects}=await import('/src/editor/video/process-effects.ts');
    const {createVideoEffect}=await import('/src/editor/video/effects/catalog.ts');
    const {invoke}=await import('/node_modules/@tauri-apps/api/core.js');
    const recent=readRecentProjects().find(r=>r.name==='Video pipeline QA');
    if(!recent?.path)throw Error('Open video-fixture.huelith first');
    const project=JSON.parse(await readProjectFile(recent.path));
    const read=canvas=>canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
    const difference=(a,b)=>{let sum=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d);}return {mean:sum/a.length,max};};
    const renderer=new TimelineCompositor(project.width,project.height,project.fps),times=[],frames=[];
    try{
      for(const clock of [0,.5,.8,1.4,2.1,2.5,.5,.8,1.4,2.1,2.5,0]){
        const start=performance.now();const frame=await renderer.render(project.timeline,clock);times.push({clock,ms:performance.now()-start});frames.push({clock,checksum:Array.from(read(frame).filter((_,i)=>i%101===0)).reduce((sum,n)=>sum+n,0)});
      }
      if(frames[1].checksum!==frames[6].checksum)throw Error('Seek/reset changed the same timestamp');
      for(let i=0;i<5;i++)if(frames[1+i].checksum!==frames[6+i].checksum)throw Error(`Seeking changed timestamp ${frames[1+i].clock}`);
      if(frames[0].checksum!==frames[11].checksum)throw Error('Returning to the first frame changed its pixels');
    }finally{renderer.dispose();}
    const source=document.createElement('canvas');source.width=160;source.height=96;const ctx=source.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#e87d4a';ctx.fillRect(30,20,90,50);ctx.fillStyle='#ffffff';ctx.font='18px sans-serif';ctx.fillText('Video',40,47);
    const context={timestamp:.5,sourceTime:.5,frameIndex:15,fps:30,previousFrame:async age=>{
      const frame=document.createElement('canvas');frame.width=160;frame.height=96;const c=frame.getContext('2d');c.drawImage(source,-age*80,0);return frame;
    }};
    const worker=new VideoEffectsWorkerClient(),parity=[];
    try{
      for(const kinds of [['exposure','contrast','sepia'],['atelier_4_0','sig_13'],['video-color-grade','video-temporal-echo'],['video-motion-trail'],['vhs','grain'],
        Array.from({length:24},(_,i)=>['contrast','sepia','sig_13','atelier_4_0'][i%4])]){
        const effects=kinds.map(createVideoEffect),direct=await processVideoEffects(source,effects,context),remote=await worker.process(source,effects,context);
        const compared=difference(read(direct),read(remote));parity.push({kinds,...compared});
        if(compared.max>2||compared.mean>.2)throw Error(`Worker/frame parity failed: ${JSON.stringify(parity[parity.length-1])}`);
      }
      const mutableEffect=createVideoEffect('exposure');mutableEffect.amount=85;
      const first=read(await worker.process(source,[mutableEffect],context));
      ctx.fillStyle='#1264d9';ctx.fillRect(0,0,160,96);
      const changed=await worker.process(source,[mutableEffect],context),expected=await processVideoEffects(source,[mutableEffect],context);
      if(difference(first,read(changed)).mean<10||difference(read(changed),read(expected)).max>1)throw Error('Worker retained stale pixels after a mutable canvas edit');
      parity.push({kinds:['mutable-canvas-invalidation'],...difference(read(changed),read(expected))});
      const WorkerClass=window.Worker;let fallback;
      try{
        window.Worker=undefined;fallback=new VideoEffectsWorkerClient();
        const rendered=await fallback.process(source,[mutableEffect],context),d=difference(read(rendered),read(expected));
        if(d.max!==0)throw Error('CPU fallback differs from its reference');
        parity.push({kinds:['worker-unavailable-cpu-fallback'],...d});
      }finally{window.Worker=WorkerClass;fallback?.dispose();}
    }finally{worker.dispose();}
    const capability=await invoke('media_capabilities');
    window.__huelithVideoMetrics=[];
    window.addEventListener('huelith-video-frame',e=>window.__huelithVideoMetrics.push(e.detail));
    return {capability,decodeAndEffects:times,seekChecksums:frames,workerParity:parity};
  });
  return result;
}
