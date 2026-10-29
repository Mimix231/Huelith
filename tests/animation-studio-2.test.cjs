const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../src/editor'),loaded=new Map();
function fakeZustand(){return{create:initialize=>{let state;const get=()=>state;const set=change=>{state={...state,...(typeof change==='function'?change(state):change)}};state=initialize(set,get);const use=s=>s?s(state):state;use.getState=get;return use;}};}
function load(name){if(loaded.has(name))return loaded.get(name);const f=path.join(root,`${name}.ts`),script=ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const mod={exports:{}};loaded.set(name,mod.exports);vm.runInNewContext(script,{module:mod,exports:mod.exports,structuredClone,Date,Math,Set,Map,Number,String,TextEncoder,Uint8Array,DataView,Error,globalThis:{crypto:webcrypto},require:id=>id==='zustand'?fakeZustand():load(id.slice(2))},{filename:f});loaded.set(name,mod.exports);return mod.exports;}
const animation=load('animation'),types=load('types'),timing=load('playback-clock');const {useEditor,activeTab}=load('store');
const store=()=>useEditor.getState();const doc=()=>activeTab(store()).doc;
function fresh(name='Animation Studio'){store().newDoc(name,48,48,'transparent',true);store().appendFrame(false);store().appendFrame(false);return doc().layers[0].id;}
function rasterImage(image,id){store().mutate(d=>{const layer=types.layerById(d,id);assert.equal(layer.type,'raster');layer.image=image;layer.imageWidth=48;layer.imageHeight=48;});}
const PIX_A='data:image/png;base64,aaaa',PIX_B='data:image/png;base64,bbbb';
test('held cel references a drawing by frame ID, displays it on canvas and in export, and retains the real master source',()=>{
 const id=fresh();store().setActiveFrame(0);rasterImage(PIX_A,id);
 store().setAnimationHold(1,id,true);
 assert.equal(doc().animation.frames[1].holdFrom[id],doc().animation.frames[0].id);
 assert.equal(doc().animation.frames[1].layers[0].image,'');
 assert.equal(animation.frameDocument(doc(),1).layers[0].image,PIX_A);
 store().setActiveFrame(1);assert.equal(doc().layers[0].image,PIX_A);
 assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc()))),true);
 store().setActiveFrame(0);rasterImage(PIX_B,id);
 assert.equal(animation.frameDocument(doc(),1).layers[0].image,PIX_B,'hold updates when its master frame changes');
});
test('editing a held cel automatically creates a new independent drawing without damaging source or shared FX',()=>{
 const id=fresh();store().setActiveFrame(0);rasterImage(PIX_A,id);store().setAnimationHold(1,id,true);store().setActiveFrame(1);
 rasterImage(PIX_B,id);
 assert.equal(doc().animation.frames[1].holdFrom?.[id],undefined);
 assert.equal(animation.frameDocument(doc(),0).layers[0].image,PIX_A);
 assert.equal(animation.frameDocument(doc(),1).layers[0].image,PIX_B);
 store().undo();assert.equal(animation.frameDocument(doc(),1).layers[0].image,PIX_A);
 store().redo();assert.equal(animation.frameDocument(doc(),1).layers[0].image,PIX_B);
});
test('clear held cel, release hold, and delete a master frame preserve dependent drawing and project validity',()=>{
 const id=fresh();store().setActiveFrame(0);rasterImage(PIX_A,id);
 store().setAnimationHold(1,id,true);store().setAnimationHold(2,id,true);
 assert.equal(animation.frameDocument(doc(),2).layers[0].image,PIX_A);
 store().clearAnimationCel(2,id);assert.equal(animation.frameDocument(doc(),2).layers[0].image,'');
 store().setActiveFrame(0);store().deleteActiveFrame();
 assert.equal(animation.frameDocument(doc(),0).layers[0].image,PIX_A);
 assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc()))),true);
});
test('duplicate selected frame range, rename, batch duration, loop region and undo survive serialize/reopen',()=>{
 fresh();store().setAnimationFrameLabel(0,'eyes open');store().setAnimationFrameLabel(1,'blink');
 store().setAnimationFrameDurations([0,1],250);
 store().setPlaybackRegion({mode:'pingpong',start:0,end:2});
 assert.equal(doc().animation.playback.mode,'pingpong');
 store().duplicateAnimationFrames([0,1]);
 assert.equal(doc().animation.frames.length,5);
 assert.equal(doc().animation.frames[2].label,'eyes open');
 assert.equal(doc().animation.frames[3].label,'blink');
 assert.equal(doc().animation.frames[0].durationMs,250);
 assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc()))),true);
 store().undo();assert.equal(doc().animation.frames.length,3);
});
test('ping-pong honors frame durations without repeating endpoints, once stops, loop wraps within the range',()=>{
 const frames=[{durationMs:100},{durationMs:200},{durationMs:300},{durationMs:400}];
 const ping={mode:'pingpong',start:1,end:3};
 // Sequence 1(200),2(300),3(400),2(300) => cycle 1200
 assert.equal(timing.timelineRegionAt(frames,0,ping).frame,1);
 assert.equal(timing.timelineRegionAt(frames,200,ping).frame,2);
 assert.equal(timing.timelineRegionAt(frames,500,ping).frame,3);
 assert.equal(timing.timelineRegionAt(frames,900,ping).frame,2);
 assert.equal(timing.timelineRegionAt(frames,1200,ping).frame,1);
 const once={...ping,mode:'once'};
 assert.equal(timing.timelineRegionAt(frames,1200,once).completed,true);
 assert.equal(timing.timelineRegionAt(frames,1200,once).frame,3);
 const loop={...ping,mode:'loop'};
 assert.equal(timing.timelineRegionAt(frames,900,loop).frame,1);
 assert.equal(timing.timelineRegionOffset(frames,2,ping),200);
});
test('frame selection, layer cels, range controls and thematic CSS are present in the actual Animation Studio',()=>{
 const ui=fs.readFileSync(path.resolve(__dirname,'../src/components/AnimationTimeline.tsx'),'utf8'),css=fs.readFileSync(path.resolve(__dirname,'../src/styles/animation.css'),'utf8');
 for(const marker of ['timeline-sheet-cel','timeline-view-toggle','Playback behavior','timeline-frame-tag','setAnimationHold','setAnimationFrameDurations','duplicateAnimationFrames','setAnimationFrameLabel','timelineRegionAt'])assert.ok(ui.includes(marker),marker);
 assert.match(css,/var\(--accent\)/);assert.match(css,/timeline-sheet-layer-name/);
});
test('multi-frame hold and release are atomic and remain valid after undo/redo',()=>{
 const id=fresh();store().setActiveFrame(0);rasterImage(PIX_A,id);
 store().setAnimationHolds([1,2],id,true);
 for(const index of [1,2])assert.equal(animation.frameDocument(doc(),index).layers[0].image,PIX_A);
 assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc()))),true);
 store().undo();assert.equal(doc().animation.frames[1].holdFrom?.[id],undefined);
 store().redo();assert.equal(animation.frameDocument(doc(),2).layers[0].image,PIX_A);
 store().setAnimationHolds([1,2],id,false);
 for(const index of [1,2]){
  assert.equal(doc().animation.frames[index].holdFrom?.[id],undefined);
  assert.equal(animation.frameDocument(doc(),index).layers[0].image,PIX_A);
 }
});
test('multi-frame deletion retains one frame and safely releases dependencies when sources are deleted',()=>{
 const id=fresh();store().setActiveFrame(0);rasterImage(PIX_A,id);
 store().setAnimationHolds([1,2],id,true);
 store().deleteAnimationFrames([0,1]);
 assert.equal(doc().animation.frames.length,1);
 assert.equal(animation.frameDocument(doc(),0).layers[0].image,PIX_A);
 assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc()))),true);
 store().undo();assert.equal(doc().animation.frames.length,3);
});
test('held layer inside nested group resolves correctly and survives project validation',()=>{
 const d=types.createDocument('Group Hold',48,48,'transparent');
 const raster=types.makeRaster('Inside');raster.image=PIX_A;raster.imageWidth=48;raster.imageHeight=48;
 const group={id:types.uid(),type:'group',name:'Group',visible:true,locked:false,opacity:1,blend:'source-over',x:0,y:0,children:[raster]};
 d.layers=[group];d.activeLayerId=group.id;animation.enableAnimation(d);
 animation.insertFrame(d,false);assert.equal(animation.holdLayer(d,1,raster.id),true);
 assert.equal(animation.frameDocument(d,1).layers[0].children[0].image,PIX_A);
 assert.equal(types.isDocument(JSON.parse(JSON.stringify(d))),true);
});
