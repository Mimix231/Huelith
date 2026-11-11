const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const {animationFrameAt}=loadTypeScript(require('node:path').join(__dirname,'../src/editor/animation-video-timing.ts'));
function bridge(invoke){
  const module={exports:{}};const source=fs.readFileSync(require('node:path').join(__dirname,'../src/editor/video/native-media.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:module.exports,module,window:{__TAURI_INTERNALS__:{}},require:()=>({invoke}),Uint8Array,Uint8ClampedArray,DataView,BigInt,Number,DOMException});return module.exports;
}
test('binary frames preserve 64-bit session IDs, index and every RGBA byte',()=>{
  const api=bridge(()=>{}),pixels=new Uint8ClampedArray([3,4,5,17,20,19,12,255]);
  const bytes=api.encodeVideoFrameEnvelope(2**32+7,128,pixels),view=new DataView(bytes.buffer);
  assert.equal(view.getBigUint64(4,true),BigInt(2**32+7));assert.equal(view.getUint32(12,true),128);
  assert.deepEqual(bytes.slice(16),new Uint8Array(pixels));assert.throws(()=>api.encodeVideoFrameEnvelope(-1,0,pixels));
});
test('native export awaits each encoded frame and finalizes only a complete stream',async()=>{
  let active=0,maximum=0;const order=[];
  const api=bridge(async(command,args)=>{
    order.push(command);if(command==='media_begin_export')return 5;
    if(command==='media_push_export_frame'){active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,2));active--;return;}
    if(command==='media_finish_export'){assert.equal(active,0);return {framesWritten:4};}
    throw Error(`Unexpected ${command}`);
  });
  const canvas={width:16,height:16,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16*16*4)})})};
  const report=await api.streamNativeVideo({outputPath:'out.mp4',width:16,height:16,fps:30,frameCount:4},async()=>canvas,()=>{});
  assert.equal(maximum,1);assert.equal(report.framesWritten,4);assert.deepEqual(order,['media_begin_export',...Array(4).fill('media_push_export_frame'),'media_finish_export']);
});
test('cancellation disposes the native session and never finalizes partial video',async()=>{
  const calls=[],controller=new AbortController();
  const api=bridge(async command=>{calls.push(command);return command==='media_begin_export'?3:undefined;});
  const canvas={width:16,height:16,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(1024)})})};
  await assert.rejects(api.streamNativeVideo({outputPath:'out.mp4',width:16,height:16,fps:30,frameCount:8},async()=>canvas,n=>{if(n===1)controller.abort();},controller.signal));
  assert.ok(calls.includes('media_cancel_export'));assert.equal(calls.includes('media_finish_export'),false);assert.equal(calls.filter(c=>c==='media_push_export_frame').length,1);
});
test('MP4 sampling preserves variable cel durations and final exposure holds',()=>{
  const holds=[100,350,50];assert.deepEqual([0,99,100,449,450,499,500].map(t=>animationFrameAt(holds,t)),[0,0,1,1,2,2,2]);
  assert.throws(()=>animationFrameAt([],0));assert.throws(()=>animationFrameAt([0],0));
});
