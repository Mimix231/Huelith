const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

const modules = new Map();
const root = path.resolve(__dirname, '../src/editor');
function fakeZustand() {
  return { create: initialize => {
    let state;
    const get = () => state;
    const set = patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
    state = initialize(set, get);
    const useStore = select => select ? select(state) : state;
    useStore.getState = get;
    return useStore;
  } };
}
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = fs.readFileSync(path.join(root, `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const scope = { module, exports: module.exports, structuredClone, Date, Math, Set, Map, Number, String,
    TextEncoder, Uint8Array, DataView, Error, globalThis: { crypto: webcrypto },
    require: spec => spec === 'zustand' ? fakeZustand() : load(spec.slice(2)) };
  vm.runInNewContext(compiled, scope, { filename: name });
  modules.set(name, module.exports);
  return module.exports;
}
const model = load('types');
const animation = load('animation');
const { useEditor, activeTab } = load('store');
const animationExport = load('animation-export');

function fresh() {
  useEditor.getState().newDoc('Walk-cycle', 48, 48, 'transparent', true);
  return useEditor.getState();
}

test('static documents remain valid and animation is opt-in', () => {
  const doc = model.createDocument();
  assert.equal(doc.animation, undefined);
  assert.equal(model.isDocument(doc), true);
  animation.enableAnimation(doc, 12);
  assert.equal(doc.animation.frames.length, 1);
  assert.equal(model.isDocument(doc), true);
});

test('blank frames retain layers but not artwork, duplicate frames retain artwork', () => {
  const doc = model.createDocument('Test', 64, 64);
  const vector = model.makeVector('Ink');
  vector.shapes.push({ id: model.uid(), kind: 'rect', x: 5, y: 5, width: 10, height: 10, fill: '#f00', stroke: 'none', strokeWidth: 0 });
  doc.layers.push(vector);
  animation.enableAnimation(doc);
  animation.insertFrame(doc, false);
  assert.equal(doc.animation.currentFrame, 1);
  assert.equal(doc.layers[1].shapes.length, 0);
  assert.equal(doc.animation.frames[0].layers[1].shapes.length, 1);
  animation.selectFrame(doc, 0);
  animation.insertFrame(doc, true);
  assert.equal(doc.layers[1].shapes.length, 1);
  assert.equal(model.isDocument(doc), true);
});

test('frame edits remain isolated and scrub never loses ink', () => {
  fresh();
  let state = useEditor.getState();
  const oldId = activeTab(state).doc.id;
  state.appendFrame(false);
  state.addLayer('vector');
  const selected = activeTab(useEditor.getState()).doc.activeLayerId;
  state.addShape({ id: model.uid(), kind: 'rect', x: 5, y: 4, width: 10, height: 9, fill: '#f00', stroke: 'none', strokeWidth: 0 });
  assert.equal(activeTab(useEditor.getState()).doc.animation.currentFrame, 1);
  state.setActiveFrame(0);
  let doc = activeTab(useEditor.getState()).doc;
  assert.equal(doc.layers.some(layer => layer.id === selected), false);
  state.setActiveFrame(1);
  doc = activeTab(useEditor.getState()).doc;
  assert.ok(doc.layers.some(layer => layer.id === selected && layer.type === 'vector' && layer.shapes.length === 1));
  assert.equal(doc.id, oldId);
  assert.equal(model.isDocument(doc), true);
});

test('reorder preserves selected frame by identity; deleting keeps at least one', () => {
  const state = fresh();
  state.appendFrame();
  state.appendFrame();
  const before = activeTab(useEditor.getState()).doc.animation;
  const selectedId = before.frames[before.currentFrame].id;
  state.reorderAnimationFrames(2, 0);
  const changed = activeTab(useEditor.getState()).doc;
  assert.equal(changed.animation.frames[changed.animation.currentFrame].id, selectedId);
  state.deleteActiveFrame();
  state.deleteActiveFrame();
  state.deleteActiveFrame();
  assert.equal(activeTab(useEditor.getState()).doc.animation.frames.length, 1);
  assert.equal(model.isDocument(activeTab(useEditor.getState()).doc), true);
});

test('onion ghosts and durations are validated and survive serialization', () => {
  const state = fresh();
  state.setOnion({ previous: 3, next: 2, opacity: 0.4 });
  state.setAnimationFps(24);
  state.setFrameDuration(0, 90);
  let doc = activeTab(useEditor.getState()).doc;
  assert.equal(doc.animation.onion.previous, 3);
  assert.equal(doc.animation.fps, 24);
  assert.equal(doc.animation.frames[0].durationMs, 90);
  assert.equal(model.isDocument(JSON.parse(JSON.stringify(doc))), true);
  const invalid = JSON.parse(JSON.stringify(doc));
  invalid.animation.frames[0].durationMs = -20;
  assert.equal(model.isDocument(invalid), false);
  const inconsistent = JSON.parse(JSON.stringify(doc));
  inconsistent.layers[0].name = 'tampered';
  assert.equal(model.isDocument(inconsistent), false);
});

test('undo restores frame edits; switching active frame does not add history', () => {
  const state = fresh();
  state.appendFrame(false);
  let tab = activeTab(useEditor.getState());
  const steps = tab.past.length;
  state.setActiveFrame(0);
  state.setActiveFrame(1);
  tab = activeTab(useEditor.getState());
  assert.equal(tab.past.length, steps);
  state.undo();
  assert.equal(activeTab(useEditor.getState()).doc.animation.frames.length, 1);
});

test('APNG encodes animation-control and per-frame chunks with PNG headers', () => {
  // Canvas-like 1×1 RGBA PNG data fixture.
  const sample = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8bxTwn4GBgYGJAQoAJucChHIIyzMAAAAASUVORK5CYII=', 'base64'));
  const data = animationExport.encodeApng([sample, sample], [83, 120]);
  const latin = Buffer.from(data).toString('latin1');
  assert.equal(latin.includes('acTL'), true);
  assert.equal((latin.match(/fcTL/g) ?? []).length, 2);
  assert.equal(latin.includes('fdAT'), true);
  assert.equal(latin.includes('IEND'), true);
});

test('ZIP sequence encoder creates central-directory records', () => {
  const bytes = animationExport.encodeZip([{ name: 'frame-0001.png', bytes: new Uint8Array([1, 2, 3]) }]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
});

test('obsolete cleanup only uses fixed paths and does nothing by default', () => {
  const script = fs.readFileSync(path.resolve(__dirname, '../scripts/remove-obsolete.mjs'), 'utf8');
  assert.match(script, /--apply/);
  assert.match(script, /knownObsolete/);
  assert.doesNotMatch(script, /rmSync\(root/);
});

test('changing FPS changes real playback timing, preserving relative frame durations', () => {
  const doc = model.createDocument('Timing');
  animation.enableAnimation(doc, 12);
  animation.insertFrame(doc, true);
  animation.changeFrameDuration(doc, 1, 200);
  animation.changeFps(doc, 24);
  assert.equal(doc.animation.fps, 24);
  assert.equal(doc.animation.frames[0].durationMs, 42);
  assert.equal(doc.animation.frames[1].durationMs, 100);
  assert.equal(model.isDocument(doc), true);
});

test('effect parameter validation accepts bounded numeric controls only', () => {
  const doc = model.createDocument();
  doc.layers[0].effects = [{ id: 'glow-1', kind: 'glow', enabled: true, amount: 12,
    parameters: { blur: 20, opacity: 60, offsetX: 3, offsetY: -2 } }];
  assert.equal(model.isDocument(doc), true);
  const invalid = structuredClone(doc);
  invalid.layers[0].effects[0].parameters.opacity = 900;
  assert.equal(model.isDocument(invalid), false);
  invalid.layers[0].effects[0].parameters = { __proto__: null, script: 1 };
  assert.equal(model.isDocument(invalid), false);
});

test('timeline code exposes drag playhead, frame reordering, onion controls and playback', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../src/components/AnimationTimeline.tsx'), 'utf8');
  for (const marker of [
    'timeline-playhead', 'setPointerCapture', 'onPointerMove', 'reorderAnimationFrames',
    'onion.opacity', 'appendFrame(false)', 'appendFrame(true)', 'deleteActiveFrame()',
    'setActiveFrame', 'setAnimationFps', 'setFrameDuration',
  ]) assert.ok(code.includes(marker), `Missing timeline action: ${marker}`);
});

test('startup does not force a blurred welcome screen', () => {
  const state = useEditor.getState();
  assert.ok(state.tabs.length > 0);
  const ui = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8');
  assert.ok(!ui.includes('welcome-scrim'));
  assert.ok(!ui.includes('setWelcome'));
});
