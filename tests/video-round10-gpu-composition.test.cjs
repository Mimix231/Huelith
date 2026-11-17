const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const load=(file,deps)=>{
  const js=ts.transpileModule(read(file),{fileName:file,compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
  }}).outputText;
  const module={exports:{}};
  new Function('module','exports','require',js)(module,module.exports,key=>{
    if(!(key in deps))throw Error(`Missing mock for ${key} in ${file}`);
    return deps[key];
  });
  return module.exports;
};
const asset={id:'footage',kind:'video',name:'Footage',path:'source.mp4',width:1920,height:1080};
const clip={id:'clip',assetId:'footage',trackId:'video',start:0,sourceIn:0,duration:6,
  opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,scaleY:1,rotation:0};
const deps={
  '../effects/catalog':{VIDEO_TIME_VARYING_KINDS:new Set(['video-rolling-shutter']),VIDEO_TEMPORAL_KINDS:new Set(['video-temporal-echo'])},
  '../timeline':{opacityAt:c=>c.opacity},
  '../motion':{transformAt:c=>({x:c.x,y:c.y,rotation:c.rotation,scale:c.scale,scaleY:c.scaleY??c.scale})},
  '../clip-timing':{sourceTimeAt:(c,time)=>c.sourceIn+time,playbackRateAt:()=>1},
  '../preview-render-contract':{visibleVideoOperations:(plan,t)=>plan.timeline.clips.filter(c=>c.start<=t&&c.start+c.duration>t)
    .map(clip=>({clip,trackId:clip.trackId,trackIndex:0}))},
  '../transition-placement':{authoredTransitions:()=>[]},
  '../clip-layout':{clipCrop:(a,c)=>c.crop??a?.crop??{x:0,y:0,width:1,height:1},maskAt:(m)=>m},
};
const gpu=load('src/editor/video/gpu/render-graph.ts',deps);
const plan=(clips=[clip],assets=[asset])=>({version:1,width:1920,height:1080,fps:60,transparent:false,designWidth:1920,
  timeline:{tracks:[{id:'video',kind:'video',muted:false},{id:'titles',kind:'title',muted:false}],clips,assets}});

test('corrected Round 9 hotfix is included: native render pass fields and whole RGBA slice',()=>{
  const source=read('src-tauri/src/media/gpu_scene.rs');
  assert.equal((source.match(/begin_render_pass\(/g)||[]).length,1,'Round 10 batches all visual layers');
  assert.equal((source.match(/depth_stencil_attachment:\s*None/g)||[]).length,1);
  assert.match(source,/assert_eq!\(&pixels\[4\s*\*\s*32\.\.4\s*\*\s*33\],\s*expected\)/);
  assert.doesNotMatch(source,/assert_eq!\(\s*pixels\[4\s*\*\s*32\]/);
  assert.match(source,/for \(_texture, _uniform, bind\) in &draws/);
});

test('GPU graph accepts ordinary crops and hard rectangle/ellipse masks with 80-byte native-compatible uniforms',()=>{
  const edit={...clip,crop:{x:.1,y:.2,width:.4,height:.5},mask:{shape:'ellipse',region:{x:.2,y:.3,width:.6,height:.4},feather:0}};
  const frame=gpu.gpuFrameGraph(plan([edit]),1);
  assert.ok(frame);
  const layout=gpu.gpuLayerGeometry(frame.layers[0],1920,1080,1920,1080);
  assert.deepEqual(layout.sourceRect,[.1,.2,.4,.5]);
  assert.deepEqual(layout.maskRect,[.2,.3,.6,.4]);
  assert.deepEqual(layout.maskFlags.slice(0,2),[2,0]);
  assert.equal(gpu.gpuUniformBytes(layout).byteLength,80);
  assert.equal(gpu.gpuUniformBytes(layout)[8],Math.fround(.1));
  const ellipse={...edit,mask:{...edit.mask,invert:true}};
  assert.deepEqual(gpu.gpuLayerGeometry(gpu.gpuFrameGraph(plan([ellipse]),1).layers[0],1920,1080,1920,1080).maskFlags.slice(0,2),[2,1]);
  const rect={...edit,mask:{...edit.mask,shape:'rectangle'}};
  assert.equal(gpu.gpuLayerGeometry(gpu.gpuFrameGraph(plan([rect]),1).layers[0],1920,1080,1920,1080).maskFlags[0],1);
});

test('unsupported mask shapes, animated feather, graded footage and transitions never silently change appearance',()=>{
  for(const mask of [{shape:'polygon',region:{x:0,y:0,width:1,height:1},feather:0},
    {shape:'ellipse',region:{x:0,y:0,width:1,height:1},feather:.05},
    {shape:'rectangle',region:{x:0,y:0,width:1,height:1},feather:0,rotation:20}]){
    assert.equal(gpu.gpuFrameGraph(plan([{...clip,mask}]),1),null);
  }
  for(const difference of [{grade:{}},{effects:[{enabled:true,kind:'vhs'}]},
    {transitionIn:{kind:'wipe'}},{chromaKey:{}},{blendMode:'multiply'}]){
    assert.equal(gpu.gpuFrameGraph(plan([{...clip,...difference}]),1),null);
  }
});

test('GPU color filters keep strength keys and frame rate, while resampled nonlinear transforms retain reference processing',()=>{
  const effect={id:'look',kind:'video-filter',enabled:true,amount:73,parameters:{lookId:'food-plum-pudding'},
    keyframes:[{time:0,parameter:'amount',value:0},{time:1,parameter:'amount',value:73}]};
  const filtered={...clip,effects:[effect]};
  const contract={...plan([filtered]),fps:24};
  assert.equal(gpu.gpuFrameGraph(contract,.5).fps,24);
  assert.equal(gpu.gpuColorFilter(filtered),effect);
  for(const edit of [{scale:1.2},{rotation:15},{x:1/3840},{effects:[effect,{kind:'glow',enabled:true}]},
    {effects:[{...effect,mask:{shape:'ellipse'}}]}]){
    assert.equal(gpu.gpuFrameGraph(plan([{...filtered,...edit}]),.5),null,JSON.stringify(edit));
  }
  assert.ok(gpu.gpuFrameGraph(plan([{...filtered,x:1/1920}]),.5),'integer pixel translations preserve filtering order');
});

test('text and vector shape layers use the same authored GPU layer order and editable transforms',()=>{
  const text={...clip,id:'title',trackId:'titles',assetId:undefined,title:'Huelith Rocks',
    textStyle:{fontSize:48,color:'#ffffff'},x:.1,scale:1.3};
  const shape={...clip,id:'badge',trackId:'titles',assetId:undefined,
    shape:{kind:'ellipse',width:.2,height:.3,fill:'#663399',stroke:'#ffffff',strokeWidth:.002}};
  const graph=gpu.gpuFrameGraph(plan([clip,shape,text]),2);
  assert.deepEqual(graph.layers.map(c=>c.kind),['media','shape','text']);
  const title=gpu.gpuLayerGeometry(graph.layers[2],1920,1080,1920,1080);
  assert.deepEqual(title.positionScale,[.1,0,1.3,1]);
  assert.equal(title.maskFlags[0],0);
});

test('overlay raster cache redraws only when content or design dimensions change, not on keyframed movement',()=>{
  const calls={shape:0,text:0,surfaces:0};
  const context={translate:()=>{}};
  const overlays=load('src/editor/video/gpu/overlay-raster.ts',{
    '../../canvas-surface':{createSurface:()=>{calls.surfaces++;return {width:0,height:0,getContext:()=>context};}},
    '../graphics':{drawVideoShape:()=>{calls.shape++;}},
    '../text-renderer':{drawVideoText:()=>{calls.text++;}},
    '../process-effects':{processVideoEffects:async surface=>surface},
    '../export-static-scene':{ProcessedLayerCache:class{clear(){}}},
    './overlay-worker-client':{OverlayWorkerClient:class{close(){}}},
    './render-graph':gpu,
  });
  const cache=new overlays.GpuOverlayRasterCache();
  const graph={width:1920,height:1080};
  const title={id:'title',kind:'text',clip:{...clip,title:'Hello',textStyle:{fontSize:54}}};
  const first=cache.get(title,graph,1920);
  const second=cache.get({...title,clip:{...title.clip,x:0.4,rotation:40,opacity:.5}},graph,1920);
  assert.equal(first,second);
  assert.equal(calls.text,1);
  cache.get({...title,clip:{...title.clip,title:'Goodbye'}},graph,1920);
  assert.equal(calls.text,2);
  const shape={id:'shape',kind:'shape',clip:{...clip,shape:{kind:'star',width:.2,height:.3}}};
  cache.get(shape,graph,1920);cache.get(shape,graph,1920);
  assert.equal(calls.shape,1);
  cache.get(shape,graph,1280);assert.equal(calls.shape,2);
  cache.clear();cache.get(shape,graph,1280);assert.equal(calls.shape,3);
});

test('shared GPU shader has crop, pretransform masks, source-over and derivative-safe sampling',()=>{
  const shader=read('src/editor/video/gpu/composite.wgsl');
  assert.match(shader,/source_rect:\s*vec4<f32>/);
  assert.match(shader,/mask_flags:\s*vec4<f32>/);
  assert.match(shader,/in\.local_uv/);
  assert.match(shader,/layer\.source_rect\.xy \+ in\.uv \* layer\.source_rect\.zw/);
  assert.match(shader,/rectangle_distance\(/);
  assert.match(shader,/fwidth\(mask_distance\)/);
  assert.doesNotMatch(shader,/discard;/,'GPU masks should preserve antialiased coverage');
  const rust=read('src-tauri/src/media/gpu_scene.rs');
  for(const field of ['source_rect','mask_rect','mask_flags'])assert.match(rust,new RegExp(field));
  assert.match(rust,/struct LayerUniform/);
});

test('static title warming shares in-flight work, reuses motion changes and invalidates authored edits',async()=>{
  const caches=load('src/editor/video/export-static-scene.ts',{
    './timeline':{},'./effects/catalog':deps['../effects/catalog'],
  });
  let effects=0;let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const overlays=load('src/editor/video/gpu/overlay-raster.ts',{
    '../../canvas-surface':{createSurface:()=>({width:0,height:0,getContext:()=>({translate(){}})})},
    '../graphics':{drawVideoShape(){}},'../text-renderer':{drawVideoText(){}},
    '../process-effects':{processVideoEffects:async source=>{effects++;await gate;return {...source};}},
    '../export-static-scene':caches,'./render-graph':gpu,
    './overlay-worker-client':{OverlayWorkerClient:class{async render(){return null;}close(){}}},
  });
  const cache=new overlays.GpuOverlayRasterCache();
  const title={...clip,id:'title',trackId:'titles',assetId:undefined,start:1,title:'Hello',
    effects:[{kind:'outline',enabled:true,amount:4,parameters:{outlineStyle:'neon'}}]};
  const contract=plan([title]);const graph=gpu.gpuFrameGraph(contract,1.1),layer=graph.layers[0];
  cache.prepareUpcoming(contract,0);
  const first=cache.getProcessed(layer,graph,1920);
  const same=cache.getProcessed({...layer,clip:{...title,x:.4,opacity:.5}},graph,1920);
  await Promise.resolve();release();
  assert.equal(await first,await same);assert.equal(effects,1);
  assert.equal(await cache.getProcessed(layer,graph,1920),await first);
  await cache.getProcessed({...layer,clip:{...title,effects:[{...title.effects[0],amount:8}]}},graph,1920);
  assert.equal(effects,2,'changing an authored effect invalidates the processed title');
  await cache.getProcessed({...layer,clip:{...title,title:'Goodbye'}},graph,1920);
  assert.equal(effects,3,'editing text invalidates the raster and its effect result');
  cache.clear();
});

test('Round 10 modified TypeScript sources parse without syntax errors',()=>{
  for(const name of ['src/editor/video/gpu/render-graph.ts','src/editor/video/gpu/webgpu-scene.ts',
    'src/editor/video/gpu/overlay-raster.ts','src/components/VideoPreviewCanvas.tsx']){
    const output=ts.transpileModule(read(name),{fileName:name,reportDiagnostics:true,compilerOptions:{
      target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,
    }});
    assert.deepEqual((output.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[],name);
  }
});

test('WebGPU only uploads an unchanged title texture once while dynamic footage uploads again',async()=>{
  const stats={copies:[],draws:0,bufferBytes:[]};
  const sourceTexture=()=>({createView:()=>({}),destroy:()=>{}});
  const device={
    createBindGroupLayout:()=>({}),createPipelineLayout:()=>({}),
    pushErrorScope:()=>{},popErrorScope:async()=>null,
    createShaderModule:({code})=>({code}),
    createRenderPipeline:()=>({getBindGroupLayout:()=>({})}),
    createSampler:()=>({}),createTexture:sourceTexture,
    createBuffer:({size})=>{stats.bufferBytes.push(size);return {destroy:()=>{}};},
    createBindGroup:()=>({}),
    createCommandEncoder:()=>({beginRenderPass:()=>({setPipeline:()=>{},setBindGroup:()=>{},
      draw:()=>{stats.draws++;},end:()=>{}}),finish:()=>({})}),
    queue:{writeTexture:()=>{},writeBuffer:()=>{},copyExternalImageToTexture:(...args)=>{stats.copies.push(args);},submit:()=>{}},
    destroy:()=>{},
  };
  const context={configure:()=>{},getCurrentTexture:sourceTexture,unconfigure:()=>{}};
  const globals={navigator:global.navigator,image:global.HTMLImageElement,video:global.HTMLVideoElement};
  global.HTMLImageElement=class{};
  global.HTMLVideoElement=class{};
  Object.defineProperty(global,'navigator',{value:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device}),
    getPreferredCanvasFormat:()=> 'bgra8unorm'}},configurable:true});
  try{
    const web=load('src/editor/video/gpu/webgpu-scene.ts',{
      './composite.wgsl?raw':{default:read('src/editor/video/gpu/composite.wgsl')},
      './color-filter.wgsl?raw':{default:read('src/editor/video/gpu/color-filter.wgsl')},
      '../filters/render':{filterLut:()=>{throw Error('No color filter is active');}},
      '../effects/types':{evaluateVideoEffect:effect=>effect},
      './render-graph':gpu,'./overlay-raster':{GpuOverlayRasterCache:class{}},
    });
    const canvas={width:1920,height:1080,getContext:()=>context};
    const stale=web.WebGpuVideoScene.create(canvas);
    const latest=web.WebGpuVideoScene.create(canvas);
    assert.equal(await stale,null,'a superseded StrictMode initialization cannot own the surface');
    const renderer=await latest;
    const graph=gpu.gpuFrameGraph(plan([{...clip,id:'text',assetId:undefined,trackId:'titles',title:'Overlay'}]),1);
    const raster={width:1920,height:1080};
    const first={...graph.layers[0],image:raster,
      geometry:gpu.gpuLayerGeometry(graph.layers[0],1920,1080,1920,1080),stableTexture:true};
    renderer.render({graph,layers:[first]});renderer.render({graph,layers:[first]});
    assert.equal(stats.copies.length,1,'cached title must not reupload pixels every frame');
    assert.equal(stats.draws,2,'title is still composited at each timeline tick');
    assert.deepEqual(stats.bufferBytes,[96],'geometry plus color material share a retained uniform');
    renderer.render({graph,layers:[{...first,stableTexture:false}]});
    assert.equal(stats.copies.length,2,'dynamic canvas must upload its changed pixels');
    renderer.render({graph,layers:[{...first,image:{width:1920,height:1080},stableTexture:true}]});
    assert.equal(stats.copies.length,3,'changed text surface must replace its cached GPU texture');
    renderer.close();
  }finally{
    Object.defineProperty(global,'navigator',{value:globals.navigator,configurable:true});
    global.HTMLImageElement=globals.image;
    global.HTMLVideoElement=globals.video;
  }
});
