async page=>{
 const result=await page.evaluate(async()=>{
  const {VIDEO_FILTERS}=await import('/src/editor/video/filters/index.ts');
  const {renderVideoFilter,filterLut,sampleFilter}=await import('/src/editor/video/filters/render.ts');
  const {createFilterEffect,createVideoEffect}=await import('/src/editor/video/effects/catalog.ts');
  const {processVideoEffects}=await import('/src/editor/video/process-effects.ts');
  const {VideoEffectsWorkerClient}=await import('/src/editor/video/effects-worker-client.ts');
  const {markImmutableEffectSource}=await import('/src/editor/immutable-effect-sources.ts');
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;const ctx=canvas.getContext('2d',{willReadFrequently:true}),image=ctx.createImageData(64,36);
  const read=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
  let max=0,alphaErrors=0,checks=0,maxCase=null;
  for(const partial of [false,true]){
   for(let i=0;i<image.data.length;i+=4)image.data.set([(i*17)%256,(i*31+35)%256,(i*7+82)%256,partial?(i/4)%256:i%12?255:0],i);
   ctx.putImageData(image,0,0);const sample=[0,0,0],grade=new Uint8ClampedArray(3);
   // Fresh immutable copies exercise both prepared paths without lying about a mutable surface.
   const source=document.createElement('canvas');source.width=64;source.height=36;source.getContext('2d',{willReadFrequently:true}).putImageData(ctx.getImageData(0,0,64,36),0,0);markImmutableEffectSource(source);const raw=read(source);
   for(const look of VIDEO_FILTERS){const lut=filterLut(look.id);for(const amount of [1,25,55.5,100]){
    const out=read(renderVideoFilter(source,look.id,amount)),reference=ctx.createImageData(64,36);
    for(let i=0;i<out.length;i+=4){if(raw[i+3]){sampleFilter(lut,raw[i],raw[i+1],raw[i+2],sample);grade.set(sample);for(let ch=0;ch<3;ch++)reference.data[i+ch]=raw[i+ch]+(grade[ch]-raw[i+ch])*amount/100;}reference.data[i+3]=raw[i+3];if(out[i+3]!==raw[i+3])alphaErrors++;}
    const ref=document.createElement('canvas');ref.width=64;ref.height=36;ref.getContext('2d',{willReadFrequently:partial}).putImageData(reference,0,0);const expected=read(ref);
    for(let i=0;i<out.length;i++){const difference=Math.abs(out[i]-expected[i]);if(difference>max){max=difference;maxCase={partial,look:look.id,amount,alpha:raw[(i>>2)*4+3],channel:i%4,out:out[i],expected:expected[i]};}}checks++;
   }}
  }
  const context={timestamp:1,sourceTime:1,frameIndex:30,fps:30,previousFrame:async age=>{const c=document.createElement('canvas');c.width=64;c.height=36;c.getContext('2d').drawImage(canvas,-age*30,0);return c;}};
  const stacks=[['contrast','sepia','sig_13'],['video-temporal-echo'],['video-motion-trail']].map(kinds=>[createFilterEffect(VIDEO_FILTERS[45].id),...kinds.map(createVideoEffect)]);
  stacks.push(Array.from({length:20},(_,i)=>i%3===0?createFilterEffect(VIDEO_FILTERS[i*7].id):createVideoEffect(i%2?'exposure':'contrast')));
  const worker=new VideoEffectsWorkerClient();let workerMax=0,workerOpaqueMax=0,workerVisibleMax=0,workerAlphaErrors=0;
  try{for(const stack of stacks){const direct=read(await processVideoEffects(canvas,stack,context)),remote=read(await worker.process(canvas,stack,context));for(let i=0;i<direct.length;i++){const difference=Math.abs(direct[i]-remote[i]),alpha=direct[(i>>2)*4+3];workerMax=Math.max(workerMax,difference);if(i%4===3){if(difference)workerAlphaErrors++;}else{workerVisibleMax=Math.max(workerVisibleMax,difference*alpha/255);if(alpha===255)workerOpaqueMax=Math.max(workerOpaqueMax,difference);}}}}
  finally{worker.dispose();}
  return {filters:VIDEO_FILTERS.length,referenceChecks:checks,maxChannelDifference:max,maxCase,alphaErrors,workerStacks:stacks.length,workerMax,workerOpaqueMax,workerVisibleMax,workerAlphaErrors};
 });
 if(result.maxChannelDifference>2||result.alphaErrors||result.workerOpaqueMax>2||result.workerVisibleMax>2||result.workerAlphaErrors)throw Error(JSON.stringify(result));return result;
}
