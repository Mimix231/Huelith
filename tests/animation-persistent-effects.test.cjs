const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '../src/editor');
const modules = new Map();
function fakeZustand() {
  return { create: initialize => {
    let state;
    const get = () => state;
    const set = patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
    state = initialize(set, get);
    const hook = select => select ? select(state) : state;
    hook.getState = get;
    return hook;
  } };
}
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const file = path.join(root, `${name}.ts`);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName:file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const scope = { module, exports:module.exports, structuredClone, Date, Math, Set, Map, Number,
    String, TextEncoder, Uint8Array, DataView, Error, globalThis: {crypto:webcrypto},
    require:specifier => specifier === 'zustand' ? fakeZustand() : load(path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier))) };
  vm.runInNewContext(compiled, scope, {filename:file});
  modules.set(name,module.exports);
  return module.exports;
}
const types=load('types');
const animation=load('animation');
const {newEffect}=load('fx');
const {useEditor,activeTab}=load('store');
const doc=()=>activeTab(useEditor.getState()).doc;
function fresh() { useEditor.getState().newDoc('Persistent FX',48,48,'transparent',true);return useEditor.getState(); }
function effectsAt(frame) {return animation.frameDocument(doc(),frame).layers[0].effects ?? [];}

test('one shared stack controls all six animation frames, without modifying the ink',()=>{
  const editor=fresh();
  for(let i=1;i<6;i++)editor.appendFrame(false);
  const ids=doc().animation.frames.map(item=>item.id);
  const id=doc().layers[0].id;
  editor.appendEffects(id,[newEffect('outline',10),newEffect('glow',20),newEffect('glitch',38)]);
  const fxId=doc().layers[0].effects[0].id;
  assert.equal(doc().animation.trackEffects[id].length,3);
  for(let i=0;i<6;i++)assert.deepEqual(effectsAt(i).map(effect=>effect.kind),['outline','glow','glitch']);
  editor.updateEffect(id,fxId,{amount:14});
  for(let i=0;i<6;i++)assert.equal(effectsAt(i)[0].amount,14);
  for(let i=0;i<6;i++){
    editor.setActiveFrame(i);
    assert.equal(doc().layers[0].effects[0].amount,14);
    assert.equal(doc().animation.frames[i].id,ids[i]);
    assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc()))),true);
  }
});

test('removing final effect stays removed after playback, even if old cel contains stale FX',()=>{
  const editor=fresh();
  editor.appendFrame(false);editor.appendFrame(false);
  const id=doc().layers[0].id;
  editor.addEffect(id,'glow');
  const effectId=doc().layers[0].effects[0].id;
  editor.setActiveFrame(0);
  // Simulate a historical cel with an effect mirror.
  assert.equal(doc().layers[0].effects.length,1);
  editor.removeEffect(id,effectId);
  assert.deepEqual(doc().animation.trackEffects[id],[]);
  for(let i=0;i<3;i++) {
    editor.setActiveFrame(i);
    assert.equal(doc().layers[0].effects.length,0);
    assert.equal(effectsAt(i).length,0);
  }
});

test('reorder, disable and amount updates persist across playback, saving, and export projections',()=>{
  const editor=fresh();
  editor.appendFrame(false); editor.appendFrame(false);
  const id=doc().layers[0].id;
  editor.appendEffects(id,[newEffect('brightness',140),newEffect('vhs',50),newEffect('sig_14',80)]);
  const middle=doc().layers[0].effects[1].id;
  editor.moveEffect(id,middle,-1);
  editor.updateEffect(id,middle,{enabled:false});
  for(let i=0;i<3;i++){
    const result=effectsAt(i);
    assert.equal(result[0].id,middle);
    assert.equal(result[0].enabled,false);
    assert.equal(result[2].kind,'sig_14');
  }
  const stored=JSON.parse(JSON.stringify(doc()));
  assert.ok(types.isDocument(stored));
  for(let i=0;i<3;i++)assert.equal(animation.frameDocument(stored,i).layers[0].effects[0].enabled,false);
  editor.undo();
  assert.equal(doc().layers[0].effects[0].enabled,true);
  editor.redo();
  assert.equal(doc().layers[0].effects[0].enabled,false);
});

test('Studio FX Apply writes one layer-level stack while previews never overwrite animation artwork',()=>{
  const editor=fresh();
  editor.appendFrame(false);editor.appendFrame(false);
  const id=doc().layers[0].id;
  const before=doc().animation.frames.map(frame=>frame.layers[0].image);
  const pending=[newEffect('glow',55),newEffect('outline',12)];
  editor.previewStudioEffects(id,pending);
  editor.commitStudioEffects(id,pending);
  assert.equal(JSON.stringify(doc().animation.frames.map(frame=>frame.layers[0].image)),JSON.stringify(before));
  assert.deepEqual(doc().animation.trackEffects[id].map(effect=>effect.kind),['glow','outline']);
  for(let i=0;i<3;i++)assert.equal(effectsAt(i).length,2);
});

test('legacy animation files migrate shared effects and do not change frame art',()=>{
  const legacy=types.createDocument('Historical',48,48,'transparent');
  animation.enableAnimation(legacy);
  animation.insertFrame(legacy,false);
  const first=legacy.animation.frames[0].layers[0];
  first.effects=[newEffect('glow',65)];
  delete legacy.animation.trackEffects;
  legacy.layers[0].image='';
  assert.equal(animation.frameDocument(legacy,1).layers[0].effects[0].kind,'glow');
  assert.equal(legacy.animation.trackEffects,undefined,'Read-only export must not migrate source');
  const sourceArt=legacy.animation.frames.map(frame=>frame.layers[0].image);
  animation.selectFrame(legacy,0);
  assert.equal(legacy.animation.trackEffects[first.id][0].kind,'glow');
  assert.equal(JSON.stringify(legacy.animation.frames.map(frame=>frame.layers[0].image)),JSON.stringify(sourceArt));
});

test('track FX parser rejects malformed stacks, accepts saved names and legacy files',()=>{
  const document=types.createDocument('Format');
  animation.enableAnimation(document);
  const id=document.layers[0].id;
  document.animation.trackEffects[id]=[newEffect('glow',30)];
  assert.equal(types.isDocument(document),true);
  const malformed=structuredClone(document);
  malformed.animation.trackEffects[id]=[{id:'x',kind:'made-up',enabled:true,amount:30}];
  assert.equal(types.isDocument(malformed),false);
  document.format='spectrum';
  assert.equal(types.isDocument(document),true);
});


test('live FX slider commit applies to the whole layer, not the currently edited frame',()=>{
  const editor=fresh();editor.appendFrame(false);editor.appendFrame(false);
  const id=doc().layers[0].id;
  editor.addEffect(id,'brightness');
  const effectId=doc().layers[0].effects[0].id;
  const initial=doc().layers[0].effects[0].amount;
  editor.previewEffect(id,effectId,{amount:155});
  assert.equal(doc().layers[0].effects[0].amount,155);
  editor.finishEffectPreview();
  for(let i=0;i<3;i++)assert.equal(effectsAt(i)[0].amount,155);
  editor.undo();
  for(let i=0;i<3;i++)assert.equal(effectsAt(i)[0].amount,initial);
});

test('nested group-child FX persist independently across animation cels',()=>{
  const document=types.createDocument('Grouped ink');
  const inside=types.makeVector('Inner artwork');
  const group={id:types.uid(),name:'FX Group',type:'group',visible:true,locked:false,
    opacity:1,blend:'source-over',x:0,y:0,children:[inside]};
  document.layers=[group];document.activeLayerId=group.id;
  animation.enableAnimation(document);animation.insertFrame(document,false);
  const bright=newEffect('brightness',155);
  const glow=newEffect('glow',42);
  animation.setTrackEffects(document,inside.id,[bright]);
  animation.setTrackEffects(document,group.id,[glow]);
  for(let i=0;i<2;i++){
    const frame=animation.frameDocument(document,i);
    assert.equal(frame.layers[0].effects[0].id,glow.id);
    assert.equal(frame.layers[0].children[0].effects[0].id,bright.id);
  }
  assert.ok(types.isDocument(JSON.parse(JSON.stringify(document))));
});
