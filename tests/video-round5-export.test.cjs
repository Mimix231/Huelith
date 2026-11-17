const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {Canvas}=require('skia-canvas');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
function load(relative,deps={}){
  const js=ts.transpileModule(read(relative),{fileName:relative,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('module','exports','require',js)(module,module.exports,name=>{
    if(!Object.hasOwn(deps,name))throw Error(`${relative}: dependency ${name} was not mocked`);
    return deps[name];
  });
  return module.exports;
}
const liveness=load('src/editor/video/export-liveness.ts');
const fidelity=load('src/editor/video/export-fidelity.ts');
const pipeline=load('src/editor/video/export-pipeline.ts');
const verification=load('src/editor/video/export-verification.ts');
const progress=load('src/editor/video/export-progress.ts');
function createFrame(color='#dc422b',width=16,height=16){
  const canvas=new Canvas(width,height),ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,width,height);return canvas;
}
function nativeHarness(options={}){
  const calls=[],submitted=[],events=[];
  const settings={outputPath:'C:\\rendered\\test.mp4',width:16,height:16,fps:30,frameCount:3,bitrate:8_000_000,audio:[]};
  const report={outputPath:settings.outputPath,framesWritten:3,width:16,height:16,fps:30,
    elapsedMs:140,backend:'Mock Media Foundation',audioIncluded:false};
  const videoInfo={width:16,height:16,frameRateNumerator:30,frameRateDenominator:1,
    pixelFormat:'BGRX32',duration100ns:1_000_000};
  const frame=()=>createFrame(options.color||'#dc422b');
  const invoke=async (name,args)=>{
    calls.push({name,args});
    if(name==='media_begin_export'){
      if(options.beginError)throw Error('Unable to initialize H.264 sink writer');
      return 82;
    }
    if(name==='media_push_export_frame'){
      if(options.pushError)throw Error('Native sink rejected frame');
      const bytes=args;
      assert.ok(bytes instanceof Uint8Array);
      assert.deepEqual([...bytes.slice(0,4)],[72,76,86,70]);
      const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      assert.equal(Number(header.getBigUint64(4,true)),82);
      assert.equal(header.getUint32(12,true),submitted.length);
      assert.equal(bytes.length,16+settings.width*settings.height*4);
      submitted.push(Uint8ClampedArray.from(bytes.slice(16)));
      return {copyMs:1,queueMs:0,bufferMs:0,convertMs:0,submitMs:1,audioMs:0,nativeTotalMs:2};
    }
    if(name==='media_finish_export')return report;
    if(name==='media_cancel_export')return;
    if(name==='media_probe_file')return videoInfo;
    if(name==='media_decode_preview'){
      const rgba=options.corruptOutput?Array(16*16*4).fill(0):Array.from(submitted[0]);
      return {width:16,height:16,rgba};
    }
    throw Error(`Unexpected mock command ${name}`);
  };
  const media=load('src/editor/video/native-media.ts',{
    '@tauri-apps/api/core':{invoke},
    './export-verification':verification,
    './export-pipeline':pipeline,
    './export-liveness':liveness,
    './export-fidelity':fidelity,
  });
  return {media,invoke,calls,submitted,events,settings,frame,report};
}
const withBrowser=async f=>{
  const previousWindow=global.window,previousDocument=global.document;
  global.window={__TAURI_INTERNALS__:{}};
  global.document={createElement:()=>new Canvas(1,1)};
  try{return await f();}finally{global.window=previousWindow;global.document=previousDocument;}
};

test('source-frame failure stops before any native output is opened',()=>withBrowser(async()=>{
  const h=nativeHarness();
  await assert.rejects(h.media.streamNativeVideo(h.settings,async()=>{throw Error('Source was moved');},()=>{}),/Source was moved/);
  assert.equal(h.calls.filter(c=>c.name==='media_begin_export').length,0);
}));

test('real RGBA frames pass sequentially through the binary Rust encoder and verify the produced MP4',()=>withBrowser(async()=>{
  const h=nativeHarness(),progress=[];
  let created=0;
  const report=await h.media.streamNativeVideo(h.settings,async index=>{
    created++;return createFrame(index===2?'#28a444':'#dc422b');
  },(completed,total,details)=>progress.push({completed,total,...details}));
  assert.equal(report.outputPath,h.settings.outputPath);
  assert.equal(created,3);
  assert.equal(h.submitted.length,3);
  assert.deepEqual(h.calls.map(c=>c.name).filter(name=>name==='media_push_export_frame'),
    ['media_push_export_frame','media_push_export_frame','media_push_export_frame']);
  assert.ok(progress.find(event=>event.phase==='preparing'&&event.previewDataUrl?.startsWith('data:image/jpeg')),
    'The first actual composited frame is exposed before encoder initialization');
  assert.equal(progress.filter(p=>p.phase==='rendering').length,3);
  assert.equal(progress.at(-1).phase,'verified');
  assert.ok(h.calls.findIndex(c=>c.name==='media_begin_export') < h.calls.findIndex(c=>c.name==='media_push_export_frame'));
}));

test('grossly corrupted black output is detected instead of reporting an MP4 success',()=>withBrowser(async()=>{
  const h=nativeHarness({color:'#fafafa',corruptOutput:true});
  await assert.rejects(h.media.streamNativeVideo(h.settings,async()=>h.frame(),()=>{}),/verification failed:.*differs strongly/i);
  assert.equal(h.submitted.length,3);
}));

test('source and encoder errors are distinguishable and cancelled native sessions are cleaned up',()=>withBrowser(async()=>{
  const h=nativeHarness({pushError:true});
  await assert.rejects(h.media.streamNativeVideo(h.settings,async()=>h.frame(),()=>{}),/Native sink rejected frame/);
  assert.ok(h.calls.some(c=>c.name==='media_cancel_export'));
  assert.equal(h.calls.some(c=>c.name==='media_finish_export'),false);
}));

test('failed native encoder initialization reports a native error without pushing frames',()=>withBrowser(async()=>{
  const h=nativeHarness({beginError:true});
  await assert.rejects(h.media.streamNativeVideo(h.settings,async()=>h.frame(),()=>{}),/Unable to initialize H\.264 sink writer/);
  assert.equal(h.submitted.length,0);
}));

test('stage deadlines and cancellations reject unresponsive operations',async()=>{
  await assert.rejects(liveness.awaitExportStage('Loading input',()=>new Promise(()=>{}),20),/Loading input exceeded/);
  const controller=new AbortController();
  const task=liveness.awaitExportStage('Waiting for codec',()=>new Promise(()=>{}),1000,controller.signal);
  controller.abort();await assert.rejects(task,/cancelled/);
});

test('visual signatures tolerate lossy noise but flag catastrophic differences',()=>{
  const a=createFrame('#cc3322'),pixels=a.getContext('2d').getImageData(0,0,16,16).data;
  const expected=fidelity.frameSignature(pixels,16,16);
  const adjusted=Array.from(pixels,(v,i)=>i%4===3?v:Math.max(0,Math.min(255,v+8)));
  assert.doesNotThrow(()=>fidelity.verifyFirstFrameFidelity(expected,{width:16,height:16,rgba:adjusted}));
  assert.throws(()=>fidelity.verifyFirstFrameFidelity(expected,{width:16,height:16,rgba:Array(1024).fill(0)}),/differs strongly/);
});

test('stage tracker retains first-frame thumbnail, while acknowledged frames drive progress',()=>{
  let now=0;const reports=[];
  const tracker=progress.createExportProgressTracker(value=>reports.push(value),{now:()=>now,intervalMs:100});
  tracker(0,500,{phase:'preparing',previewDataUrl:'data:image/jpeg;base64,abcd'});
  now=20;tracker(0,500,{phase:'initializing'});
  now=40;tracker(1,500,{phase:'rendering',renderMs:20,encodeMs:2});
  now=120;tracker(500,500,{phase:'verified'});
  assert.match(reports[0].message,/Loading source footage/);
  assert.equal(reports[0].previewDataUrl,'data:image/jpeg;base64,abcd');
  assert.match(reports[1].message,/Media Foundation/);
  assert.equal(reports.at(-1).fraction,1);
});

test('export overlay shows its actual encoded frames and job progress, never a second competing decoder',()=>{
  const code=read('src/components/VideoEditorExportOverlay.tsx');
  const css=read('src/components/VideoEditorExportOverlay.css');
  const job=read('src/components/useVideoJobs.ts');
  assert.match(code,/job\?\.previewDataUrl/);
  assert.match(code,/job\?\.message/);
  assert.match(code,/Export compositor · actual frame/);
  assert.doesNotMatch(code,/<VideoPreviewCanvas/);
  assert.match(job,/previewDataUrl/);
  assert.match(css,/hv-export-progress-waiting/);
});

test('native timeline emits a zero-frame source-ready update before its first heavy decode',()=>{
  const rust=read('src-tauri/src/media/native_timeline.rs');
  const frontend=read('src/editor/video/native-timeline-export.ts');
  assert.match(rust,/completed:0,total:config\.frame_count/);
  assert.match(frontend,/phase:p\.completed===0\?'preparing':'rendering'/);
});

function actualProcessedCache(){
  return load('src/editor/video/export-static-scene.ts',{
    './timeline':{activeClips:()=>[]},
    './effects/catalog':{VIDEO_TEMPORAL_KINDS:new Set(['video-temporal-echo']),VIDEO_TIME_VARYING_KINDS:new Set(['noise','vhs'])},
  });
}

test('retained still/title processing reuses unchanged pixels without skipping a dynamic video effect',async()=>{
  const staticCache=actualProcessedCache(),observed={source:0,effects:0};
  const timeline={assets:[{id:'red',kind:'image',name:'Red',path:'red.png',animated:false}],
    tracks:[{id:'back',kind:'video',muted:false}],background:'#000000',clips:[{
      id:'still',trackId:'back',assetId:'red',start:0,duration:3,sourceIn:0,opacity:1,
      scale:1,rotation:0,x:0,y:0,fadeIn:0,fadeOut:0,effects:[{enabled:true,kind:'brightness',amount:20}],
    }]};
  const api=load('src/editor/video/preview-frame-compositor.ts',{
    '../canvas-surface':{createSurface:()=>new Canvas(1,1)},
    './timeline':{opacityAt:()=>1},
    './preview-render-contract':{visibleVideoOperations:plan=>plan.timeline.clips.map(clip=>({clip,trackIndex:0}))},
    './clip-layout':{clipCrop:()=>({x:0,y:0,width:1,height:1}),fittedSize:(_a,_b,w,h)=>({width:w,height:h})},
    './clip-timing':{sourceTimeAt:(_c,t)=>t,playbackRateAt:()=>1},
    './motion':{transformAt:()=>({x:0,y:0,scale:1,scaleY:1,rotation:0})},
    './process-effects':{processVideoEffects:async source=>{observed.effects++;return source;}},
    './graphics':{drawVideoShape:()=>{}},'./text-renderer':{drawVideoText:()=>{}},
    './chroma-key':{keyRgba:()=>{}},
    './transition-placement':{authoredTransitions:()=>[]},
    './render-transition':{renderVideoTransition:async()=>{}},
    './smart-footage':{motionAt:()=>({x:0,y:0}),matteAt:()=>{}},
    './export-static-scene':staticCache,
  });
  const sources={pauseUnused:()=>{},frame:async()=>{observed.source++;return createFrame('#df3030');}};
  const plan={version:1,timeline,width:16,height:16,fps:30,designWidth:16,transparent:false};
  const cache=new staticCache.ProcessedLayerCache(2048);
  const first=await api.renderBrowserPreviewFrame(plan,.25,sources,false,undefined,cache);
  const second=await api.renderBrowserPreviewFrame(plan,1.25,sources,false,undefined,cache);
  assert.deepEqual([...first.getContext('2d').getImageData(8,8,1,1).data],
    [...second.getContext('2d').getImageData(8,8,1,1).data]);
  assert.deepEqual(observed,{source:1,effects:1});
  assert.equal(cache.hits,1);
  timeline.clips[0].effects=[{kind:'video-temporal-echo',enabled:true}];
  assert.equal(staticCache.canReuseStaticProcessedClip(timeline,timeline.clips[0]),false);
  cache.clear();assert.equal(cache.hits,0);
});

test('processed layer memory budget evicts oldest cached layer instead of growing indefinitely',()=>{
  const {ProcessedLayerCache}=actualProcessedCache();
  const cache=new ProcessedLayerCache(1100);
  cache.remember('first',createFrame('#ff0000'));
  cache.remember('second',createFrame('#00ff00'));
  assert.equal(cache.get('first'),undefined);
  assert.ok(cache.get('second'));
  assert.equal(cache.hits,1);
});

test('long effect chains yield to the event loop and respect cancellation without dropping operations',async()=>{
  const hits=[];
  const api=load('src/editor/video/process-effects.ts',{
    './frame-effects':{applyVideoFrameEffect:(image,effect)=>{
      hits.push(effect.id);const until=performance.now()+8;while(performance.now()<until){}return image;
    }},
    './effects/catalog':{VIDEO_EFFECT_LOOKUP:new Map([['brightness',{unit:'%',controls:[]}]]),
      VIDEO_TEMPORAL_KINDS:new Set(),VIDEO_TIME_VARYING_KINDS:new Set()},
    './effects/color-grade':{},'./effects/temporal-echo':{},'./effects/motion-trail':{},
    './effects/video-rolling-shutter':{},'./effects/focus-rack':{},
    './effects/film-gate-weave':{},'./effects/whip-pan-smear':{},'./effects/deflicker':{},
    './effects/types':{evaluateVideoEffect:effect=>effect},
    './frame-cache':{videoFrameIdentity:()=>undefined},
    './filters/render':{},'./color-tools':{applyVideoGrade:input=>input},
    './clip-timing':{},'./clip-layout':{},
  });
  const effects=Array.from({length:12},(_,i)=>({id:`layer${i}`,kind:'brightness',enabled:true,amount:25}));
  const controller=new AbortController();
  let timerObserved=false;
  setTimeout(()=>{timerObserved=true;controller.abort();},1);
  await assert.rejects(api.processVideoEffects(createFrame(),effects,
    {timestamp:0,sourceTime:0,fps:30,frameIndex:0,signal:controller.signal}),/aborted/i);
  assert.equal(timerObserved,true);
  assert.ok(hits.length>0&&hits.length<12,`processed ${hits.length} effects before cancellation`);
});

test('delivery forwards real first-frame previews and stage text to its queue reporter',async()=>{
  const seen=[];
  const report={outputPath:'C:\\out.mp4',framesWritten:2,width:16,height:16,fps:30,elapsedMs:100};
  const delivery=load('src/editor/video/delivery.ts',{
    '@tauri-apps/api/core':{invoke:async()=>{}},
    './captions':{captionCues:()=>[],serializeCaptions:()=>''},
    './timeline':{durationOf:()=>2,isVideoTimeline:()=>true},
    './export-timeline':{timelineAudioSources:()=>[],exportEditedVideo:async args=>{
      args.onProgress(0,2,{phase:'preparing',previewDataUrl:'data:image/jpeg;base64,preview'});
      args.onProgress(1,2,{phase:'rendering',renderMs:4,encodeMs:4});
      args.onProgress(2,2,{phase:'verified'});
      return report;
    }},
    './audio-catalogue':{recordingCredits:()=>''},
    './export-progress':progress,
    './working-storage':{rememberExport:()=>{}},
  });
  const scene={assets:[],tracks:[],clips:[]};
  const request={outputPath:'C:\\out.mp4',width:16,height:16,fps:30,bitrate:8000000,format:'mp4'};
  const plan={requests:[{request,source:scene,width:16,name:'Demo'}],steps:[{index:0,path:request.outputPath,kind:'main'}]};
  const output=await delivery.runDeliveryStep(plan,0,new AbortController().signal,
    (text,fraction,preview)=>seen.push({text,fraction,preview}));
  assert.equal(output,report);
  assert.ok(seen.some(event=>event.preview==='data:image/jpeg;base64,preview'));
  assert.equal(seen.at(-1).fraction,1);
});
