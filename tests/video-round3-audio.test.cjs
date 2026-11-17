const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function read(relative){return fs.readFileSync(path.join(root,relative),'utf8');}
function load(relative,dependencies={}){
  const source=read(relative);
  const code=ts.transpileModule(source,{fileName:relative,reportDiagnostics:true,compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
  assert.equal(code.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0);
  const result={exports:{}};
  new Function('module','exports','require',code.outputText)(result,result.exports,name=>{
    if(!(name in dependencies))throw Error(`Unexpected import ${name} in ${relative}`);
    return dependencies[name];
  });
  return result.exports;
}
const {AudioSegmentCursor,AUDIO_PREVIEW_RATE}=load('src/editor/video/audio-segment-cursor.ts');
const {VideoPlaybackTransport}=load('src/editor/video/playback-transport.ts');
const {createVideoRenderContract}=load('src/editor/video/preview-render-contract.ts',{
  './timeline':{activeClips:()=>[]},
});

test('48 kHz timeline audio segments partition exactly across a window boundary',()=>{
  const cursor=new AudioSegmentCursor(AUDIO_PREVIEW_RATE-200,AUDIO_PREVIEW_RATE+120);
  assert.deepEqual(cursor.take(),{first:0,offset:AUDIO_PREVIEW_RATE-200,count:200,timelineSample:AUDIO_PREVIEW_RATE-200});
  assert.deepEqual(cursor.take(),{first:AUDIO_PREVIEW_RATE,offset:0,count:120,timelineSample:AUDIO_PREVIEW_RATE});
  assert.equal(cursor.take(),undefined);
});
test('audio loops only at its selected range and never accumulates fractional sample drift',()=>{
  const cursor=new AudioSegmentCursor(48_000,48_010,48_004);
  const slices=Array.from({length:201},()=>cursor.take());
  assert.ok(slices.every(slice=>slice.count>0));
  assert.equal(slices[0].count,10);
  for(const slice of slices.slice(1)){
    assert.equal(slice.timelineSample,48_004);
    assert.equal(slice.count,6);
  }
  assert.equal(cursor.nextSample,48_004);
  assert.throws(()=>new AudioSegmentCursor(-1,48000),/Invalid audio/);
  assert.throws(()=>new AudioSegmentCursor(48000,48000,48000),/Invalid audio/);
});
test('transport follows real output clock, freezes for rebuffer and rejects old audio generations',()=>{
  let system=1000,output=20;
  const t=new VideoPlaybackTransport(()=>system);
  t.start(2.5,25,1,()=>undefined,true,true);
  const generation=t.generation;
  system+=2000;
  assert.equal(t.time(),2.5);
  t.firstFrameReady(generation);
  assert.equal(t.useAudioClock(generation,2.5,20.05,()=>output),true);
  output=20.75;
  assert.ok(Math.abs(t.time()-3.2)<1e-8);
  t.holdForAudio(generation);
  const held=t.time();
  output=21.9;
  assert.equal(t.time(),held);
  t.useAudioClock(generation,held,22.1,()=>output);
  output=22.6;
  assert.ok(Math.abs(t.time()-(held+.5))<1e-8);
  t.pause();
  t.start(9,25,-1);
  assert.equal(t.playbackDirection,-1);
  assert.equal(t.useAudioClock(generation,2,23,()=>output),false);
});
test('resolution scaling keeps design-space text sizes stable between paused and playing previews',()=>{
  const timeline={assets:[],tracks:[],clips:[]};
  const still=createVideoRenderContract(timeline,1920,1080,30,false,1920);
  const playing=createVideoRenderContract(timeline,960,540,30,false,1920);
  const text=load('src/editor/video/text-renderer.ts');
  const clip={title:'Hello!',scale:1,textStyle:{fontSize:72,color:'#ffffff',width:.5}};
  function sizeFor(plan){
    const ctx={font:'',fillStyle:'',textAlign:'',textBaseline:'',shadowColor:'',shadowBlur:0,
      measureText:()=>({width:100}),fillText:()=>{},strokeText:()=>{},save:()=>{},restore:()=>{}};
    text.drawVideoText(ctx,clip,plan.width,plan.height,plan.designWidth);
    return Number(ctx.font.match(/\s(\d+(?:\.\d+)?)px/)[1]);
  }
  assert.equal(still.designWidth,playing.designWidth);
  assert.equal(sizeFor(still),72);
  assert.equal(sizeFor(playing),36);
  assert.equal(sizeFor(playing)/playing.width,sizeFor(still)/still.width);
  assert.throws(()=>createVideoRenderContract(timeline,960,540,30,false,0),/Invalid video/);
});

test('the live monitor passes original project width to the frame compositor at either quality',()=>{
  const canvas=read('src/components/VideoPreviewCanvas.tsx');
  const compositor=read('src/editor/video/preview-frame-compositor.ts');
  assert.match(canvas,/createVideoRenderContract\(scene\.timeline,width,height,scene\.fps,!!scene\.transparent,scene\.width\)/);
  assert.match(compositor,/drawVideoText\(ctx,\{\.\.\.clip,scale:1\},width,height,designWidth\?\?width/);
  assert.match(compositor,/referenceWidth:designWidth\?\?width/);
});
test('reverse playback never runs forward video source decoders or takes a Web Audio clock',()=>{
  const video=read('src/components/VideoPreviewCanvas.tsx');
  const audio=read('src/components/VideoAudioPreview.tsx');
  const sources=read('src/editor/video/preview-media-sources.ts');
  assert.match(video,/scene\.transport\?\.playbackDirection!==-1/);
  assert.match(audio,/transport\.playbackDirection===-1/);
  assert.match(audio,/\[playing,direction,plan\.length>0/);
  assert.match(read('src/components/VideoWorkspace.tsx'),/transport=\{transport\} direction=\{direction\}/);
  assert.match(sources,/video\.muted=true;video\.volume=0/);
});

function audioHarness(plan,urls,bufferByUrl){
  const reader=load('src/editor/video/preview-audio.ts',{
    '@tauri-apps/api/core':{invoke:async()=>{throw Error('No native audio in browser test');}},
    './audio-plan':{
      audioGainAt:(source,time)=>time<source.start||time>=source.start+source.duration?0:source.volume,
      audioPanAt:(source)=>source.pan??0,
      audioPositionAt:(source,time)=>({sourceTime:source.sourceIn+Math.max(0,time-source.start)*(source.rate??1)}),
      audioVoiceMixAt:(source)=>source.voice?.mix??0,
    },
    './native-media':{isNativeMediaDesktop:()=>false},
    './audio-segment-cursor':{AUDIO_PREVIEW_RATE:48_000,AUDIO_PREVIEW_WINDOW:48_000},
  });
  const windows=new reader.PreviewAudioWindows(plan,urls);
  windows.decode=async url=>bufferByUrl[url];
  return windows;
}
function buffer(left,right=left){
  return {sampleRate:48_000,numberOfChannels:2,getChannelData(index){return index?right:left;}};
}
const audioSource=(id,patch={})=>({id,assetId:id,path:`${id}.wav`,start:0,sourceIn:0,duration:2,
  volume:1,fadeIn:0,fadeOut:0,required:true,trackId:id,...patch});
const value=(window,sample=0,ch=0)=>window.samples[sample*2+ch]/32767;

test('browser audio preview mixes dialogue and music independently with sample-aligned track levels',async()=>{
  const constant=(n)=>new Float32Array(48_000*2).fill(n);
  const reader=audioHarness([audioSource('speech'),audioSource('music',{volume:.5})],
    {speech:'speech.wav',music:'music.wav'}, {'speech.wav':buffer(constant(.25)),'music.wav':buffer(constant(.2))});
  try{
    const mixed=await reader.get(0);
    assert.ok(Math.abs(value(mixed,100,0)-.35)<.001);
    assert.ok(Math.abs(value(mixed,16000,1)-.35)<.001);
    assert.ok(mixed.levels[0].speech>.2);
    assert.ok(mixed.levels[0].music>.09);
    assert.equal((await reader.get(0)),mixed,'consecutive preview requests reuse one window');
  }finally{reader.close();}
});
test('audio preview maps edited source speed and stereo pans without replaying the original clip position',async()=>{
  const values=Float32Array.from({length:48_000*2},(_,i)=>i/(48_000*2));
  const zero=new Float32Array(values.length);
  const reader=audioHarness([audioSource('rate',{duration:.5,sourceIn:.1,rate:2,pan:1})],
    {rate:'rate.wav'}, {'rate.wav':buffer(values,zero)});
  try{
    const mixed=await reader.get(0);
    assert.ok(Math.abs(value(mixed,0,1)-.05)<.003,'source offset is applied');
    assert.ok(Math.abs(value(mixed,2400,1)-.1)<.003,'2× speed advances source by .1 s');
    assert.ok(Math.abs(value(mixed,2400,0))<.001,'full right pan attenuates the left output');
    assert.equal(value(mixed,30000,0),0,'audio ends at its timeline trim');
  }finally{reader.close();}
});
test('voice warmth keeps filter memory at a one-second boundary and resets after discontinuous seeking',async()=>{
  const constant=new Float32Array(48_000*3).fill(.08);
  const source=audioSource('voice',{duration:3,voice:{mode:'warm',mix:1}});
  const reader=audioHarness([source],{voice:'voice.wav'},{'voice.wav':buffer(constant)});
  try{
    const first=await reader.get(0);
    const second=await reader.get(48_000);
    assert.ok(Math.abs(value(first,47_999)-value(second,0))<.0005,'no filter reset at contiguous audio windows');
    const third=await reader.get(96_000);
    assert.ok(Math.abs(value(third,0)-value(second,0))<.0005);
    assert.equal(reader.voiceStates.get('voice').sample,144_000);
  }finally{reader.close();}
});
test('missing required audio fails explicitly rather than silently dropping narration',async()=>{
  const reader=audioHarness([audioSource('narration')],{},{});
  try{await assert.rejects(reader.get(0),/Required audio asset narration/);}
  finally{reader.close();}
});
test('closing while a cooperative audio mix is in progress aborts the pending stale window',async()=>{
  const constant=new Float32Array(48_000).fill(.15);
  const reader=audioHarness([audioSource('voice')],{voice:'voice.wav'},{'voice.wav':buffer(constant)});
  const pending=reader.get(0);
  setTimeout(()=>reader.close(),0);
  await assert.rejects(pending,{name:'AbortError'});
});

test('ranged WAV and hybrid MP4 retain one audio rebase, not two, and preserve project design width',async()=>{
  const captured=[];
  const exporter=load('src/editor/video/export-timeline.ts',{
    './timeline':{durationOf:()=>15},
    './native-media':{exportNativeWav:async settings=>{captured.push(['wav',settings]);return {outputPath:'mixed.wav'};}},
    './native-timeline-export':{prepareNativeTimelinePlan:async()=>({}),exportNativeTimeline:async()=>({})},
    './hybrid-timeline-export':{
      selectVideoExportBackend:()=>({backend:'browser-frames'}),
      exportCompatibleVideoFrames:async args=>{captured.push(['hybrid',args]);return {outputPath:'video.mp4'};},
    },
    './library':{resolvedAssetPath:async asset=>asset.path},
    './audio-plan':{timelineAudioSources:(_timeline,range)=>{
      assert.deepEqual(range,{start:5,end:10});
      return [{assetId:'voice',trackId:'audio1',start:1,duration:2,sourceIn:5,volume:1}];
    }},
  });
  const common={timeline:{assets:[],tracks:[],clips:[]},width:960,height:540,fps:30,
    referenceWidth:1920,range:{start:5,end:10},outputPath:'mixed.wav',onProgress:()=>{}};
  await exporter.exportEditedVideo({...common,format:'wav'});
  await exporter.exportEditedVideo({...common,format:'mp4',outputPath:'video.mp4'});
  assert.equal(captured[0][1].audio[0].start,1);
  assert.equal(captured[1][1].settings.audio[0].start,1);
  assert.equal(captured[1][1].designWidth,1920);
});
test('native MP4 timeline planner retains a single output-relative audio offset',async()=>{
  const native=load('src/editor/video/native-timeline-export.ts',{
    '@tauri-apps/api/core':{invoke:async()=>{}},
    '@tauri-apps/api/event':{listen:async()=>()=>{}},
    './native-capabilities.generated':{NATIVE_EFFECT_KINDS:[]},
    './transition-placement':{authoredTransitions:()=>[]},
    './transition-recipes':{AUTHORED_TRANSITION_LOOKUP:new Map()},
    './transitions':{TRANSITION_LOOKUP:new Map()},
    './filters':{VIDEO_FILTER_LOOKUP:new Map()},
    './native-media':{isNativeMediaDesktop:()=>false},
    './audio-segment-cursor':{AUDIO_PREVIEW_RATE:48_000,AUDIO_PREVIEW_WINDOW:48_000},
    './export-verification':{verifyEncodedVideo:async()=>{}},
    './library':{resolvedAssetPath:async asset=>asset.path},
    './audio-plan':{timelineAudioSources:(_scene,range)=>{
      assert.deepEqual(range,{start:5,end:10});return [{assetId:'voice',start:1,duration:2,sourceIn:5}];
    }},
  });
  const plan=await native.prepareNativeTimelinePlan({timeline:{assets:[],tracks:[],clips:[]},
    range:{start:5,end:10},width:960,height:540,fps:30,frameCount:150,outputPath:'test.mp4'});
  assert.equal(plan.rangeStart,5);
  assert.equal(plan.stream.audio[0].start,1);
});
