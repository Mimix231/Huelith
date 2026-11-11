const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(base,file), 'utf8');

test('video projects persist as .huelith and existing image/animation projects remain supported', () => {
  const app = read('src/App.tsx');
  const files = read('src/editor/files.ts');
  assert.match(app,/saveBytes\(bytes,\s*`\$\{updated\.name[\s\S]+?\.huelith`/);
  assert.match(app,/extensions: \['huelith'\]/);
  assert.match(files,/extensions: \['huelith', 'spectrum'/);
  assert.match(files,/isVideoProject\(value\)/);
  assert.match(files,/migrateLegacyEffects\(value\)/);
});

test('native backend commands are connected to the Tauri invocation handler', () => {
  const lib=read('src-tauri/src/lib.rs');
  for (const name of ['media_capabilities','media_probe_file','media_decode_preview',
    'media_export_test_pattern','media_transcode_file','media_encode_rgba_frames']) {
    assert.match(lib,new RegExp('media::'+name));
  }
});

test('non-Windows native operations fail explicitly and no FFmpeg fallback is installed', () => {
  const cargo=read('src-tauri/Cargo.toml');
  const module=read('src-tauri/src/media/mod.rs');
  const win=read('src-tauri/src/media/windows_mf.rs');
  assert.match(cargo,/cfg\(windows\)/); assert.match(cargo,/windows =/);
  assert.doesNotMatch(cargo,/^(?!\s*#).*?(?:ffmpeg-next|ffmpeg-sys|ffmpeg =)/im);
  assert.match(module,/cfg\(not\(windows\)\)/);
  assert.match(win,/MFCreateSourceReaderFromURL/);
  assert.match(win,/MFCreateSinkWriterFromURL/);
  assert.match(win,/MFCreateSample/);
  assert.match(win,/MF_SOURCE_READER_FIRST_VIDEO_STREAM\.0 as u32/);
  assert.match(win,/CoInitializeEx\(None, COINIT_MULTITHREADED\)\.ok\(\)/);
  assert.match(win,/\.Finalize\(\)/);
  assert.doesNotMatch(win,/Command::new|std::process::Command/);
});

test('export validates dimensions, media file length and never overwrites a target', () => {
  const source=read('src-tauri/src/media/mod.rs');
  assert.match(source,/width % 2 != 0 \|\| height % 2 != 0/);
  assert.match(source,/actual != expected/);
  assert.match(source,/if absolute\.exists\(\)/);
  const native=read('src-tauri/src/media/windows_mf.rs');
  assert.match(native,/\.huelith-media-\{nonce\}\.mp4/);
  assert.match(native,/publish_mp4\(&temporary,destination\)/);
  assert.match(native,/MoveFileExW\(PCWSTR\(from.as_ptr\(\)\),PCWSTR\(to.as_ptr\(\)\),MOVEFILE_WRITE_THROUGH\)/);
  assert.match(native,/if process\.is_err\(\)/);
  assert.match(native,/read_exact\(rgba\)/);
});

function bridgeMock() {
  const calls=[];
  const code=ts.transpileModule(read('src/editor/video/native-media.ts'), {
    fileName:'native-media.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  });
  assert.equal(code.diagnostics?.length??0,0);
  const module={exports:{}};
  vm.runInNewContext(code.outputText,{
    exports:module.exports,window:{__TAURI_INTERNALS__:{}},
    ImageData:class ImageData { constructor(bytes,w,h){ this.data=bytes;this.width=w;this.height=h; }},
    Uint8ClampedArray,
    require:(name)=>{assert.equal(name,'@tauri-apps/api/core');return {invoke:(command,args)=>{calls.push({command,args});return Promise.resolve({});}};},
  },{filename:'native-media.js'});
  return {api:module.exports,calls};
}

test('frontend bridge invokes correct native commands and passes encoding arguments unchanged',async()=>{
  const {api,calls}=bridgeMock();
  await api.probeNativeMedia('C:\\movie.mp4');
  await api.decodeNativePreview('C:\\movie.mp4');
  await api.exportNativeTestPattern('out.mp4',640,360,30,3);
  await api.transcodeNativeVideo('in.mp4','out.mp4');
  await api.encodeNativeRgbaSequence('frames.rgba','out.mp4',640,360,30,90);
  assert.deepEqual(Array.from(calls,x=>x.command),['media_probe_file','media_decode_preview',
    'media_export_test_pattern','media_transcode_file','media_encode_rgba_frames']);
  assert.equal(calls[2].args.seconds,3);
  assert.equal(calls[4].args.frameCount,90);
});

test('frontend preview refuses malformed native video buffers',()=>{
  const {api}=bridgeMock();
  assert.throws(()=>api.previewToImageData({width:640,height:360,rgba:[]}),/invalid dimensions/);
  const good=api.previewToImageData({width:2,height:2,rgba:Array(16).fill(240)});
  assert.equal(good.data.length,16);
});

test('Stage C replaces Stage B diagnostic controls with an actual timeline and native audio export',()=>{
  const app=read('src/components/VideoWorkspace.tsx');
  assert.match(app,/enqueueDelivery/); assert.match(read('src/editor/video/delivery.ts'),/await exportEditedVideo/);
  assert.match(app,/mixes audible tracks/);
  assert.match(app,/placeLibraryMedia/); assert.match(app,/splitClip/);
  assert.match(read('src/App.tsx'),/saveVideoProject/); assert.match(app,/nativeMediaCapabilities/);
  assert.doesNotMatch(app,/exportNativeTestPattern/);
});
