const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function makeClient(deps){
 const code=ts.transpileModule(read('src/editor/effects-worker-client.ts').replace("new URL('./effects-worker.ts', import.meta.url)","'worker-url'"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',code)(id=>{if(!(id in deps))throw Error('Unexpected dependency '+id);return deps[id];},mod,mod.exports);
 return mod.exports;
}
test('worker is the only native preview engine; no unused fallback file, import, or workerless synchronous preview',()=>{
 assert.equal(fs.existsSync(path.join(root,'src/editor/cooperative-effects-fallback.ts')),false);
 const source=read('src/editor/effects-worker-client.ts');
 assert.doesNotMatch(source,/installCooperativeEffectsFallback|import.*fallback/);
 assert.match(source,/setAsyncEffectsProcessor\(displaySafe\)/);
 assert.match(source,/huelith-renderer-error/);
});
test('a broken worker cannot downgrade the canvas to blocking main-thread effects',()=>{
 const old={Worker:global.Worker,createImageBitmap:global.createImageBitmap,window:global.window,CustomEvent:global.CustomEvent};
 let current=null,created;const events=[];
 class WorkerMock {constructor(){created=this;}postMessage(){} terminate(){this.terminated=true;}}
 global.Worker=WorkerMock;global.createImageBitmap=async()=>({close(){}});
 global.CustomEvent=class CustomEvent{constructor(type,args){this.type=type;this.detail=args.detail;}};
 global.window={dispatchEvent:e=>events.push(e),addEventListener(){},removeEventListener(){}};
 try {
  const client=makeClient({'./fx':{setAsyncEffectsProcessor:fn=>current=fn},'./preview-quality':{isInteractiveEffectPreview:()=>false}});
  const dispose=client.installEffectsWorker();assert.equal(typeof current,'function');
  created.onerror({preventDefault(){}});
  assert.equal(typeof current,'function');assert.equal(current({},[],'layer',()=>{}),true);
  assert.ok(events.some(e=>e.type==='huelith-renderer-error'));
  dispose();assert.equal(current,null);assert.equal(created.terminated,true);
 }finally{Object.assign(global,old);}
});
test('an individual invalid effect reports an error and keeps the worker alive for subsequent effects',async()=>{
 const old={Worker:global.Worker,createImageBitmap:global.createImageBitmap,window:global.window,CustomEvent:global.CustomEvent};
 let current=null,created;const events=[];
 class WorkerMock{constructor(){created=this;this.messages=[];}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}}
 global.Worker=WorkerMock;global.createImageBitmap=async source=>({width:source.width,height:source.height,close(){}});
 global.CustomEvent=class CustomEvent{constructor(type,args){this.type=type;this.detail=args.detail;}};
 global.window={dispatchEvent:e=>events.push(e),addEventListener(){},removeEventListener(){}};
 try {
  const client=makeClient({'./fx':{setAsyncEffectsProcessor:fn=>current=fn},'./preview-quality':{isInteractiveEffectPreview:()=>false}});
  const dispose=client.installEffectsWorker();
  const canvas={width:20,height:20};const seen=[];
  current(canvas,[{kind:'atelier_2_1',enabled:true,amount:70}],'layer',()=>seen.push(1));
  await Promise.resolve();await Promise.resolve();
  const first=created.messages.find(message=>message.effects);
  created.onmessage({data:{id:first.id,error:'Invalid effect options'}});
  assert.equal(created.terminated,undefined);
  assert.ok(events.some(e=>e.detail?.message.includes('Invalid effect options')));
  current(canvas,[{kind:'atelier_2_1',enabled:true,amount:72}],'layer',()=>seen.push(2));
  await Promise.resolve();await Promise.resolve();
  const second=created.messages.filter(message=>message.effects).at(-1);
  assert.ok(second.id>first.id);
  created.onmessage({data:{id:second.id,result:{width:20,close(){}}}});
  assert.deepEqual(seen,[2]);dispose();
 }finally{Object.assign(global,old);}
});

test('Studio exposes renderer failures in a themed alert rather than an indefinitely pending slider',()=>{
 const ui=read('src/components/FxStudio.tsx'),css=read('src/components/FxStudio.css');
 assert.match(ui,/window.addEventListener\('huelith-renderer-error',error\)/);
 assert.match(ui,/setPreviewStatus\('idle'\)/);
 assert.match(ui,/effectsRendererProblem\(\)/);
 assert.match(ui,/studio-renderer-warning/);
 assert.match(css,/var\(--accent-soft\)/);
});
