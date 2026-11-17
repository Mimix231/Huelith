const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(p,dependencies={}){
  const source=fs.readFileSync(path.join(root,p),'utf8');
  const code=ts.transpileModule(source,{fileName:p,compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJS}}).outputText;
  const result={exports:{}};
  new Function('module','exports','require',code)(result,result.exports,name=>{
    if(!(name in dependencies))throw Error(`Unexpected dependency ${name} for ${p}`);
    return dependencies[name];
  });
  return result.exports;
}
const {PreviewRenderQueue}=load('src/editor/video/preview-render-queue.ts');
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function schedulerHarness(){
  const jobs=[],shown=[],errors=[];
  const q=new PreviewRenderQueue((request,signal)=>{
    const d=deferred();jobs.push({request,signal,...d});return d.promise;
  },(value,info)=>shown.push([value,info.request.key]),(error,req)=>errors.push([String(error),req.key]));
  return {q,jobs,shown,errors};
}
const frame=(key,seconds,mode='editing',revision=1)=>({key,seconds,mode,revision,payload:{key}});

test('rapid scrubbing cancels the obsolete frame and commits only the newest request',async()=>{
  const h=schedulerHarness();
  h.q.request(frame('seek-1',1));
  h.q.request(frame('seek-2',2));
  h.q.request(frame('seek-3',3));
  assert.equal(h.jobs.length,1);
  assert.equal(h.jobs[0].signal.aborted,true);
  h.jobs[0].resolve('wrong frame');await flush();
  assert.equal(h.jobs.length,2);
  assert.equal(h.jobs[1].request.seconds,3);
  h.jobs[1].resolve('newest frame');await flush();
  assert.deepEqual(h.shown,[['newest frame','seek-3']]);
  assert.deepEqual(h.errors,[]);
  h.q.close();
});

test('playback coalesces frames without abort starvation and only keeps newest queued time',async()=>{
  const h=schedulerHarness();
  h.q.request(frame('at-0',0,'playback'));
  h.q.request(frame('at-1',1/30,'playback'));
  h.q.request(frame('at-2',2/30,'playback'));
  assert.equal(h.jobs.length,1);
  assert.equal(h.jobs[0].signal.aborted,false);
  h.jobs[0].resolve('frame 0');await flush();
  assert.equal(h.jobs.length,2);
  assert.equal(h.jobs[1].request.key,'at-2');
  h.jobs[1].resolve('frame 2');await flush();
  assert.deepEqual(h.shown.map(s=>s[0]),['frame 0','frame 2']);
  h.q.close();
});

test('playback drops frames older than the audio clock while preserving render throughput',async()=>{
  const h=schedulerHarness();
  h.q.request(frame('at-0',0,'playback'));
  h.q.request(frame('at-30',1,'playback'));
  h.jobs[0].resolve('too late');await flush();
  assert.deepEqual(h.shown,[]);
  assert.equal(h.jobs.length,2);
  h.jobs[1].resolve('on time');await flush();
  assert.deepEqual(h.shown,[['on time','at-30']]);
  h.q.close();
});

test('changing a clip invalidates a pending playback frame without painting stale effects',async()=>{
  const h=schedulerHarness();
  h.q.request(frame('old-preview',.5,'playback',1));
  h.q.invalidate();
  assert.equal(h.jobs[0].signal.aborted,true);
  h.q.request(frame('new-preview',.5,'editing',2));
  h.jobs[0].resolve('old effects');await flush();
  h.jobs[1].resolve('new effects');await flush();
  assert.deepEqual(h.shown,[['new effects','new-preview']]);
  h.q.close();
});

test('same-frame rAF requests are deduplicated; close discards unfinished work',async()=>{
  const h=schedulerHarness(),r=frame('same',.25,'playback');
  for(let i=0;i<100;i++)h.q.request(r);
  assert.equal(h.jobs.length,1);
  h.jobs[0].resolve('current');await flush();
  for(let i=0;i<100;i++)h.q.request(r);
  assert.equal(h.jobs.length,1);
  h.q.request(frame('next',.5,'editing'));
  h.q.close();
  h.jobs[1].resolve('late');await flush();
  assert.deepEqual(h.shown,[['current','same']]);
});

test('aborted decoder failures do not become visible preview errors',async()=>{
  const h=schedulerHarness();
  h.q.request(frame('a',1));h.q.request(frame('b',2));
  h.jobs[0].reject(Error('old media error'));await flush();
  h.jobs[1].reject(Error('active media error'));await flush();
  assert.deepEqual(h.errors,[['Error: active media error','b']]);
  h.q.close();
});

test('hybrid export reports a required phase even when native stream omits progress details',async()=>{
  const captured=[];
  const api=load('src/editor/video/hybrid-timeline-export.ts',{
  './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
      './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    './effects/catalog':{VIDEO_EFFECT_LOOKUP:new Map(),VIDEO_TEMPORAL_KINDS:new Set()},
    './filters':{VIDEO_FILTER_LOOKUP:new Map()},
    './native-timeline-export':{collectNativeRenderIssues:()=>[]},
    './transition-recipes':{AUTHORED_TRANSITION_LOOKUP:new Map()},
    './transitions':{TRANSITION_LOOKUP:new Map()},
    './transition-placement':{authoredTransitions:()=>[]},
    './native-media':{streamNativeVideo:async(_settings,render,onProgress)=>{
      await render(0);onProgress(1,1);onProgress(1,1,{phase:'finalizing'});
      return {outputPath:'test.mp4',framesWritten:1};
    }},
    './preview-media-sources':{PreviewMediaSources:class{close(){}}},
    './preview-render-contract':{createVideoRenderContract:()=>({version:1})},
    './preview-frame-compositor':{renderBrowserPreviewFrame:async()=>({})},
  });
  await api.exportCompatibleVideoFrames({timeline:{assets:[],tracks:[],clips:[]},range:{start:0,end:1},
    settings:{width:1,height:1,fps:1},onProgress:(_n,_t,details)=>captured.push(details)});
  assert.equal(captured[0].phase,'rendering');
  assert.equal(captured[1].phase,'finalizing');
  assert.match(captured[0].sourceBackend,/WebView Canvas2D/);
});

test('video monitor uses the independently testable queue, not the native timeline compositor',()=>{
  const monitor=fs.readFileSync(path.join(root,'src/components/VideoPreviewCanvas.tsx'),'utf8');
  assert.match(monitor,/new PreviewRenderQueue/);
  assert.match(monitor,/renderBrowserPreviewFrame/);
  assert.match(monitor,/queue\.current\?\.invalidate\(\)/);
  assert.doesNotMatch(monitor,/readNativeTimelineFrame|openNativeTimelinePreview/);
});

function mediaPoolHarness(){
  class FakeCanvas {
    width=0;height=0;
    context={drawImage:()=>{},clearRect:()=>{},putImageData:()=>{},getImageData:()=>({data:new Uint8ClampedArray(4)})};
    getContext(){return this.context;}
  }
  const api=load('src/editor/video/preview-media-sources.ts',{
    '../canvas-surface':{createSurface:()=>new FakeCanvas()},
    './media-assets':{mediaUrl:async asset=>asset.path},
    './raster-media':{GifSource:class GifSource {},loadRasterMedia:async()=>null},
    './library':{resolvedAssetPath:async asset=>asset.path},
    './native-media':{isNativeMediaDesktop:()=>false},
    './native-frame-renderer':{},
    './playback-transport':{synchronizedPlaybackRate:(actual,target,rate)=>rate*(1+Math.max(-.03,Math.min(.03,(target-actual)*.15)))},
  });
  const instances=[];
  const pool=new api.PreviewMediaSources();
  pool.initialize=async(_asset,identity)=>{
    const video={currentTime:0,paused:true,playbackRate:1,duration:30,seeking:false,readyState:4,
      seekCount:0,pauseCount:0,playCount:0,
      play:async function(){this.playCount++;this.paused=false;},
      pause:function(){this.pauseCount++;this.paused=true;},
      removeAttribute:()=>{},load:()=>{},
    };
    let at=0;
    Object.defineProperty(video,'currentTime',{get:()=>at,set:value=>{video.seekCount++;at=value;}});
    instances.push({identity,video});
    pool.videos.add(video);
    return {identity,kind:'video',width:20,height:10,video};
  };
  const asset=id=>({id,path:`${id}.mp4`,kind:'video',duration:30,name:id,frameRate:30});
  return {pool,asset,instances};
}

test('source decoder follows timeline clock and corrects small drift without a seek storm',async()=>{
  const {pool,asset,instances}=mediaPoolHarness();
  pool.pauseUnused(new Set(['a']));
  await pool.frame(asset('one'),2,true,undefined,1,'a');
  assert.equal(instances[0].video.seekCount,1);
  assert.equal(instances[0].video.playCount,1);
  await pool.frame(asset('one'),2.04,true,undefined,1,'a');
  assert.equal(instances[0].video.seekCount,1);
  assert.ok(instances[0].video.playbackRate>1);
  await pool.frame(asset('one'),2.5,true,undefined,1,'a');
  assert.equal(instances[0].video.seekCount,2);
  await pool.frame(asset('one'),2.55,false,undefined,1,'a');
  assert.equal(instances[0].video.paused,true);
  pool.close();
});

test('duplicated source clips have isolated decoder clocks and reusable frame buffers',async()=>{
  const {pool,asset,instances}=mediaPoolHarness();
  pool.pauseUnused(new Set(['a','b']));
  const first=await pool.frame(asset('same'),1,true,undefined,1,'a');
  const repeat=await pool.frame(asset('same'),1.03,true,undefined,1,'a');
  assert.equal(first,repeat);
  await pool.frame(asset('same'),8,false,undefined,1,'b');
  assert.equal(instances.length,2);
  assert.notEqual(instances[0].video,instances[1].video);
  assert.equal(instances[0].video.currentTime,1);
  assert.equal(instances[1].video.currentTime,8);
  pool.close();
});

test('decoder budget never evicts a simultaneously visible compositing layer',async()=>{
  const {pool,asset,instances}=mediaPoolHarness();
  pool.pauseUnused(new Set(Array.from({length:15},(_,i)=>`visible-${i}`)));
  for(let i=0;i<15;i++)await pool.frame(asset('shared'),i,false,undefined,1,`visible-${i}`);
  assert.equal(pool.stats.decoders,15);
  pool.pauseUnused(new Set());
  await flush();
  assert.equal(pool.stats.decoders,12);
  assert.ok(instances.slice(0,3).every(item=>item.video.pauseCount>=1));
  pool.close();
});

test('the browser decoder warms an upcoming cut without blocking the current clip',async()=>{
  const {pool,asset,instances}=mediaPoolHarness();
  const upcoming=asset('next');
  const t={tracks:[{id:'video',kind:'video',muted:false}],assets:[upcoming],
    clips:[{id:'next-clip',trackId:'video',assetId:'next',start:5,duration:3}]};
  pool.prepareUpcoming(t,3,1.25);
  await flush();
  assert.equal(instances.length,0);
  pool.prepareUpcoming(t,4.25,1.25);
  await flush();
  assert.equal(instances.length,1);
  pool.prepareUpcoming(t,4.7,1.25);
  await flush();
  assert.equal(instances.length,1);
  pool.close();
});

test('transport restart discards frames from its earlier playback generation',async()=>{
  const h=schedulerHarness();
  h.q.request({...frame('original',.5,'playback'),generation:1});
  h.q.request({...frame('restarted',.5,'playback'),generation:2});
  h.jobs[0].resolve('wrong transport');await flush();
  h.jobs[1].resolve('correct transport');await flush();
  assert.deepEqual(h.shown,[['correct transport','restarted']]);
  h.q.close();
});

test('native source decoder is a fallback for WebView pixel failures, not an effect compositor',async()=>{
  const opened=[],reads=[],closed=[];
  const api=load('src/editor/video/preview-media-sources.ts',{
    '../canvas-surface':{createSurface:()=>({width:0,height:0,
      getContext:()=>({clearRect:()=>{},drawImage:()=>{},
        getImageData:()=>{throw Error('Canvas is not origin-clean');},putImageData:()=>{}})})},
    './media-assets':{mediaUrl:async a=>a.path},
    './raster-media':{GifSource:class{},loadRasterMedia:async()=>null},
    './library':{resolvedAssetPath:async a=>a.path},
    './native-media':{isNativeMediaDesktop:()=>true},
    './native-frame-renderer':{
      nativeSingleSourcePlan:(path,kind,from,width,height)=>({clips:[{duration:0}],path,kind,from,width,height}),
      openNativeTimelinePreview:async(id,plan)=>opened.push({id,plan}),
      readNativeTimelineFrame:async(id,time,width,height)=>{
        reads.push({id,time,width,height});
        return {width,height,data:new Uint8ClampedArray(width*height*4)};
      },
      closeNativeTimelinePreview:async id=>closed.push(id),
    },
    './playback-transport':{synchronizedPlaybackRate:(_actual,_target,rate)=>rate},
  });
  const pool=new api.PreviewMediaSources(),asset={id:'wide',path:'wide.mp4',name:'Ultrawide',
    kind:'video',duration:8,width:2560,height:1080};
  const video={currentTime:0,paused:true,playbackRate:1,duration:8,seeking:false,readyState:4,
    play:async()=>{},pause:()=>{},removeAttribute:()=>{},load:()=>{}};
  pool.videos.add(video);
  pool.initialize=async(_asset,identity)=>({identity,kind:'video',width:2560,height:1080,video});
  const c=await pool.frame(asset,1,false,undefined,1,'clip-a');
  assert.equal(c.width,1920);
  assert.equal(c.height,810); // correct 64:27 aspect, not squashed to 16:9
  assert.equal(opened.length,1);
  assert.deepEqual(reads.map(call=>call.time),[1]);
  await pool.frame(asset,2,false,undefined,1,'clip-a');
  assert.equal(opened.length,1);
  assert.deepEqual(reads.map(call=>call.time),[1,2]);
  pool.close();await flush();
  assert.equal(closed.length,1);
});

test('detached monitor and source viewer anchor playback to externally delivered time',()=>{
  const monitor=fs.readFileSync(path.join(root,'src/components/VideoPreviewCanvas.tsx'),'utf8');
  const source=fs.readFileSync(path.join(root,'src/components/VideoSourceTransport.tsx'),'utf8');
  assert.match(monitor,/if\(!props\.transport\|\|!props\.playing\)clock\.current=/);
  assert.match(monitor,/request\.transport\?\.time\(\)/);
  assert.match(source,/browser composition path/);
});

test('invalid video clips show a missing-source error rather than silently drawing black',async()=>{
  const {Canvas}=require('skia-canvas');
  const compositor=load('src/editor/video/preview-frame-compositor.ts',{
    './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    '../canvas-surface':{createSurface:()=>new Canvas(1,1)},
    './timeline':{opacityAt:()=>1},
    './preview-render-contract':{visibleVideoOperations:plan=>plan.timeline.clips.map(clip=>({clip}))},
    './clip-layout':{},'./clip-timing':{},'./motion':{},
    './process-effects':{},'./effects/catalog':{VIDEO_TEMPORAL_KINDS:new Set()},
    './graphics':{},'./text-renderer':{},'./chroma-key':{},
    './transition-placement':{authoredTransitions:()=>[]},
    './render-transition':{renderVideoTransition:async(from)=>from},
    './smart-footage':{matteAt:()=>{},motionAt:()=>({x:0,y:0})},
  });
  const timeline={assets:[],tracks:[{id:'video',kind:'video',muted:false}],clips:[{
    id:'lost-media',trackId:'video',assetId:'no-longer-on-disk',start:0,duration:2,
  }]};
  await assert.rejects(compositor.renderBrowserPreviewFrame({version:1,timeline,width:32,height:18,
    transparent:false},.25,{pauseUnused:()=>{},frame:async()=>{throw Error('Should not decode');}}),
  /Missing visual source for clip lost-media/);
});
