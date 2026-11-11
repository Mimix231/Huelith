const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createCanvas}=require('../scripts/video-canvas-runtime.cjs');
const {newVideoProject,isVideoProject}=require('../src/editor/project-hub.ts');
const {addMediaClip,defaultTimeline,isVideoTimeline,makeAsset,splitClip}=require('../src/editor/video/timeline.ts');
const {frameTime,magneticFrame}=require('../src/editor/video/timeline-grid.ts');
const {authoredTransitions}=require('../src/editor/video/transition-placement.ts');
const {applyLibraryClipCard,resolveLibraryDrop}=require('../src/editor/video/library-drop.ts');
const {addLinkedVariant,switchSequence,syncVariantCuts}=require('../src/editor/video/sequences.ts');
const {evaluateVideoEffect,effectFromOffset}=require('../src/editor/video/effects/types.ts');
const {maskAt,maskFeatherAt,rebaseMask}=require('../src/editor/video/clip-layout.ts');
const {keyRgba,DEFAULT_CHROMA_KEY}=require('../src/editor/video/chroma-key.ts');
const {TimelineCompositor,seekVideo}=require('../src/editor/video/compositor.ts');
const {planDelivery,validDeliveryPlan}=require('../src/editor/video/delivery.ts');
const {playheadStops,snapPlayhead}=require('../src/editor/video/playhead-stops.ts');
const {clipKeyLanes}=require('../src/editor/video/clip-key-lanes.ts');
const {makeAnimationSpan}=require('../src/editor/video/clip-animation.ts');
const {manualTransformAt,transformAt,transformEdit}=require('../src/editor/video/motion.ts');
const {audioGainAt,audioPanAt,audioVoiceMixAt,timelineAudioSources}=require('../src/editor/video/audio-plan.ts');
const {parameterAt}=require('../src/editor/video/parameter-keys.ts');
const {renderVideoTransition}=require('../src/editor/video/render-transition.ts');
const {waveformPath}=require('../src/editor/video/audio-analysis.ts');

test('live temporal effects reuse decoded history instead of seeking a second video decoder',async()=>{
  const {timeline,clip}=addMediaClip(defaultTimeline(),makeAsset('Live','live.mp4','video',2));
  const scene={...timeline,clips:[{...clip,effects:[{id:'echo',kind:'video-temporal-echo',amount:80,enabled:true}]}]};
  const renderer=new TimelineCompositor(16,16,60);
  let historicalDecodes=0,available=0;
  renderer.rawFrame=async(_timeline,_clip,_clock,_signal,history)=>{
    if(history)historicalDecodes++;
    const frame=createCanvas(16,16);frame.getContext('2d').fillRect(0,0,16,16);return frame;
  };
  renderer.effects.process=async(source,_effects,context)=>{
    if(await context.previousFrame?.(1/60))available++;
    return source;
  };
  try{
    renderer.setPlayback(true);
    for(let index=0;index<8;index++)await renderer.render(scene,index/60);
    assert.equal(historicalDecodes,0);
    assert.equal(available,7);
    available=0;
    await renderer.render(scene,0);
    assert.equal(available,0,'Loop wrap must not reuse future frames');
    renderer.setPlayback(false);
    await renderer.render(scene,1/60);
    assert.equal(historicalDecodes,1,'Paused and exported frames retain exact seeking');
  }finally{renderer.dispose();}
});
test('magnet snaps both moving edges and frame alignment still works when disabled',()=>{
  const {timeline}=addMediaClip(defaultTimeline(),makeAsset('Source','source.mp4','video',4),'video1',8);
  assert.deepEqual(magneticFrame(timeline,5.94,30,new Set(),0,{length:2}),{time:frameTime(5.94,30)});
  assert.deepEqual(magneticFrame(timeline,5.94,30,new Set(),.12,{length:2}),{time:6,guide:8});
});

test('playhead crosses stops, can target adjacent keys, and keeps a distinct isolated tail',()=>{
  const asset=makeAsset('Source','source.mp4','video',4);
  const left=addMediaClip(defaultTimeline(),asset,'video1',2);
  const right=addMediaClip(left.timeline,asset,'video1',6);
  const timeline={...right.timeline,clips:[{...left.clip,keyframes:[
    {parameter:'scale',time:1,value:1},{parameter:'scale',time:31/30,value:1.5},
  ]},right.clip]};
  const stops=playheadStops(timeline,30,[]);
  const key=snapPlayhead(stops,93,.66,87);
  assert.equal(key.frame,90);
  assert.equal(snapPlayhead(stops,93,.66,93,key),undefined);
  assert.equal(snapPlayhead(stops,91,.66,90,key).frame,91);
  assert.equal(stops.find(stop=>stop.frame===180).tailFrame,undefined);
  assert.equal(stops.find(stop=>stop.frame===300).tailFrame,299);
});

test('a seek waits for drawable video data when the browser reports seeked early',async()=>{
  class Video extends EventTarget {
    duration=2;
    readyState=1;
    seeking=false;
    position=0;
    get currentTime(){return this.position;}
    set currentTime(time){
      this.position=time;
      this.dispatchEvent(new Event('seeked'));
    }
  }
  const video=new Video();
  let completed=false;
  const pending=seekVideo(video,59/30).then(()=>{completed=true;});
  for(let frame=0;frame<4;frame++)await new Promise(resolve=>requestAnimationFrame(resolve));
  assert.equal(completed,false);
  video.readyState=2;
  await pending;
  assert.equal(completed,true);
});

test('a waveform peak stays at the retimed clip position when the visible range is zoomed',()=>{
  const asset={...makeAsset('Recording','source.wav','audio',20),waveform:Array.from({length:200},(_,index)=>index===90?.9:0)};
  const inserted=addMediaClip(defaultTimeline(),asset,'audio1',0);
  const clip={...inserted.clip,sourceIn:5,duration:6,sourceMap:[{time:0,source:5},{time:2,source:10},{time:6,source:15}]};
  const path=waveformPath(asset,clip,{start:1,end:3,points:145});
  const top=path.split('L').slice(0,145).map(point=>point.replace('M','').split(' ').map(Number));
  const [x,y]=top.reduce((lowest,point)=>point[1]<lowest[1]?point:lowest);
  assert.ok(x>=41&&x<=48,`source peak appears at x=${x}`);
  assert.ok(y<5);
});

test('manual transform, clip animation, masked grades and audio automation survive a split',()=>{
  const first=addMediaClip(defaultTimeline(),{...makeAsset('Source','source.mp4','video',4),hasAudio:true},'video1',2);
  const keys=[{time:0,value:0,easing:'ease-in'},{time:2,value:1}];
  const mask={shape:'ellipse',region:{x:.2,y:.2,width:.6,height:.6},feather:.01,
    keys:{rotation:keys.map(key=>({...key,value:key.value*90}))}};
  const clip={...first.clip,scaleY:1.2,...transformEdit(first.clip,{scale:2,scaleY:1.5},2,30,true),
    animation:{Combo:makeAnimationSpan('slow-pulse',3,4)},mask,grade:{basic:{exposure:.3},keys:{exposure:keys},mask},
    volumeKeys:[{time:0,value:.4,easing:'hold'},{time:2,value:.9}],
    panKeys:[{time:0,value:-1,easing:'ease-in'},{time:2,value:1}],channelMode:'left',
    voice:{mode:'radio',mix:.5,keys:[{time:0,value:0,easing:'ease-out'},{time:2,value:1}]}};
  const timeline={...first.timeline,clips:[clip]};
  const result=splitClip(timeline,clip.id,3,1/30);
  const after=result.timeline.clips.find(item=>item.id===result.rightId);
  assert.ok(isVideoTimeline(JSON.parse(JSON.stringify(result.timeline))));
  const originalPose=transformAt(clip,1.5),recoveredPose=transformAt(after,.5);
  for(const key of Object.keys(originalPose))assert.ok(Math.abs(originalPose[key]-recoveredPose[key])<1e-9,key);
  assert.notEqual(manualTransformAt(after,.5).scale,recoveredPose.scale);
  assert.equal(maskAt(clip.mask,1.5).rotation,maskAt(after.mask,.5).rotation);
  assert.equal(parameterAt(after.grade.keys.exposure,.5,0),parameterAt(keys,1.5,0));
  const leftAudio=timelineAudioSources(timeline)[0],rightAudio=timelineAudioSources(result.timeline).find(item=>item.id===after.id);
  assert.equal(audioGainAt(leftAudio,3),.4);
  assert.equal(audioPanAt(rightAudio,3),-.5);
  assert.equal(audioVoiceMixAt(rightAudio,3),.75);
  assert.equal(audioPanAt(rightAudio,3.5),audioPanAt(leftAudio,3.5));
  assert.ok(clipKeyLanes(after).some(lane=>lane.id==='gradeMask.rotation'));
});

test('authored fade in, fade out and combo use their actual drop spans and render distinct frames',async()=>{
  const base=addMediaClip(defaultTimeline(),makeAsset('Source','source.mp4','video',4),'video1',2);
  const hit={trackId:'video1',clipId:base.clip.id,time:3.7,edgeWindow:.12};
  const red=createCanvas(64,36),blue=createCanvas(64,36),blank=createCanvas(64,36);
  for(const [canvas,color] of [[red,'red'],[blue,'blue']]){
    const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,64,36);
  }
  const context={timestamp:.42,sourceTime:.42,frameIndex:12,fps:30};
  for(const [id,placement] of [['in-iris','start'],['out-iris','end'],['combo-iris','middle']]){
    const card={kind:'transition',id},target=resolveLibraryDrop(base.timeline,card,hit,30);
    assert.equal(target.transition.placement,placement);
    const result=applyLibraryClipCard(base.timeline,card,target.clipId,target.transition,30);
    assert.ok(isVideoTimeline(result.timeline));
    const [span]=authoredTransitions(result.timeline,30);
    assert.equal(span.start,target.transition.start);
    assert.equal(span.end,target.transition.end);
    const from=placement==='start'?blank:red,to=placement==='end'?blank:blue;
    const frame=await renderVideoTransition(from,to,.42,span.transition,context);
    const rgba=frame.getContext('2d').getImageData(0,0,64,36).data;
    const sample=(x,y)=>[...rgba.slice((y*64+x)*4,(y*64+x)*4+4)];
    assert.notDeepEqual(sample(0,0),sample(32,18));
    assert.equal(await renderVideoTransition(from,to,0,span.transition,context),from);
    assert.equal(await renderVideoTransition(from,to,1,span.transition,context),to);
  }
});

test('transition ghost spans match the authored start, end and split at the middle',()=>{
  const {timeline,clip}=addMediaClip(defaultTimeline(),makeAsset('Source','source.mp4','video',4),'video1',2);
  const card={kind:'transition',id:'light-flash'};
  for(const [time,placement] of [[2.03,'start'],[3.75,'middle'],[5.98,'end']]){
    const target=resolveLibraryDrop(timeline,card,{trackId:clip.trackId,clipId:clip.id,time,edgeWindow:.14},30);
    assert.equal(target.transition.placement,placement);
    const applied=applyLibraryClipCard(timeline,card,target.clipId,target.transition,30);
    const [span]=authoredTransitions(applied.timeline,30);
    assert.ok(Math.abs(span.start-target.transition.start)<1e-7);
    assert.ok(Math.abs(span.end-target.transition.end)<1e-7);
    assert.equal(applied.timeline.clips.length,placement==='middle'?2:1);
  }
});

test('a shared split creates the same right clip and rebases each variant’s independent motion',()=>{
  const project=newVideoProject('Linked',1920,1080,30);
  const {timeline,clip}=addMediaClip(defaultTimeline(),makeAsset('Source','source.mp4','video',4),'video1',0);
  const variant=addLinkedVariant({...project,timeline},'portrait');
  const framed={...variant,sequence:{...variant.sequence,safeInset:22},timeline:{...variant.timeline,
    clips:[{...clip,x:.4,keyframes:[{parameter:'x',time:0,value:.2},{parameter:'x',time:4,value:.6}]}]}};
  const master=switchSequence(framed,'main');
  const edit=splitClip(master.timeline,clip.id,2,1/30);
  const synced=syncVariantCuts(master,{...master,timeline:edit.timeline});
  const next=switchSequence(synced,variant.sequence.id);
  assert.equal(next.sequence.safeInset,22);
  assert.equal(next.timeline.clips.length,2);
  const right=next.timeline.clips.find(item=>item.id===edit.rightId);
  assert.equal(right.x,.4);
  assert.ok(Math.abs(right.keyframes[0].value-.4)<1e-8);
  assert.ok(isVideoProject(next));
});

test('Bézier effect and mask feather preserve values across a split',()=>{
  const effect={version:1,id:'grade',kind:'exposure',amount:0,enabled:true,keyframes:[
    {parameter:'amount',time:0,value:0,curve:[.42,0,.73,.25]},{parameter:'amount',time:4,value:100},
  ]};
  assert.ok(evaluateVideoEffect(effect,2).amount<40);
  const rebased=effectFromOffset(effect,1.5);
  for(const time of [0,.2,1,2])assert.ok(Math.abs(evaluateVideoEffect(effect,time+1.5).amount-evaluateVideoEffect(rebased,time).amount)<.0001);
  const mask={shape:'ellipse',region:{x:.1,y:.1,width:.8,height:.8},feather:.01,featherKeys:[{time:0,value:0},{time:4,value:.2}]};
  assert.equal(maskFeatherAt(rebaseMask(mask,2),1),maskFeatherAt(mask,3));
});

test('chroma key cuts actual green pixels and leaves unrelated source alpha intact',()=>{
  const rgba=new Uint8ClampedArray([0,255,0,255,210,30,36,127,45,150,35,255]);
  const key={...DEFAULT_CHROMA_KEY,tolerance:.12,softness:.2,spill:1};
  keyRgba(rgba,key);
  assert.equal(rgba[3],0);
  assert.equal(rgba[7],127);
  assert.ok(rgba[9]<150);
});

test('a cut blends both real images and an outgoing transition fades the last image',async()=>{
  const solid=(b,g,r)=>{
    const header=Buffer.alloc(18);header[2]=2;header[12]=header[14]=32;header[16]=24;header[17]=32;
    const pixels=Buffer.alloc(32*32*3);
    for(let i=0;i<pixels.length;i+=3){pixels[i]=b;pixels[i+1]=g;pixels[i+2]=r;}
    return Buffer.concat([header,pixels]);
  };
  const red=solid(0,0,255),blue=solid(255,0,0);
  const originalFetch=global.fetch;
  global.fetch=async input=>new Response(String(input).endsWith('red.tga')?red:blue);
  const renderer=new TimelineCompositor(32,32,30);
  try{
    const first={...makeAsset('Red.tga','red.tga','image',5),libraryId:'testing/red.tga'};
    const second={...makeAsset('Blue.tga','blue.tga','image',5),libraryId:'testing/blue.tga'};
    const left=addMediaClip(defaultTimeline(),first,'video1',0),right=addMediaClip(left.timeline,second,'video1',5);
    const card={kind:'transition',id:'cross-dissolve'};
    const target=resolveLibraryDrop(right.timeline,card,{trackId:'video1',clipId:right.clip.id,time:5,edgeWindow:.15},30);
    const timeline=applyLibraryClipCard(right.timeline,card,target.clipId,target.transition).timeline;
    const frame=await renderer.render(timeline,5);
    const pixel=frame.getContext('2d').getImageData(16,16,1,1).data;
    assert.ok(pixel[0]>80&&pixel[2]>80&&pixel[3]===255);
    const end=resolveLibraryDrop(timeline,card,{trackId:'video1',clipId:right.clip.id,time:9.99,edgeWindow:.15},30);
    const faded=applyLibraryClipCard(timeline,card,end.clipId,end.transition).timeline;
    const fade=await renderer.render(faded,9.8);
    assert.ok(fade.getContext('2d').getImageData(16,16,1,1).data[2]<180);
  }finally{renderer.dispose();global.fetch=originalFetch;}
});

test('delivery planning freezes the video, requested sidecars and distinct audible track stems',()=>{
  const asset={...makeAsset('Game','game.mp4','video',8),hasAudio:true};
  const {timeline}=addMediaClip(defaultTimeline(),asset,'video1',0);
  const request={width:1280,height:720,fps:30,bitrate:8e6,format:'mp4',transparent:false,
    directory:'C:\\deliveries\\Huelith-Night',outputPath:'C:\\deliveries\\Huelith-Night\\Night.mp4',prefix:'Night',
    package:{captions:true,chapters:true,credits:true,stems:true}};
  const plan=planDelivery([{request,source:timeline,width:1920,name:'Night'}]);
  assert.deepEqual(plan.steps.map(step=>step.kind),['main','captions','chapters','credits','stem']);
  assert.equal(plan.steps.at(-1).trackId,'video1');
  assert.ok(validDeliveryPlan(structuredClone(plan)));
});
