const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const {staticExportSignature}=loadTypeScript(path.join(root,'src/editor/video/export-static-scene.ts'));
const {clampPredictedMatte,matteToRgba}=loadTypeScript(path.join(root,'src/editor/effects/birefnet-matte.ts'));
const defaultClip={id:'still',trackId:'video',assetId:'a',start:0,sourceIn:0,duration:10,volume:1,
  opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0};
const timeline={assets:[{id:'a',kind:'image',name:'Photo',path:'still.png',duration:10}],
  tracks:[{id:'video',kind:'video',name:'Video',muted:false,locked:false}],clips:[defaultClip],background:'#000000'};
test('static only: an unanimated still image remains unchanged between output timestamps',()=>{
  assert.equal(staticExportSignature(timeline,.3),staticExportSignature(timeline,3));
  assert.notEqual(staticExportSignature(timeline,3),staticExportSignature(timeline,10));
});
test('never reuse changing video, animated images, fades, animated effects, masks or transitions',()=>{
  const variants=[
    {assets:[{...timeline.assets[0],kind:'video'}]},
    {assets:[{...timeline.assets[0],animated:true}]},
    {clips:[{...defaultClip,fadeIn:.5}]},
    {clips:[{...defaultClip,keyframes:[{time:0,x:0}]}]},
    {clips:[{...defaultClip,effects:[{kind:'glow',enabled:true,amount:5}]}]},
    {clips:[{...defaultClip,transitionIn:{kind:'wipe',duration:.3}}]},
    {clips:[{...defaultClip,mask:{shape:'rectangle'}}]},
    {clips:[{...defaultClip,grade:{}}]},
  ];
  for(const variant of variants)assert.equal(staticExportSignature({...timeline,...variant},.5),null,JSON.stringify(variant));
});
test('AI matting cannot restore already-transparent pixels',()=>{
  const mask=clampPredictedMatte([255,230,80,255],new Uint8ClampedArray([
    1,1,1,0, 1,1,1,20, 1,1,1,150, 1,1,1,255,
  ]),2,2);
  assert.deepEqual([...mask],[0,20,80,255]);
  const rgba=matteToRgba(mask);assert.equal(rgba.length,16);
  assert.deepEqual([...rgba.slice(0,4)],[255,255,255,0]);
});
test('mask validation blocks invalid dimensions/data and NaN predictions',()=>{
  assert.throws(()=>clampPredictedMatte([],[],0,1),/dimensions/);
  assert.throws(()=>clampPredictedMatte([1],[0,0,0,255],2,2),/length/);
  assert.equal(clampPredictedMatte([NaN],[255,255,255,255],1,1)[0],0);
});
test('Cutout UI connects AI to editable base mask and keeps manual brushes',()=>{
  const ui=read('src/components/CutoutWorkspace.tsx');
  assert.match(ui,/runBirefnetCutout/);
  assert.match(ui,/originalMaskSnapshot.current=true/);
  assert.match(ui,/baseData:initial.current.toDataURL/);
  assert.match(ui,/Keep brush/);
  assert.match(ui,/Remove brush/);
  assert.match(read('src/editor/effects/birefnet-cutout.ts'),/allowRemoteModels=false/);
});
test('native-only Video Editor export streams acknowledged frames without WebView RGBA transfer',()=>{
  const exporter=read('src/editor/video/export-timeline.ts');
  const plan=read('src/editor/video/native-timeline-export.ts');
  const rust=read('src-tauri/src/media/native_timeline.rs');
  assert.match(exporter,/return exportNativeTimeline\(/);
  assert.doesNotMatch(exporter,/TimelineCompositor|streamNativeVideo/);
  assert.match(plan,/media_export_native_timeline/);
  assert.match(rust,/sync_channel::<ExportPacket>\(3\)/);
  assert.match(rust,/source_ms:decode/);
  assert.match(rust,/composite_ms:compose/);
  assert.match(rust,/reply.recv_timeout/);
});
test('progress tracker displays source and compositing timings without fake frame counts',()=>{
  const {createExportProgressTracker}=loadTypeScript(path.join(root,'src/editor/video/export-progress.ts'));
  let now=0;const events=[];const progress=createExportProgressTracker(v=>events.push(v),{now:()=>now,intervalMs:100});
  progress(0,600,{phase:'initializing'});now=200;
  progress(5,600,{phase:'rendering',renderMs:193,encodeMs:13,sourceMs:173,compositeMs:20,staticReuse:false});
  assert.match(events.at(-1).message,/source 173 ms \/ composite 20 ms/);
  assert.match(events.at(-1).message,/5 \/ 600/);
});
test('bounded export pipeline overlaps encode with next render but never skips or reorders frames',async()=>{
  const {overlapRenderAndEncode}=loadTypeScript(path.join(root,'src/editor/video/export-pipeline.ts'));
  let concurrent=0,maxConcurrent=0;const order=[],accepted=[];
  await overlapRenderAndEncode(5,
    async index=>{concurrent++;maxConcurrent=Math.max(concurrent,maxConcurrent);await new Promise(ok=>setTimeout(ok,5));concurrent--;return index;},
    frame=>({independentBytes:new Uint8Array([frame])}),
    async (packet,index)=>{await new Promise(ok=>setTimeout(ok,5));assert.equal(packet.independentBytes[0],index);order.push(index);},
    index=>accepted.push(index),
  );
  assert.deepEqual(order,[0,1,2,3,4]);
  assert.deepEqual(accepted,[0,1,2,3,4]);
  assert.ok(maxConcurrent<=1,'Never renders more than one preview frame at once');
});
test('encoder error propagates without silently marking remaining frames delivered',async()=>{
  const {overlapRenderAndEncode}=loadTypeScript(path.join(root,'src/editor/video/export-pipeline.ts'));
  const received=[];
  await assert.rejects(overlapRenderAndEncode(5,async index=>index,i=>i,
    async (_value,index)=>{if(index===2)throw Error('encoder stopped');},index=>received.push(index)),/encoder stopped/);
  assert.deepEqual(received,[0,1]);
});
