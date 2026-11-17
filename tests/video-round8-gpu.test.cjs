const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function load(file,deps){
  const js=ts.transpileModule(read(file),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const m={exports:{}};
  new Function('module','exports','require',js)(m,m.exports,key=>{
    if(!(key in deps))throw Error(`Unexpected ${key} in ${file}`);
    return deps[key];
  });
  return m.exports;
}
const project={id:'footage',kind:'video',name:'Video',path:'source.mp4',width:1920,height:1080};
const top={id:'top',trackId:'upper',assetId:'footage',title:'Ordinary filename label',start:0,sourceIn:2,duration:8,
  x:0,y:0,scale:1,scaleY:1,rotation:0,opacity:.75,fadeIn:0,fadeOut:0};
const bottom={...top,id:'bottom',trackId:'lower',opacity:1};
let transitions=[];
const authoring={
  '../effects/catalog':{VIDEO_TIME_VARYING_KINDS:new Set(),VIDEO_TEMPORAL_KINDS:new Set()},
  '../timeline':{opacityAt:(clip,t)=>clip.opacity*Math.min(1,clip.fadeIn?t/clip.fadeIn:1),},
  '../motion':{transformAt:(clip)=>({x:clip.x,y:clip.y,scale:clip.scale,scaleY:clip.scaleY??clip.scale,
    rotation:clip.rotation,opacity:clip.opacity})},
  '../clip-timing':{sourceTimeAt:(clip,t)=>clip.sourceIn+t,playbackRateAt:()=>1},
  '../preview-render-contract':{visibleVideoOperations:(plan,time)=>plan.timeline.clips.filter(c=>time>=c.start&&time<c.start+c.duration)
    .map(clip=>({clip,trackIndex:plan.timeline.tracks.findIndex(track=>track.id===clip.trackId)}))
    .sort((a,b)=>b.trackIndex-a.trackIndex)},
  '../transition-placement':{authoredTransitions:()=>transitions},
  '../clip-layout':{clipCrop:()=>({x:0,y:0,width:1,height:1}),maskAt:mask=>mask},
};
const gpu=load('src/editor/video/gpu/render-graph.ts',authoring);
function graph(clips=[top,bottom],assets=[project]){
  return gpu.gpuFrameGraph({version:1,width:1920,height:1080,fps:60,transparent:false,
    timeline:{background:'#103080',assets,clips,tracks:[{id:'upper',kind:'video',muted:false},
      {id:'lower',kind:'video',muted:false}]}},1);
}
test('GPU graph keeps the authored bottom-to-top layer order, source clock and filename labels',()=>{
  const frame=graph();
  assert.equal(frame.version,1);
  assert.deepEqual(frame.layers.map(c=>c.id),['bottom','top']);
  assert.deepEqual(frame.layers.map(c=>c.sourceTime),[3,3]);
  assert.equal(frame.layers[1].opacity,.75);
  assert.deepEqual(frame.background,[16/255,48/255,128/255,1]);
});
test('GPU graph rejects effects, masks, adjustment and authored transitions rather than dropping them',()=>{
  for(const changes of [{effects:[{kind:'brightness',enabled:true}]},{mask:{}},{grade:{}},
    {blendMode:'screen'},{smart:{}},{compound:{}},{adjustment:true},{caption:{}},
    {transitionOut:{kind:'effect'}}]){
    assert.equal(graph([{...top,...changes}]),null,JSON.stringify(changes));
  }
  assert.ok(graph([{...top,effects:[{kind:'brightness',enabled:false}]}]));
  assert.ok(graph([{...top,crop:{x:.1,y:.1,width:.8,height:.8}}]));
  transitions=[{start:0,end:2}];assert.equal(graph([top]),null);transitions=[];
});
test('geometry is resolution-independent and respects source fit, flips, keyframes and rotation',()=>{
  const item={...graph([top]).layers[0],clip:{...top,x:.1,y:-.2,scale:1.5,scaleY:.5,rotation:90,flipX:true}};
  const size=gpu.gpuLayerGeometry(item,1920,1080,1920,1080);
  assert.deepEqual(size.positionScale,[.1,-.2,-1.5,.5]);
  assert.ok(Math.abs(size.rotationOpacity[0])<1e-6);
  assert.ok(Math.abs(size.rotationOpacity[1]+1)<1e-6);
  assert.deepEqual(size.rotationOpacity.slice(2),[.75,1920/1080]);
  const tall=gpu.gpuLayerGeometry(item,1920,1080,1080,1920);
  assert.ok(tall.positionScale[2]!==size.positionScale[2]);
  assert.equal(gpu.gpuUniformBytes(size).byteLength,80);
});
test('graph transparency is distinct from black and empty GPU scenes still have a background',()=>{
  assert.deepEqual(gpu.hexBackground('#000000',false),[0,0,0,1]);
  assert.deepEqual(gpu.hexBackground('#ffffff',true),[0,0,0,0]);
  assert.deepEqual(graph([],[]).layers,[]);
});
test('native GPU bridge uses identical geometry and rejects incomplete frame data',()=>{
  const bridge=load('src/editor/video/gpu/native-gpu-scene.ts',{
    '@tauri-apps/api/core':{invoke:async()=>Array(1920*1080*4).fill(0)},
    './render-graph':gpu,
  });
  const input=graph([{...top,opacity:1}]);
  const frames=new Map([['top',{width:2,height:2,rgba:new Uint8Array(16).fill(123)}]]);
  const native=bridge.buildNativeGpuScene(input,frames);
  assert.equal(native.version,1);assert.deepEqual(native.layers[0].geometry,
    gpu.gpuLayerGeometry(input.layers[0],1920,1080,2,2));
  assert.throws(()=>bridge.buildNativeGpuScene(input,new Map()),/missing complete RGBA/);
});
test('WebGPU renderer uses shared shader, alpha blending, direct external source textures and retained GPU buffers',async()=>{
  const calls={module:[],pass:[],copy:0,textures:0,destroy:0,draw:0,bind:0};
  const fakeTexture=()=>({createView:()=>({}),destroy:()=>{calls.destroy++}});
  const device={
    createBindGroupLayout:()=>({}),createPipelineLayout:()=>({}),
    pushErrorScope:()=>{},popErrorScope:async()=>null,
    createShaderModule:args=>{calls.module.push(args);return {};},
    createRenderPipeline:args=>{calls.pass.push(args);return {getBindGroupLayout:()=>({})};},
    createSampler:()=>({}),
    createTexture:()=>{calls.textures++;return fakeTexture();},
    createBuffer:()=>({destroy:()=>{calls.destroy++}}),
    createBindGroup:()=>({}),
    createCommandEncoder:()=>({beginRenderPass:()=>({setPipeline:()=>{},setBindGroup:()=>{calls.bind++},draw:()=>{calls.draw++},end:()=>{}}),finish:()=>({})}),
    queue:{writeTexture:()=>{},copyExternalImageToTexture:()=>{calls.copy++},writeBuffer:()=>{},submit:()=>{}},
    destroy:()=>{},
  };
  const context={configure:()=>{},getCurrentTexture:fakeTexture,unconfigure:()=>{}};
  const canvas={width:1920,height:1080,getContext:()=>context};
  const existing=global.navigator;
  global.HTMLVideoElement=class{};global.HTMLImageElement=class{};
  Object.defineProperty(global,'navigator',{value:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device}),
    getPreferredCanvasFormat:()=> 'bgra8unorm'}},configurable:true});
  try{
    const web=load('src/editor/video/gpu/webgpu-scene.ts',{
      './composite.wgsl?raw':{default:read('src/editor/video/gpu/composite.wgsl')},
      './color-filter.wgsl?raw':{default:read('src/editor/video/gpu/color-filter.wgsl')},
      '../filters/render':{filterLut:()=>{throw Error('No color filter is active');}},
      '../effects/types':{evaluateVideoEffect:effect=>effect},
      './render-graph':gpu,
      './overlay-raster':{GpuOverlayRasterCache:class{}},
    });
    const renderer=await web.WebGpuVideoScene.create(canvas);
    assert.ok(renderer);
    const prepared={graph:graph([top,bottom]),layers:graph([top,bottom]).layers.map(item=>({...item,
      image:{width:1920,height:1080},geometry:gpu.gpuLayerGeometry(item,1920,1080,1920,1080)}))};
    renderer.render(prepared);renderer.render(prepared);
    assert.equal(calls.copy,4);
    assert.equal(calls.draw,4);
    assert.equal(calls.textures,3,'two source textures and one neutral color cube reused across frames');
    assert.equal(calls.pass[0].fragment.targets[0].blend.color.srcFactor,'one');
    assert.equal(calls.pass[0].fragment.targets[0].blend.color.dstFactor,'one-minus-src-alpha');
    assert.ok(calls.module[0].code.includes('@vertex'));
    renderer.close();assert.ok(calls.destroy>=4);
  }finally{Object.defineProperty(global,'navigator',{value:existing,configurable:true});}
});
test('Rust native GPU is registered and reads exactly the same WGSL file',()=>{
  const source=read('src-tauri/src/media/gpu_scene.rs');
  assert.match(source,/include_str!\("\.\.\/\.\.\/\.\.\/src\/editor\/video\/gpu\/composite\.wgsl"\)/);
  assert.match(source,/validate_scene\(&scene\)/);
  assert.match(source,/wgpu::TextureFormat::Rgba8Unorm/);
  assert.match(read('src-tauri/src/lib.rs'),/media::gpu_scene::media_render_gpu_scene/);
});
test('Round 8 TypeScript/TSX parses and exposes GPU presentation without IPC readback',()=>{
  for(const file of ['src/editor/video/gpu/render-graph.ts','src/editor/video/gpu/webgpu-scene.ts',
    'src/editor/video/gpu/native-gpu-scene.ts','src/components/VideoPreviewCanvas.tsx',
    'src/editor/video/preview-media-sources.ts']){
    const result=ts.transpileModule(read(file),{fileName:file,reportDiagnostics:true,compilerOptions:{
      target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,
    }});
    assert.equal(result.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file);
  }
  const ui=read('src/components/VideoPreviewCanvas.tsx');
  assert.match(ui,/gpuFrameGraph\(plan,request.seconds\)/);
  assert.match(ui,/prepareGpuScene\(/);
  assert.match(ui,/gpuScene\.current!\.render\(frame\)/);
  assert.match(ui,/className="hv-preview-canvas hv-preview-gpu"/);
  assert.doesNotMatch(ui,/invoke\(['"]media_render_gpu_scene/);
});
