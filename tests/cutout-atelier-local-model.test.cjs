const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ts=require('typescript');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function mockVitePlugin(project){
  const source=read('vite.config.ts');
  const js=ts.transpileModule(source,{fileName:'vite.config.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  new Function('module','exports','require','process',js)(mod,mod.exports,id=>{
    if(id==='vite')return {defineConfig:config=>config};
    if(id==='@vitejs/plugin-react')return ()=>({name:'react-mock'});
    return require(id);
  },{cwd:()=>project});
  return mod.exports.default.plugins.find(p=>p.name==='huelith-full-birefnet-local-resources');
}
function fixture(){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'huelith-birefnet-fixture-'));
  const src=path.join(tmp,'src-tauri/resources/models/birefnet');
  fs.mkdirSync(src,{recursive:true});
  const fd=fs.openSync(path.join(src,'model.onnx'),'w');
  fs.ftruncateSync(fd,972666916);fs.closeSync(fd); // sparse, no actual gigabyte of storage
  fs.writeFileSync(path.join(src,'LICENSE.txt'),'Test fixture license, not real redistribution notice');
  const rt=path.join(tmp,'node_modules/onnxruntime-web/dist');fs.mkdirSync(rt,{recursive:true});
  fs.writeFileSync(path.join(rt,'ort-wasm-simd-threaded.wasm'),'wasm-placeholder');
  fs.writeFileSync(path.join(rt,'ort-wasm-simd-threaded.mjs'),'// fixture');
  fs.writeFileSync(path.resolve(rt,'../LICENSE'),'Test-only onnxruntime license');
  const tf=path.join(tmp,'node_modules/@huggingface/transformers');fs.mkdirSync(tf,{recursive:true});
  fs.writeFileSync(path.join(tf,'LICENSE'),'Test-only transformers license');
  return tmp;
}
function fakeServer(){let handler;
  const server={middlewares:{use(fn){handler=fn}}};
  const response=()=>({status:0,headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers;},end(text=''){this.body=String(text);}});
  return {server,response,request:(url,method='HEAD')=>{
    const res=response();let nextCalled=false;
    handler({url,method},res,()=>{nextCalled=true;});
    return {...res,nextCalled};
  }};
}

test('dev model route serves installed full ONNX file with correct length, not SPA HTML',()=>{
  const tmp=fixture();
  try{
    const plugin=mockVitePlugin(tmp);const f=fakeServer();plugin.configureServer(f.server);
    const result=f.request('/models/birefnet/onnx/model.onnx');
    assert.equal(result.status,200);
    assert.equal(result.headers['Content-Length'],'972666916');
    assert.equal(result.headers['Content-Type'],'application/octet-stream');
    assert.equal(result.body,'');
    const wasm=f.request('/models/runtime/ort-wasm-simd-threaded.wasm');
    assert.equal(wasm.status,200);assert.equal(wasm.headers['Content-Type'],'application/wasm');
    const unmatched=f.request('/some-other-path');assert.equal(unmatched.nextCalled,true);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('missing model route responds with explicit 404, never index.html',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'huelith-birefnet-missing-'));
  try{
    const plugin=mockVitePlugin(tmp),f=fakeServer();plugin.configureServer(f.server);
    const result=f.request('/models/birefnet/onnx/model.onnx');
    assert.equal(result.status,404);assert.match(result.body,/Missing local BiRefNet/);
    assert.doesNotMatch(result.body,/<!doctype/i);
    const runtime=f.request('/models/runtime/ort-wasm.wasm');assert.equal(runtime.status,404);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('full model is packaged once with the frontend resources',async()=>{
  const tmp=fixture();
  try{
    const plugin=mockVitePlugin(tmp);await plugin.closeBundle();
    const source=fs.statSync(path.join(tmp,'src-tauri/resources/models/birefnet/model.onnx'));
    const output=fs.statSync(path.join(tmp,'dist/models/birefnet/onnx/model.onnx'));
    assert.equal(output.size,source.size);
    assert.equal(fs.existsSync(path.join(tmp,'dist/models/birefnet/LICENSE')),true);
    assert.equal(fs.existsSync(path.join(tmp,'dist/models/runtime/ort-wasm-simd-threaded.wasm')),true);
    assert.equal(fs.existsSync(path.join(tmp,'dist/models/runtime/LICENSE-onnxruntime-web.txt')),true);
    assert.equal(fs.existsSync(path.join(tmp,'dist/models/runtime/LICENSE-transformers-js.txt')),true);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('manual full mask initializes both opaque canvases without changing source image',()=>{
  const {initializeFullCutoutMask}=loadTypeScript(path.join(root,'src/editor/cutout-manual.ts'));
  const logs=[];
  const canvas=()=>({width:64,height:48,getContext:()=>({save(){},restore(){},set globalCompositeOperation(v){logs.push(['blend',v]);},set fillStyle(v){logs.push(['fill',v]);},clearRect(...r){logs.push(['clear',...r]);},fillRect(...r){logs.push(['paint',...r]);}})});
  initializeFullCutoutMask(canvas(),canvas());
  assert.equal(logs.filter(x=>x[0]==='paint').length,2);
  assert.deepEqual(logs.filter(x=>x[0]==='paint')[0],['paint',0,0,64,48]);
  assert.throws(()=>initializeFullCutoutMask({...canvas(),width:1},canvas()),/dimensions/);
});

test('simplified Cutout uses real sliders and does not rely on numeric value fields',()=>{
  const ui=read('src/components/CutoutWorkspace.tsx'),css=read('src/components/CutoutWorkspace.css');
  for(const name of ['Selection brush size','Cutout zoom','Mask overlay opacity','Mask feather','Expand or contract mask'])assert.match(ui,new RegExp(name));
  assert.match(ui,/Manual Clear — start with image/);
  assert.match(ui,/cutout-more-tools/);
  assert.doesNotMatch(ui,/type="number"/);
  assert.match(ui,/initializeFullCutoutMask/);
  assert.match(css,/\.cutout-action-toggle/);
});

test('HTML returned for a JSON config produces a meaningful Cutout error, not Unexpected token',async()=>{
  const input=read('src/editor/effects/birefnet-cutout.ts');
  const compiled=ts.transpileModule(input,{fileName:'birefnet-cutout.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  new Function('module','exports','require','fetch',compiled)(mod,mod.exports,id=>{
    if(id==='./birefnet-matte')return {clampPredictedMatte:()=>new Uint8ClampedArray(1)};
    throw Error('No model runtime import should be necessary for failed config verification: '+id);
  },async()=>({ok:true,text:async()=>`<!doctype html><html><body>Vite fallback</body></html>`}));
  const image={naturalWidth:8,naturalHeight:8};
  await assert.rejects(mod.exports.runBirefnetCutout(image),/HTML page.*model resource path/);
  assert.match(input,/const matte=await RawImage\.fromTensor/,'RawImage.resize must be awaited before accessing pixels');
});


test('current unextended BiRefNet LICENSE takes precedence over legacy LICENSE.txt',async()=>{
  const tmp=fixture();
  try{
    const directory=path.join(tmp,'src-tauri/resources/models/birefnet');
    fs.writeFileSync(path.join(directory,'LICENSE'),'New official model license');
    const plugin=mockVitePlugin(tmp);await plugin.closeBundle();
    assert.equal(fs.readFileSync(path.join(tmp,'dist/models/birefnet/LICENSE'),'utf8'),'New official model license');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('Vite includes independently attributed runtime licenses even when npm package omits LICENSE',async()=>{
  const tmp=fixture();
  try{
    const runtimeNotice=path.join(tmp,'node_modules/onnxruntime-web/LICENSE');
    const transformersNotice=path.join(tmp,'node_modules/@huggingface/transformers/LICENSE');
    fs.rmSync(runtimeNotice);
    fs.rmSync(transformersNotice);
    const fallback=path.join(tmp,'third-party-licenses');fs.mkdirSync(fallback,{recursive:true});
    for(const filename of ['onnxruntime-MIT.txt','transformers-js-APACHE-2.0.txt']){
      fs.copyFileSync(path.join(root,'third-party-licenses',filename),path.join(fallback,filename));
    }
    const plugin=mockVitePlugin(tmp);await plugin.closeBundle();
    const runtime=path.join(tmp,'dist/models/runtime');
    assert.match(fs.readFileSync(path.join(runtime,'LICENSE-onnxruntime-web.txt'),'utf8'),/Copyright \(c\) Microsoft Corporation/);
    assert.match(fs.readFileSync(path.join(runtime,'LICENSE-transformers-js.txt'),'utf8'),/Apache License/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('Tauri registers native-only timeline export and native cancellation commands',()=>{
  const registration=read('src-tauri/src/lib.rs');
  const mod=read('src-tauri/src/media/mod.rs');
  assert.match(registration,/media::native_timeline::media_export_native_timeline/);
  assert.match(registration,/media::native_timeline::media_cancel_native_timeline/);
  assert.match(mod,/pub\(crate\) mod native_timeline;/);
  assert.doesNotMatch(registration,/NativeFrameReaders/);
});

test('portable Tauri launcher disables incremental caches only on explicit opt-in',()=>{
  const script=read('scripts/tauri-portable.mjs');
  const pkg=JSON.parse(read('package.json'));
  assert.match(script,/CARGO_INCREMENTAL:'0'/);
  assert.equal(pkg.scripts['tauri:portable'],'node scripts/tauri-portable.mjs dev');
  assert.equal(pkg.scripts.tauri,'tauri'); // Normal workflow unchanged
});
