const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {Canvas}=require('skia-canvas');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(p,deps={}){
  const compiled=ts.transpileModule(read(p),{fileName:p,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('module','exports','require',compiled)(module,module.exports,name=>{
    if(!Object.hasOwn(deps,name))throw Error(`${p}: unexpected dependency ${name}`);
    return deps[name];
  });
  return module.exports;
}
const clip=(id,trackId,props={})=>({id,trackId,start:0,duration:2,sourceIn:0,opacity:1,fadeIn:0,fadeOut:0,
  x:0,y:0,rotation:0,scale:1,...props});
const track={id:'video',kind:'video',muted:false};
const scene=(clips,assets=[])=>({tracks:[track],assets,clips,background:'#010203'});
const staticScene=load('src/editor/video/export-static-scene.ts',{
  './timeline':{activeClips:(timeline,time)=>timeline.clips.filter(c=>c.start<=time&&time<c.start+c.duration)},
  './effects/catalog':{VIDEO_TEMPORAL_KINDS:new Set(['video-temporal-echo']),VIDEO_TIME_VARYING_KINDS:new Set(['noise'])},
});
const reuse=(transitions=[])=>load('src/editor/video/export-frame-reuse.ts',{
  './export-static-scene':staticScene,
  './transition-placement':{authoredTransitions:()=>transitions},
}).createExportFrameReuse;

test('still images and title cards reuse complete output pixels, but clip boundaries still render',()=>{
  const timeline=scene([
    clip('still','video',{assetId:'still',duration:2}),
    clip('title','titles',{title:'hello',start:2,duration:1})
  ],[{id:'still',kind:'image',animated:false,revision:1}]);
  timeline.tracks.push({id:'titles',kind:'title',muted:false});
  const canReuse=reuse()(timeline,0,2);
  assert.equal(canReuse(0),false);
  assert.equal(canReuse(1),true);
  assert.equal(canReuse(2),true);
  assert.equal(canReuse(3),true);
  assert.equal(canReuse(4),false); // change from still to title
  assert.equal(canReuse(5),true);
});

test('moving media, keyframes, transitions, gradients and temporal effects cannot be silently deduplicated',()=>{
  const movie=scene([clip('moving','video',{assetId:'movie'})],[{id:'movie',kind:'video',frameRate:30}]);
  const movieReuse=reuse()(movie,0,60);
  assert.equal(movieReuse(0),false);
  assert.equal(movieReuse(1),false);
  assert.equal(movieReuse(2),false);
  const effect=scene([clip('t','video',{title:'Animated',effects:[{kind:'noise',enabled:true}]})]);
  const effectReuse=reuse()(effect,0,60);
  assert.equal(effectReuse(0),false);
  assert.equal(effectReuse(1),false);
  const fade=scene([clip('f','video',{title:'Title',fadeIn:.3})]);
  const fadeReuse=reuse()(fade,0,60);
  assert.equal(fadeReuse(0),false);
  assert.equal(fadeReuse(1),false);
  const still=scene([clip('i','video',{assetId:'i'})],[{id:'i',kind:'image'}]);
  const guard=reuse([{start:.4,end:.8}]);
  const guarded=guard(still,0,10);
  assert.deepEqual(Array.from({length:10},(_,i)=>guarded(i)),
    [false,true,true,true,false,false,false,false,false,false]);
});

test('repeated frame decisions reject out-of-order checks and invalid clocks',()=>{
  const t=scene([]);
  assert.throws(()=>reuse()(t,Number.NaN,60),/Invalid export/);
  const r=reuse()(t,0,60);
  assert.throws(()=>r(3),/sequential/);
  assert.equal(r(0),false);
  assert.throws(()=>r(2),/sequential/);
});

const makeFrame=color=>{const c=new Canvas(16,16);const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,16,16);return c;};
async function withWebView(run){const old=global.window;global.window={__TAURI_INTERNALS__:{}};
  try{return await run();}finally{global.window=old;}}
function streamHarness(){
  const settings={outputPath:'C:\\test.mp4',width:16,height:16,fps:30,frameCount:4,audio:[]};
  const calls=[],rgbaFrames=[];
  const invoke=async (command,args)=>{
    calls.push({command,args});
    if(command==='media_begin_export')return 12;
    if(command==='media_push_export_frame'){
      const raw=args,offset=new DataView(raw.buffer,raw.byteOffset,raw.byteLength).getUint32(12,true);
      rgbaFrames[offset]=Array.from(raw.slice(16));
      return {copyMs:1,queueMs:0,bufferMs:0,convertMs:1,submitMs:1,audioMs:0,nativeTotalMs:2};
    }
    if(command==='media_repeat_export_frames'){
      assert.equal(args.repeatCount,1);
      assert.equal(args.index,rgbaFrames.length);
      rgbaFrames[args.index]=rgbaFrames.at(-1);
      return {copyMs:0,queueMs:0,bufferMs:0,convertMs:1,submitMs:1,audioMs:0,nativeTotalMs:2};
    }
    if(command==='media_finish_export')return {outputPath:settings.outputPath,framesWritten:4,width:16,height:16,fps:30,elapsedMs:100};
    if(command==='media_probe_file')return {width:16,height:16,frameRateNumerator:30,frameRateDenominator:1,duration100ns:1333333};
    if(command==='media_decode_preview')return {width:16,height:16,rgba:rgbaFrames[0]};
    if(command==='media_cancel_export')return;
    throw Error(`Unhandled native command ${command}`);
  };
  const media=load('src/editor/video/native-media.ts',{
    '@tauri-apps/api/core':{invoke},
    './export-verification':load('src/editor/video/export-verification.ts'),
    './export-pipeline':load('src/editor/video/export-pipeline.ts'),
    './export-liveness':load('src/editor/video/export-liveness.ts'),
    './export-fidelity':load('src/editor/video/export-fidelity.ts'),
  });
  return {media,calls,settings,rgbaFrames};
}
test('Rust re-encodes an exact repeated frame without re-rendering, readback or 8MiB IPC',()=>withWebView(async()=>{
  const h=streamHarness(),progress=[];
  let rendered=0;
  const report=await h.media.streamNativeVideo(h.settings,async index=>{
    rendered++;return makeFrame(index===3?'#11ccbb':'#ff3300');
  },(_n,_total,details)=>progress.push(details),undefined,undefined,index=>index===1||index===2);
  assert.equal(rendered,2);
  assert.equal(report.framesWritten,4);
  assert.deepEqual(h.calls.filter(c=>c.command.startsWith('media_')&&c.command.includes('export_frame'))
    .map(c=>c.command),['media_push_export_frame','media_repeat_export_frames','media_repeat_export_frames','media_push_export_frame']);
  assert.deepEqual(h.rgbaFrames[0],h.rgbaFrames[1]);
  assert.deepEqual(h.rgbaFrames[0],h.rgbaFrames[2]);
  assert.notDeepEqual(h.rgbaFrames[2],h.rgbaFrames[3]);
  assert.equal(progress.filter(p=>p?.staticReuse&&p?.sourceBackend==='Rust retained-frame encoder').length,2);
}));

test('Rust backend includes bounded repeated-frame messages, independent audio lookahead, and NV12 format fallback',()=>{
  const stream=read('src-tauri/src/media/stream.rs');
  const native=read('src-tauri/src/media/windows_mf.rs');
  const delivery=read('src-tauri/src/media/delivery.rs');
  const registration=read('src-tauri/src/lib.rs');
  assert.match(stream,/repeat_count==0 \|\| repeat_count>120/);
  assert.match(stream,/ExportPacket::Repeat\{index,count:repeat_count,ack\}/);
  assert.match(native,/ExportPacket::Repeat\{index,count:repeat_count,ack\}/);
  assert.match(native,/audio_lookahead\.as_ref\(\)\.unwrap\(\)\.take\(index\)/);
  assert.match(native,/encoder\.write_pcm\(&audio_lookahead\.as_ref\(\)\.unwrap\(\)\.take\(count\)\?,first\)\?/);
  assert.match(native,/mpsc::sync_channel\(6\)/);
  assert.match(native,/EncoderInput::Nv12/);
  assert.match(native,/EncoderInput::Rgb32/);
  assert.match(native,/MFVideoFormat_NV12/);
  assert.match(delivery,/ExportPacket::Repeat/);
  assert.match(registration,/media::media_repeat_export_frames/);
  assert.match(read('src-tauri/src/media/pixel_convert.rs'),/pub\(super\) fn rgba_to_nv12/);
  assert.match(read('src-tauri/src/media/pixel_convert.rs'),/nv12_parallel_matches_scalar_at_1080p/);
});
