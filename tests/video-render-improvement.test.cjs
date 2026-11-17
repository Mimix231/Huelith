const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const root=path.resolve(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
const {overlapRenderAndEncode}=loadTypeScript(path.join(root,'src/editor/video/export-pipeline.ts'));
const {createExportProgressTracker}=loadTypeScript(path.join(root,'src/editor/video/export-progress.ts'));
const tick=()=>new Promise(ok=>setImmediate(ok));

test('the bounded queue renders frames serially and acknowledges them strictly in order',async()=>{
  let rendering=0,peakRendering=0;const rendered=[],encoded=[],accepted=[];
  await overlapRenderAndEncode(12,
    async i=>{
      rendering++;peakRendering=Math.max(peakRendering,rendering);
      await tick();rendered.push(i);rendering--;return {buffer:new Uint8Array([i])};
    },frame=>({buffer:new Uint8Array(frame.buffer)}),
    async (packet,i)=>{assert.equal(packet.buffer[0],i);await tick();encoded.push(i);},
    i=>accepted.push(i),3);
  const expected=Array.from({length:12},(_,i)=>i);
  assert.equal(peakRendering,1,'Compositor state must never be accessed by concurrent render calls');
  assert.deepEqual(rendered,expected);
  assert.deepEqual(encoded,expected);
  assert.deepEqual(accepted,expected);
});

test('the producer really overlaps frame preparation with an encoder stall',async()=>{
  let unblockEncoder;
  const encoderWait=new Promise(ok=>unblockEncoder=ok);
  let firstEncoderStarted;
  const started=new Promise(ok=>firstEncoderStarted=ok);
  const produced=[];const acknowledged=[];
  const task=overlapRenderAndEncode(8,
    async i=>{produced.push(i);await tick();return i;},
    value=>value,
    async (_value,index)=>{if(index===0){firstEncoderStarted();await encoderWait;}},
    index=>acknowledged.push(index),3);
  await started;
  for(let i=0;i<8&&produced.length<3;i++)await tick();
  assert.ok(produced.length>=2,'Prepares the next frame while first native sample is waiting');
  assert.ok(produced.length<=4,'Lookahead is bounded and does not prepare all eight frames');
  assert.deepEqual(acknowledged,[],'Unacknowledged frames never count as exported');
  unblockEncoder();await task;
  assert.deepEqual(acknowledged,Array.from({length:8},(_,i)=>i));
});

test('failure stops the renderer and settles all queued work before returning',async()=>{
  let active=0;const committed=[];
  await assert.rejects(overlapRenderAndEncode(40,
    async i=>{active++;await tick();active--;return i;},i=>i,
    async (_frame,i)=>{if(i===2)throw Error('Media Foundation rejected frame');},
    i=>committed.push(i),4),/Media Foundation rejected frame/);
  assert.equal(active,0);
  assert.deepEqual(committed,[0,1]);
});

test('only 1..6 queued slots and safe frame count are accepted',async()=>{
  const render=async i=>i,prepare=i=>i,encode=async()=>{},completed=()=>{};
  for(const depth of [0,7,2.3])await assert.rejects(overlapRenderAndEncode(2,render,prepare,encode,completed,depth),/lookahead/);
  await assert.rejects(overlapRenderAndEncode(-1,render,prepare,encode,completed),/frame count/);
  await overlapRenderAndEncode(0,render,prepare,encode,completed,3);
});

test('native timing breakdown includes real IPC, conversion, and Media Foundation submission',()=>{
  let now=0;const rows=[];
  const update=createExportProgressTracker(x=>rows.push(x),{now:()=>now,intervalMs:80});
  update(0,20,{phase:'initializing'});
  const native={copyMs:4,queueMs:1,bufferMs:2,convertMs:3,submitMs:100,audioMs:1,nativeTotalMs:112};
  for(let i=1;i<=20;i++){
    now+=150;
    update(i,20,{phase:'rendering',renderMs:20,readbackMs:3,envelopeMs:2,
      encodeMs:130,sourceMs:11,compositeMs:9,native,sourceBackend:'WebView decoder'});
  }
  now+=100;update(20,20,{phase:'verified'});
  const detail=rows.at(-1).message;
  for(const token of ['native buffer 2.0','convert 3.0','MF submit 100.0','IPC copy 4.0','queue 1.0',
    'readback 3.0','envelope 2.0','encode round-trip 130.0']){
    assert.ok(detail.includes(token),token+' absent from '+detail);
  }
  assert.equal(rows.at(-1).fraction,1);
});

test('native telemetry is never invented if an older desktop backend returns no timings',()=>{
  let now=0;const rows=[];
  const update=createExportProgressTracker(x=>rows.push(x),{now:()=>now,intervalMs:80});
  update(0,1,{phase:'initializing'});now+=500;
  update(1,1,{phase:'rendering',renderMs:100,encodeMs:20});now+=100;
  update(1,1,{phase:'verified'});
  assert.ok(!rows.at(-1).message.includes('native buffer'));
});

test('native MF pixel conversion preserves straight alpha and has runtime-gated opaque SIMD path',()=>{
  const rust=source('src-tauri/src/media/pixel_convert.rs');
  const encoder=source('src-tauri/src/media/windows_mf.rs');
  assert.match(rust,/rgba_to_bgrx_ssse3/);
  assert.match(rust,/is_x86_feature_detected!\("ssse3"\)/);
  assert.match(rust,/u16::from\(src\[2\]\) \* a \+ 127/);
  assert.match(encoder,/EncoderInput::Rgb32=>super::pixel_convert::rgba_to_bgrx\(rgba,output\)/);
  assert.match(encoder,/EncoderInput::Nv12=>super::pixel_convert::rgba_to_nv12\(rgba,output,self.width,self.height\)/);
  assert.match(encoder,/MFCreateMemoryBuffer/);
  assert.match(encoder,/WriteSample\(self.stream, &sample\)/);
});

test('the native worker reports exact stages without claiming GPU encoding succeeded',()=>{
  const rust=source('src-tauri/src/media/stream.rs');
  assert.match(rust,/pub struct NativeFrameStages/);
  assert.match(rust,/pub native_total_ms:f64/);
  assert.match(rust,/reply.recv_timeout\(Duration::from_secs\(120\)\)/);
  const native=source('src/editor/video/native-media.ts');
  assert.match(native,/invoke<NativeFrameStages\|undefined>\('media_push_export_frame'/);
  assert.match(native,/getImageData\(0,0,settings.width,settings.height\)/);
  assert.match(native,/readbackMs/);
});

test('source decoder uses optimized conversion without changing RGB32 stride/orientation handling',()=>{
  const rust=source('src-tauri/src/media/windows_mf.rs');
  const converter=source('src-tauri/src/media/pixel_convert.rs');
  assert.match(rust,/row_zero\.offset\(y as isize\*pitch as isize\)/);
  assert.match(rust,/if default_stride<0\{height as usize-1-y\}else\{y\}/);
  assert.match(rust,/pixel_convert::bgrx_to_rgba/);
  assert.match(converter,/output\[3\] = 255/);
  assert.match(converter,/decode_bgrx_to_rgba_matches_original_scalar/);
});

test('throughput reported as acknowledged raw frame data, never confused with encoded bitrate',()=>{
  let now=0;const events=[];
  const tracker=createExportProgressTracker(value=>events.push(value),{now:()=>now,intervalMs:80,frameBytes:1920*1080*4});
  tracker(0,100,{phase:'initializing'});
  now=1000;tracker(30,100,{phase:'rendering',renderMs:10,encodeMs:20});
  assert.match(events.at(-1).message,/30\.0 fps/);
  assert.match(events.at(-1).message,/raw 248\.8 MB\/s/);
  now=2000;tracker(60,100,{phase:'rendering',renderMs:10,encodeMs:20});
  assert.match(events.at(-1).message,/raw 248\.8 MB\/s/);
  now=2500;tracker(60,100,{phase:'verified'});
  assert.match(events.at(-1).message,/actual RGBA IPC /);
});
