const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Round 9 fixes every malformed float literal shown in the Rust compiler screenshot',()=>{
  const mf=read('src-tauri/src/media/windows_mf.rs');
  assert.match(mf,/rms\(0\.6\)<0\.02/);
  assert.match(mf,/rms\(1\.2\)>0\.08/);
  assert.doesNotMatch(mf,/rms\(\.6\)|[<>]\s*\.0[28]/);
});
test('native titles consume width and background as authored data instead of dead fields',()=>{
  const code=read('src-tauri/src/media/native_timeline.rs');
  assert.match(code,/style\.and_then\(\|s\|s\.width\)/);
  assert.match(code,/style\.and_then\(\|s\|s\.background\.as_deref\(\)\)/);
  assert.match(code,/widest>maximum_width/);
  assert.match(code,/output\[pixel\.\.pixel\+3\]\.copy_from_slice\(&fill\)/);
});
test('GPU Media Foundation source setup uses a D3D11 device manager and NV12',()=>{
  const code=read('src-tauri/src/media/gpu_decode.rs');
  for(const needle of ['D3D11CreateDevice','D3D11_CREATE_DEVICE_VIDEO_SUPPORT','MFCreateDXGIDeviceManager',
    'MF_SOURCE_READER_D3D_MANAGER','MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS','MFVideoFormat_NV12',
    'GetBufferByIndex(0)','IMFDXGIBuffer','GetResource(&ID3D11Texture2D::IID','GetSubresourceIndex'])
    assert.ok(code.includes(needle),`missing native GPU API ${needle}`);
  for(const forbidden of ['copy_rgb_sample(','.Lock(','.Lock2D(','.ConvertToContiguousBuffer('])
    assert.ok(!code.includes(forbidden),`decoder must not silently read back CPU pixel data: ${forbidden}`);
});
test('GPU source worker retains COM samples, bounded frame cache and per-clip timestamps',()=>{
  const code=read('src-tauri/src/media/gpu_decode.rs');
  assert.match(code,/MAX_CACHE_FRAMES:usize = 6/);
  assert.match(code,/VecDeque<GpuSurface>/);
  assert.match(code,/struct GpuSurface \{/);
  assert.match(code,/_sample:IMFSample/);
  assert.match(code,/HashMap<String,GpuReader>/);
  assert.match(code,/should_seek\(self.last_timestamp,target,self.frame_duration\)/);
  assert.match(code,/GpuFrameRequest\{source_id:/);
});
test('Tauri GPU surface commands are independent of the CPU timeline renderer',()=>{
  const med=read('src-tauri/src/media/mod.rs');
  const lib=read('src-tauri/src/lib.rs');
  for(const name of ['media_gpu_open_sources','media_gpu_acquire_frames','media_gpu_close_sources']){
    assert.match(med,new RegExp('fn '+name+'\\('));
    assert.ok(lib.includes('media::'+name));
  }
  assert.match(read('src-tauri/Cargo.toml'),/Win32_Graphics_Direct3D11/);
  assert.match(read('src-tauri/Cargo.toml'),/Win32_Graphics_Dxgi_Common/);
});
test('GPU source authoring contract does not invent an IPC pixel transfer',()=>{
  const code=read('src/editor/video/gpu/native-hardware-decode.ts');
  const ts=require('typescript');
  const result=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
  assert.equal(result.diagnostics?.length||0,0);
  for(const name of ['nativeGpuVideoSources','nativeGpuFrameRequests','openNativeGpuVideoSources',
    'acquireNativeGpuVideoFrames','closeNativeGpuVideoSources'])assert.ok(code.includes(name));
  assert.doesNotMatch(code,/rgba\s*:/i);
  assert.doesNotMatch(code,/Uint8Array|putImageData|toDataURL/);
});
test('Windows verification script can actually test hardware DXGI surfaces',()=>{
  const ps=read('scripts/verify-round9-windows.ps1');
  assert.match(ps,/cargo check --manifest-path src-tauri\/Cargo.toml --all-targets/);
  assert.match(ps,/HUELITH_GPU_TEST_VIDEO/);
  assert.match(ps,/hardware_decoder_produces_dxgi_surfaces_without_pixel_readback/);
});

test('WebGPU video imports decoded frames directly and does not copy RGBA textures',async()=>{
  const ts=require('typescript');
  const code=ts.transpileModule(read('src/editor/video/gpu/webgpu-scene.ts'),{
    fileName:'webgpu-scene.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
  const calls={imported:0,copy:0,draw:0,pipelines:[],textures:0};
  const device={
    createBindGroupLayout:()=>({}),createPipelineLayout:()=>({}),
    pushErrorScope:()=>{},popErrorScope:async()=>null,
    createShaderModule:args=>({source:args.code}),
    createRenderPipeline:args=>{calls.pipelines.push(args);return {getBindGroupLayout:()=>({})}},
    createSampler:()=>({}),
    createTexture:()=>{calls.textures++;return {createView:()=>({}),destroy:()=>{}}},
    createBuffer:()=>({destroy:()=>{}}),createBindGroup:()=>({}),
    importExternalTexture:()=>{calls.imported++;return {}},
    createCommandEncoder:()=>({beginRenderPass:()=>({setPipeline:()=>{},setBindGroup:()=>{},draw:()=>{calls.draw++},end:()=>{}}),finish:()=>({})}),
    queue:{writeTexture:()=>{},copyExternalImageToTexture:()=>{calls.copy++},writeBuffer:()=>{},submit:()=>{}},destroy:()=>{},
  };
  const context={configure:()=>{},getCurrentTexture:()=>({createView:()=>({})}),unconfigure:()=>{}};
  class Video{constructor(){this.videoWidth=1920;this.videoHeight=1080}}
  const old={video:global.HTMLVideoElement,image:global.HTMLImageElement,navigator:global.navigator};
  global.HTMLVideoElement=Video;global.HTMLImageElement=class{};
  Object.defineProperty(global,'navigator',{value:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device}),
    getPreferredCanvasFormat:()=> 'bgra8unorm'}},configurable:true});
  try{
    const module={exports:{}};
    new Function('module','exports','require',code)(module,module.exports,key=>{
      if(key==='./composite.wgsl?raw')return {default:read('src/editor/video/gpu/composite.wgsl')};
      if(key==='./color-filter.wgsl?raw')return {default:read('src/editor/video/gpu/color-filter.wgsl')};
      if(key==='./render-graph')return {gpuUniformBytes:()=>new Float32Array(20),gpuColorFilter:()=>undefined};
      if(key==='../filters/render')return {filterLut:()=>{throw Error('No color filter is active');}};
      if(key==='../effects/types')return {evaluateVideoEffect:effect=>effect};
      if(key==='./overlay-raster')return {GpuOverlayRasterCache:class{}};
      throw Error(`Unexpected dependency ${key}`);
    });
    const render=await module.exports.WebGpuVideoScene.create({width:1920,height:1080,getContext:()=>context});
    assert.ok(render);
    assert.equal(calls.pipelines.length,2,'video shader must be a distinct texture_external pipeline');
    assert.match(calls.pipelines[1].vertex.module.source,/texture_external/);
    assert.match(calls.pipelines[1].fragment.module.source,/textureSampleBaseClampToEdge/);
    const layer={id:'video-1',identity:'video-1',image:new Video(),geometry:{},};
    const graph={width:1920,height:1080,background:[0,0,0,1]};
    render.render({graph,layers:[layer]});render.render({graph,layers:[layer]});
    assert.equal(calls.imported,2,'HTMLVideoElement GPUExternalTexture expires after each use');
    assert.equal(calls.copy,0,'video frame must not be copied to a CPU-style RGBA texture');
    assert.equal(calls.textures,1,'only a neutral color cube is allocated, with no copied video surface');
    assert.equal(calls.draw,2);
    render.close();
  }finally{
    global.HTMLVideoElement=old.video;global.HTMLImageElement=old.image;
    Object.defineProperty(global,'navigator',{value:old.navigator,configurable:true});
  }
});
