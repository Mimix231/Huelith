const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8');
function loadBridge(options={}){
  const calls=[];
  const source=ts.transpileModule(read('src/editor/video/native-frame-renderer.ts'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const module={exports:{}};
  new Function('module','exports','require','window','ImageData',source)(module,module.exports,name=>{
    if(name==='@tauri-apps/api/core')return {invoke:async(name,args)=>{
      calls.push([name,args]);return name==='media_read_native_preview'?Uint8Array.from([1,2,3,255]):Uint8Array.from([137,80,78,71,13,10,26,10]);
    }};
    if(name==='./native-media')return {isNativeMediaDesktop:()=>options.native!==false};
    if(name==='./native-timeline-export')return {prepareNativeVisualPlan:async(args)=>({width:args.width,height:args.height,fps:args.fps,clips:[],background:[0,0,0]})};
    if(name==='./timeline')return {durationOf:()=>5};
    throw Error('Unexpected module '+name);
  },{},class NativeImageData{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}});
  return {api:module.exports,calls};
}
test('native bridge uses binary IPC for persistent preview and PNG output',async()=>{
  const {api,calls}=loadBridge();const plan={width:1,height:1,fps:30,clips:[],background:[0,0,0]};
  await api.openNativeTimelinePreview('abc',plan);
  const pixels=await api.readNativeTimelineFrame('abc',1,1,1);
  assert.deepEqual([...pixels.data],[1,2,3,255]);
  const png=await api.renderNativeTimelinePng(plan,1);
  assert.deepEqual([...png.slice(0,4)],[137,80,78,71]);
  await api.closeNativeTimelinePreview('abc');
  assert.deepEqual(calls.map(call=>call[0]),[
    'media_open_native_preview','media_read_native_preview','media_render_native_png','media_close_native_preview']);
});
test('native bridge will not use WebView when desktop backend is absent',async()=>{
  const {api}=loadBridge({native:false});
  await assert.rejects(api.nativePreviewPlan({clips:[],tracks:[],assets:[]},640,360,30),/native Windows renderer/);
});
test('native editor rendering imports no removed browser compositor',()=>{
  for(const name of ['src/components/VideoPreviewCanvas.tsx','src/components/VideoClipFilmstrip.tsx',
    'src/components/VideoMediaThumbnail.tsx','src/components/VideoSourceTransport.tsx',
    'src/editor/video/frame-png.ts','src/editor/video/smart-analysis.ts']){
    const code=read(name);
    assert.doesNotMatch(code,/(?:from|import\()\s*['"].*\/compositor['"]/);
    assert.doesNotMatch(code,/<video\b|document\.createElement\(['"]video['"]\)/);
  }
  assert.equal(fs.existsSync(path.join(root,'src/editor/video/compositor.ts')),false);
  const rust=read('src-tauri/src/media/native_timeline.rs'),lib=read('src-tauri/src/lib.rs');
  for(const command of ['media_open_native_preview','media_read_native_preview','media_close_native_preview','media_render_native_png']){
    assert.ok(lib.includes('media::native_timeline::'+command));
    assert.ok(rust.includes('fn '+command));
  }
  assert.match(rust,/NativePreviewRequest::Frame/);
});
test('obsolete manifest removes only explicit legacy compositor modules',()=>{
  const manifest=JSON.parse(read('scripts/obsolete-migration-files.json'));
  for(const filename of ['src/editor/video/compositor.ts','src/editor/video/composite-cache.ts',
    'src/editor/video/effects-worker-client.ts']){
    assert.ok(manifest.obsolete.includes(filename));
    assert.ok(!fs.existsSync(path.join(root,filename)));
  }
  for(const live of ['src/editor/video/native-frame-renderer.ts','src/editor/video/native-timeline-export.ts',
    'src/editor/video/frame-png.ts','src-tauri/src/media/native_timeline.rs']){
    assert.ok(fs.existsSync(path.join(root,live)));
  }
});

test('single-source native frame plan includes all required visual clip fields',()=>{
  const {api}=loadBridge();
  const plan=api.nativeSingleSourcePlan('C:/clips/test.mp4','video',1.25,1920,1080);
  assert.equal(plan.clips.length,1);
  assert.equal(plan.clips[0].title,'');
  assert.equal(plan.clips[0].blendMode,'source-over');
  assert.deepEqual(plan.clips[0].effects,[]);
  assert.equal(plan.clips[0].sourceIn,1.25);
});
