const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const mockClip={id:'clip1',trackId:'video',assetId:'asset1',start:0,sourceIn:0,duration:10,
  volume:1,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0};
const timeline={tracks:[{id:'video',kind:'video',muted:false,locked:false}],
  assets:[{id:'asset1',name:'Capture',kind:'video',path:'C:\\clips\\capture.mp4',duration:10}],
  clips:[mockClip],background:'#183456'};
const options={timeline,range:{start:0,end:10},width:1920,height:1080,fps:60,frameCount:600,outputPath:'C:\\clips\\export.mp4'};
const sampleFilterRecipe={exposure:0,contrast:1.15,saturation:1.05,gamma:1,lift:0,
  temperature:.05,tint:0,fade:0,shadow:[0,0,0],highlight:[0,0,0],split:0,hue:0};
const sampleReveal={id:'horizontal',mask:'horizontal',duration:.54};
const sampleTransition={id:'in-horizontal',group:'Fade In',reveal:sampleReveal};
function adapter(spans=[]){
  const commands=[];let emit=()=>{};let unsubscribed=false;
  const native={framesWritten:600,width:1920,height:1080,fps:60,outputPath:options.outputPath,elapsedMs:50,backend:'Native',audioIncluded:false};
  const js=ts.transpileModule(read('src/editor/video/native-timeline-export.ts'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const module={exports:{}};
  vm.runInNewContext(js,{module,exports:module.exports,window:{__TAURI_INTERNALS__:{}},crypto:{randomUUID:()=>'job1'},
    require:name=>{
      if(name==='./native-capabilities.generated')return {NATIVE_EFFECT_KINDS:['brightness','contrast','saturation','saturate','grayscale','invert','sepia','exposure','gamma','video-filter','outline','pixelate','boxblur','posterize','solarize']};
      if(name==='@tauri-apps/api/core')return {invoke:async(cmd,args)=>{
        commands.push({cmd,args});
        if(cmd==='media_export_native_timeline'){
          emit({payload:{jobId:'job1',completed:500,total:600,sourceMs:4,compositeMs:3,encodeMs:2,
            backend:'Native Windows Media Foundation + Rust compositor',native:{copyMs:0,queueMs:0,bufferMs:0,convertMs:0,submitMs:2,audioMs:0,nativeTotalMs:2}}});
          return native;
        }
        return true;
      }};
      if(name==='@tauri-apps/api/event')return {listen:async(_name,fn)=>{emit=fn;return()=>{unsubscribed=true;}}};
      if(name==='./native-media')return {isNativeMediaDesktop:()=>true,probeNativeMedia:async()=>({width:1920,height:1080,frameRateNumerator:60,frameRateDenominator:1,duration100ns:null}),
        decodeNativePreview:async()=>({width:2,height:2,rgba:Array(16).fill(255)})};
      if(name==='./export-verification')return {verifyEncodedVideo:(settings,report)=>assert.equal(settings.frameCount,report.framesWritten)};
      if(name==='./library')return {resolvedAssetPath:async a=>a.path};
      if(name==='./audio-plan')return {timelineAudioSources:()=>[]};
      if(name==='./transition-placement')return {authoredTransitions:()=>spans};
      if(name==='./transition-recipes')return {AUTHORED_TRANSITION_LOOKUP:new Map([
        ['in-horizontal',sampleTransition],['combo-horizontal',{...sampleTransition,id:'combo-horizontal',group:'Combo'}]])};
      if(name==='./transitions')return {TRANSITION_LOOKUP:new Map([['vhs-cut',{id:'vhs-cut',effects:[{kind:'vhs',peak:90}]}]])};
      if(name==='./filters')return {VIDEO_FILTER_LOOKUP:new Map([
        ['nature-fern-canopy',{id:'nature-fern-canopy',recipe:sampleFilterRecipe}]])};
      throw Error('Unexpected import '+name);
    },AbortController,DOMException,Uint8Array,Number,Math,console}, {filename:'native-timeline-export.js'});
  return {api:module.exports,commands,unsubscribed:()=>unsubscribed};
}
test('native export plan preserves 1080p timeline, source path and background without a WebView session',async()=>{
  const {api}=adapter();
  const plan=await api.prepareNativeTimelinePlan(options);
  assert.equal(plan.stream.frameCount,600);
  assert.equal(plan.clips[0].kind,'video');
  assert.equal(plan.clips[0].path,timeline.assets[0].path);
  assert.deepEqual(Array.from(plan.background),[24,52,86]);
  assert.deepEqual(Array.from(plan.clips[0].crop),[0,0,1,1]);
});
test('native compiler keeps supported effects, clip masks, animated transforms and retiming',async()=>{
  const {api}=adapter();
  const patched={...mockClip,
    effects:[{kind:'brightness',enabled:true,amount:115,parameters:{},keyframes:[{time:0,parameter:'amount',value:100}]}],
    mask:{shape:'ellipse',region:{x:.1,y:.1,width:.8,height:.8},feather:.01},
    transitionIn:{kind:'cross-dissolve',duration:.6,direction:'left',placement:'start'},
    keyframes:[{parameter:'scale',time:0,value:1},{parameter:'scale',time:4,value:1.5}],
    sourceMap:[{time:0,source:1},{time:10,source:7}]};
  const output=await api.prepareNativeTimelinePlan({...options,timeline:{...timeline,clips:[patched]}});
  const clip=output.clips[0];
  assert.equal(clip.effects[0].kind,'brightness');
  assert.equal(clip.mask.shape,'ellipse');
  assert.equal(clip.transitionIn.kind,'cross-dissolve');
  assert.equal(clip.keyframes.length,2);
  assert.equal(clip.sourceMap.length,2);
});
test('native compiler preserves titles and rejects truly unimplemented effects',async()=>{
  const {api}=adapter();
  const withTitle={...timeline,tracks:[...timeline.tracks,{id:'title',kind:'title',muted:false,locked:false}],
    clips:[mockClip,{...mockClip,id:'text1',assetId:undefined,trackId:'title',title:'Hello Huelith',textStyle:{fontFamily:'Segoe UI',fontSize:64}}]};
  const planned=await api.prepareNativeVisualPlan({...options,timeline:withTitle});
  assert.equal(planned.clips[1].kind,'video');
  assert.equal(planned.clips[0].kind,'title');
  assert.equal(planned.clips[0].title,'Hello Huelith');
  await assert.rejects(api.prepareNativeTimelinePlan({...options,timeline:{...timeline,
    clips:[{...mockClip,effects:[{kind:'video-motion-trail',enabled:true,amount:80}]}]}}),/cannot yet reproduce clip/);
});
test('native compiler preserves real video-filter lookup recipe instead of rejecting the clip',async()=>{
  const {api}=adapter();
  const filtered={...mockClip,effects:[{id:'fx1',version:1,kind:'video-filter',amount:72,enabled:true,
    parameters:{lookId:'nature-fern-canopy'},keyframes:[]}]};
  const plan=await api.prepareNativeTimelinePlan({...options,timeline:{...timeline,clips:[filtered]}});
  assert.equal(plan.clips[0].effects[0].kind,'video-filter');
  assert.equal(plan.clips[0].effects[0].parameters.nativeRecipe.contrast,1.15);
  assert.deepEqual(plan.clips[0].effects[0].parameters.nativeRecipe.shadow,[0,0,0]);
  await assert.rejects(api.prepareNativeTimelinePlan({...options,timeline:{...timeline,clips:[{...filtered,
    effects:[{...filtered.effects[0],parameters:{lookId:'nonexistent-look'}}]}]}}),/missing filter look/);
});
test('authored transitions compile their native reveal and cut spans; no generic effect-transition error',async()=>{
  const first={...mockClip,id:'left',duration:5,transitionOut:undefined};
  const second={...mockClip,id:'right',start:5,duration:5,
    transitionIn:{version:1,kind:'effect',preset:'combo-horizontal',duration:.5,direction:'left',placement:'cut'}};
  const span={from:first,to:second,start:4.75,end:5.25,transition:second.transitionIn};
  const {api}=adapter([span]);
  const plan=await api.prepareNativeTimelinePlan({...options,timeline:{...timeline,clips:[first,second]}});
  assert.equal(plan.clips[1].transitionIn.nativeRecipe.group,'Combo');
  assert.equal(plan.clips[0].cutOut.kind,'effect');
  assert.equal(plan.clips[0].cutOut.nativeRecipe.reveal.mask,'horizontal');
  assert.equal(plan.clips[1].cutIn.kind,'effect');
});
test('legacy effect transitions are compiled as a native treatment stack instead of being rejected',async()=>{
  const {api}=adapter();
  const clip={...mockClip,transitionIn:{version:1,kind:'effect',preset:'vhs-cut',duration:.5,direction:'left',placement:'start'}};
  const plan=await api.prepareNativeTimelinePlan({...options,timeline:{...timeline,clips:[clip]}});
  assert.equal(plan.clips[0].transitionIn.nativeRecipe.group,'Legacy');
  assert.deepEqual(plan.clips[0].transitionIn.nativeRecipe.legacyEffects,[{kind:'vhs',peak:90}]);
});
test('native-only output sends one native job and emits acknowledged native stages, never browser RGBA frames',async()=>{
  const {api,commands,unsubscribed}=adapter();const metrics=[];
  const plan=await api.prepareNativeTimelinePlan(options);
  const result=await api.exportNativeTimeline(plan,undefined,(n,total,details)=>metrics.push([n,total,details]));
  assert.equal(result.framesWritten,600);
  assert.deepEqual(commands.map(c=>c.cmd),['media_export_native_timeline']);
  assert.equal(commands[0].args.jobId,'job1');
  assert.equal(metrics.find(m=>m[0]===500)[2].sourceBackend,'Native Windows Media Foundation + Rust compositor');
  assert.equal(metrics.at(-1)[2].phase,'verified');
  assert.equal(unsubscribed(),true);
});
test('model makes native export authoritative and removes obsolete decoder-selection checkbox',()=>{
  assert.doesNotMatch(read('src/editor/video/export-timeline.ts'),/TimelineCompositor|streamNativeVideo|useNativeSourceDecoder|webview/);
  assert.doesNotMatch(read('src/components/VideoExportDialog.tsx'),/nativeDecode|native-experimental/);
  assert.match(read('src-tauri/src/lib.rs'),/media::native_timeline::media_export_native_timeline/);
  assert.match(read('src-tauri/src/media/native_timeline.rs'),/stream_export/);
});
test('cleanup lists obsolete decoder and native-parity bridge but protects the new native engine',()=>{
  const manifest=JSON.parse(read('scripts/obsolete-migration-files.json'));
  assert.ok(manifest.obsolete.length>=6);
  for(const name of manifest.obsolete)assert.equal(fs.existsSync(path.join(root,name)),false);
  const code=read('scripts/cleanup-migrated.mjs');
  assert.match(code,/native_timeline\.rs/);
  assert.match(code,/existsSync\(resolve\(root,file\)\)/);
});
test('native encoder disables offline throttling rather than pacing to 60fps playback',()=>{
  const win=read('src-tauri/src/media/windows_mf.rs');
  assert.match(win,/MF_SINK_WRITER_DISABLE_THROTTLING,1/);
  assert.match(win,/MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS,1/);
  assert.doesNotMatch(win,/\.or_else\(\|_\|MFCreateSinkWriterFromURL/);
});
test('native timeline opens source decoders lazily and releases them as clips finish',()=>{
  const native=read('src-tauri/src/media/native_timeline.rs');
  assert.match(native,/if !sources\.contains_key\(&clip\.id\)/);
  assert.match(native,/PixelSource::open\(clip\)/);
  assert.match(native,/sources\.retain\(/);
});

test('all authored and legacy transition treatment kinds have native dispatchers',()=>{
  const authored=read('src/editor/video/transition-recipes.ts');
  const legacy=read('src/editor/video/transitions.ts');
  const native=read('src-tauri/src/media/native_timeline/authored_transition/fx.rs');
  const match=native.match(/const EFFECTS:&\[&str\]=&\[([\s\S]*?)\];/);
  assert.ok(match,'native transition treatment registry must exist');
  const supported=new Set([...match[1].matchAll(/"([^"]+)"/g)].map(item=>item[1]));
  const used=[...authored.matchAll(/fx:\{kind:'([^']+)'/g),...legacy.matchAll(/\{kind:'([^']+)',peak:/g)].map(item=>item[1]);
  for(const kind of new Set(used))assert.ok(supported.has(kind),`native transition treatment missing ${kind}`);
  assert.match(read('src-tauri/src/media/native_timeline.rs'),/mod authored_transition;/);
  assert.match(read('src-tauri/src/media/native_timeline.rs'),/mod filter_lut;/);
  assert.match(read('src-tauri/src/media/native_timeline.rs'),/authored_transition::coverage/);
  assert.match(read('src-tauri/src/media/native_timeline.rs'),/filter_lut::apply/);
});

test('classic outline compiles as a native operation with exact color and reference width',async()=>{
  const {api}=adapter();
  const withOutline={...mockClip,effects:[{id:'outline1',version:1,kind:'outline',enabled:true,
    amount:12,color:'#ff7755',parameters:{outlineStyle:'classic',opacity:92,softness:2},referenceWidth:1920}]};
  const plan=await api.prepareNativeTimelinePlan({...options,timeline:{...timeline,clips:[withOutline]}});
  assert.equal(plan.graphVersion,2);
  assert.equal(plan.clips[0].effects[0].kind,'outline');
  assert.equal(plan.clips[0].effects[0].color,'#ff7755');
  assert.equal(plan.clips[0].effects[0].referenceWidth,1920);
});
test('effect masks are retained instead of rejected when they are static',async()=>{
  const {api}=adapter();
  const mask={shape:'ellipse',region:{x:0.2,y:0.2,width:0.6,height:0.6},feather:0.01};
  const result=await api.prepareNativeVisualPlan({...options,timeline:{...timeline,clips:[{...mockClip,
    effects:[{id:'inv',kind:'invert',enabled:true,amount:50,mask}]}]}});
  assert.deepEqual(result.clips[0].effects[0].mask,mask);
});
test('preflight lists every unsupported clip in one pass',async()=>{
  const {api}=adapter();
  const edits=[{...mockClip,id:'one',effects:[{kind:'video-motion-trail',enabled:true,amount:80}]},
    {...mockClip,id:'two',start:10,duration:8,effects:[{kind:'glow',enabled:true,amount:22}]},
    {...mockClip,id:'three',start:19,duration:2,effects:[{kind:'outline',enabled:true,amount:9,parameters:{outlineStyle:'electric'}}]}];
  const project={...timeline,clips:edits};
  const issues=api.collectNativeRenderIssues(project,{start:0,end:25});
  assert.equal(issues.length,3);
  assert.deepEqual(Array.from(issues,issue=>issue.clipId),['one','two','three']);
  await assert.rejects(api.prepareNativeVisualPlan({...options,timeline:project,range:{start:0,end:25}}),error=>
    /3 issues/.test(error.message)&&/video-motion-trail/.test(error.message)&&/glow/.test(error.message)&&/outline styles/.test(error.message));
});
