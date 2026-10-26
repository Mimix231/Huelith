const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('typescript');const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../src/editor');
const loaded=new Map();
function fakeZustand(){return{create:initialize=>{let state;const get=()=>state;const set=change=>{state={...state,...(typeof change==='function'?change(state):change)}};state=initialize(set,get);const use=s=>s?s(state):state;use.getState=get;return use;}};}
function load(name){if(loaded.has(name))return loaded.get(name);
 const file=path.join(root,`${name}.ts`);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};loaded.set(name,mod.exports);
 vm.runInNewContext(js,{module:mod,exports:mod.exports,structuredClone,Date,Math,Set,Map,Number,String,TextEncoder,Uint8Array,DataView,Error,globalThis:{crypto:webcrypto},require:id=>id==='zustand'?fakeZustand():load(id.slice(2))},{filename:file});
 loaded.set(name,mod.exports);return mod.exports;
}
const types=load('types'),animation=load('animation'),gradient=load('gradient'),{useEditor,activeTab}=load('store');
const read=rel=>fs.readFileSync(path.resolve(__dirname,'..',rel),'utf8');
const shape=()=>({id:'grad-cel',kind:'gradient',x:0,y:0,width:160,height:100,fill:'#000000',stroke:'none',strokeWidth:0,gradientMode:'linear',gradientStops:[{id:'a',position:0,color:'#ff2255',opacity:1},{id:'b',position:1,color:'#2277ff',opacity:1}]});
const step=(kind='starburst',amount=100)=>({id:kind,kind,enabled:true,amount,frequency:2,count:14,phase:0,seed:12,centerX:.5,centerY:.5});

test('Phase AL: Gradient is a first-class layer; a stacked Gradient layer validates, serializes and rejects malformed recipes',()=>{
 const doc=types.createDocument('Gradient Atelier',160,100);
 const layer=types.makeGradient({...shape(),gradientTransformStack:[step('starburst'),step('twirl'),step('wave')]});
 doc.layers.push(layer);doc.activeLayerId=layer.id;
 assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc))),true);
 const invalid=structuredClone(doc);invalid.layers[1].gradient.gradientTransformStack[1].kind='totally-not-a-transform';
 assert.equal(types.isDocument(invalid),false);
});

test('Phase AL: interactive Gradient layer updates are canonical through playback, editor undo and export',()=>{
 const editor=useEditor.getState();editor.newDoc('Gradient Track',160,100,'transparent',true);
 editor.addGradientLayer(shape());const id=activeTab(useEditor.getState()).doc.activeLayerId;
 editor.makeAnimation();editor.appendFrame(false);editor.appendFrame(false);
 const doc=()=>activeTab(useEditor.getState()).doc;
 editor.updateGradientLayer(id,gradient=>{gradient.gradientTransformStack=[step('starburst'),step('twirl')];});
 assert.equal(doc().animation.trackGradients[id].gradientTransformStack.length,2);
 for(let i=0;i<3;i++){
  editor.setActiveFrame(i);
  const layer=types.layerById(doc(),id);
  assert.equal(layer.type,'gradient');
  assert.equal(layer.gradient.gradientTransformStack.length,2);
  assert.equal(animation.frameDocument(doc(),i).layers.find(layer=>layer.id===id).gradient.gradientTransformStack.length,2);
  assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc()))),true);
 }
 // Another frame must not resurrect stale transforms from its cel copy.
 editor.updateGradientLayer(id,gradient=>{gradient.gradientTransformStack=[step('auroraCurtains')];});
 for(let i=0;i<3;i++)assert.equal(animation.frameDocument(doc(),i).layers.find(layer=>layer.id===id).gradient.gradientTransformStack[0].kind,'auroraCurtains');
 editor.undo();
 assert.equal(types.layerById(doc(),id).gradient.gradientTransformStack.length,2);
 editor.redo();
 assert.equal(types.layerById(doc(),id).gradient.gradientTransformStack[0].kind,'auroraCurtains');
});

test('Phase AL: Gradient created within an existing animation persists into every cel, and deletion is track-wide',()=>{
 const editor=useEditor.getState();editor.newDoc('Late Gradient Track',128,96,'transparent',true);
 editor.makeAnimation();editor.appendFrame(false);editor.appendFrame(false);
 editor.addGradientLayer(shape());
 const now=()=>activeTab(useEditor.getState()).doc;
 const gradientId=now().activeLayerId;
 assert.equal(now().animation.trackGradients[gradientId].kind,'gradient');
 assert.equal(now().animation.frames.length,3);
 for(let i=0;i<3;i++) {
   editor.setActiveFrame(i);
   assert.equal(types.layerById(now(),gradientId).type,'gradient');
   assert.equal(animation.frameDocument(now(),i).layers.some(item=>item.id===gradientId),true);
 }
 editor.updateGradientLayer(gradientId,g=>{g.gradientTransformStack=[step('crystalBloom')];});
 for(let i=0;i<3;i++) assert.equal(animation.frameDocument(now(),i).layers.find(item=>item.id===gradientId).gradient.gradientTransformStack[0].kind,'crystalBloom');
 editor.selectLayer(gradientId); editor.removeLayer();
 assert.equal(now().animation.trackGradients[gradientId],undefined);
 for(let i=0;i<3;i++) assert.equal(animation.frameDocument(now(),i).layers.some(item=>item.id===gradientId),false);
 editor.undo();
 for(let i=0;i<3;i++) assert.equal(animation.frameDocument(now(),i).layers.some(item=>item.id===gradientId),true);
});

test('Phase AL: transformed multi-step gradient actually changes pixels; zero field strength does not jump',()=>{
 const original=shape(),point=[.38,.65];
 const base=gradient.gradientSample(original,...point);
 const zero=gradient.gradientSample({...original,gradientTransformStack:[step('starburst',0)]},...point);
 assert.deepEqual([...zero],[...base]);
 const slight=gradient.gradientSample({...original,gradientTransformStack:[step('starburst',1)]},...point);
 assert.ok(Math.max(...slight.slice(0,3).map((v,i)=>Math.abs(v-base[i])))<8);
 const after=gradient.gradientSample({...original,gradientTransformStack:[step('starburst'),step('twirl'),step('wave')]},...point);
 assert.notDeepEqual(after,base);
 const muted=gradient.gradientSample({...original,gradientTransformStack:[{...step('starburst'),enabled:false}]},...point);
 assert.deepEqual([...muted],[...base]);
});

test('Phase AL: Cutout supports mouse/keyboard zoom, panning, command history, increased brush sizes and mask smoothing',()=>{
 const ui=read('src/components/CutoutWorkspace.tsx');
 for(const label of ['zoomAbout','onWheel','event.button===1','spacePressed.current','undoStep','redoStep','paintCutoutCommand','4096','refineCutoutMask','smooth','setPointerCapture','Keep brush','Polygon lasso']) assert.ok(ui.includes(label),label);
 assert.match(ui,/keydown.*press|addEventListener\('keydown',press/);
 assert.match(read('src/components/CutoutWorkspace.css'),/huelith-cutout-viewport\{position:relative;overflow:hidden/);
});

test('Phase AL: dedicated Atelier has categorized library, procedural stage, ordered stack and reversible Apply',()=>{
 const ui=read('src/components/GradientTransformEditor.tsx');
 for(const label of ['GRADIENT_TRANSFORMS','paintGradientPreview','hte-stack','Move transformation up','Move transformation down','Duplicate transformation','Toggle transformation','Undo','Redo','Cancel','Apply to layer','Save look']) assert.ok(ui.includes(label),label);
 assert.match(read('src/components/GradientTransformEditor.css'),/backdrop-filter:blur/);
 const bar=read('src/components/GradientDesignerToolbar.tsx');
 assert.match(bar,/GradientTransformEditor/);
 assert.match(bar,/state.updateGradientLayer/);
});

test('Phase AL: a Cutout mask invalidates the exact effects source and cannot cache a blank decoding mask',()=>{
 const fx=read('src/editor/fx.ts'), render=read('src/editor/render.ts');
 assert.match(fx,/current\.cutoutMask ===/);
 assert.match(fx,/cutoutMask: layer\.type === 'raster'/);
 assert.match(render,/layer\.cutoutMask\?\.enabled && layer\.cutoutMask\.data/);
 assert.match(render,/!loadImage\(layer\.cutoutMask\.data, onReady\)/);
});

test('Phase AL: canvas snaps movement and gradient handles; playback uses exact FX pixels and monotonic clock',()=>{
 const canvas=read('src/components/Canvas.tsx'),store=read('src/editor/store.ts'),fx=read('src/editor/fx.ts'),timeline=read('src/components/AnimationTimeline.tsx');
 assert.match(canvas,/snapPoint\(raw\)/);
 assert.match(canvas,/gradient-guide/);
 assert.match(store,/resolveTrackLayers\(target.layers, canonical, track.trackGradients/);
 assert.match(fx,/cachedExact\(source, signature, effects\)/);
 assert.match(fx,/setAnimationPlayback/);
 assert.match(timeline,/timelineFrameAt/);
 assert.match(timeline,/requestAnimationFrame/);
});
