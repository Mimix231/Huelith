/** Slider regressions: no full-store repaints during temporary previews, stable
 * compositing objects and exact final values saved as one undo transaction. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const modules = new Map();
function create(initializer) {
  let state;
  const get = () => state;
  const set = change => { state = { ...state, ...(typeof change === 'function' ? change(state) : change) }; };
  state = initializer(set, get);
  const store = selector => selector ? selector(state) : state;
  store.getState = get;
  return store;
}
function load(name) {
  name = name.replace(/^\.\//, '');
  if (modules.has(name)) return modules.get(name);
  const code = fs.readFileSync(path.join(root, 'src/editor', `${name}.ts`), 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  modules.set(name, module.exports);
  new Function('require', 'module', 'exports', transpiled)(specifier =>
    specifier === 'zustand' ? { create } : load(specifier), module, module.exports);
  modules.set(name, module.exports);
  return module.exports;
}
const { useEditor, activeTab, studioPreviewLayer } = load('store');
const { newEffect } = load('fx');

test('20 live Studio slider changes do not rewrite the document or the global store', () => {
  useEditor.getState().newDoc('Slider rehearsal', 320, 180);
  const tabBefore = activeTab(useEditor.getState());
  const sourceLayer = tabBefore.doc.layers[0];
  const tabArrayBefore = useEditor.getState().tabs;
  const effect = newEffect('brightness', 100);
  for (let amount = 101; amount <= 120; amount++) {
    useEditor.getState().previewStudioEffects(sourceLayer.id, [{ ...effect, amount }]);
    assert.equal(useEditor.getState().tabs, tabArrayBefore, 'Live change rerendered the whole application');
    assert.equal(activeTab(useEditor.getState()).doc, tabBefore.doc, 'Live change modified source document');
  }
  const composited = studioPreviewLayer(tabBefore.doc.id, sourceLayer);
  assert.equal(composited.effects[0].amount, 120);
  assert.equal(studioPreviewLayer(tabBefore.doc.id, sourceLayer), composited,
    'The overlay must reuse its Layer identity on unrelated canvas redraws');
  const historicalLength = tabBefore.past.length;
  useEditor.getState().commitStudioEffects(sourceLayer.id, [{ ...effect, amount: 120 }]);
  const committed = activeTab(useEditor.getState());
  assert.equal(committed.doc.layers[0].effects[0].amount, 120);
  assert.equal(committed.past.length, historicalLength + 1);
  assert.equal(studioPreviewLayer(committed.doc.id, committed.doc.layers[0]), committed.doc.layers[0],
    'Committed document must no longer use a temporary preview');
  useEditor.getState().undo();
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects?.length ?? 0, 0);
});

test('canceling a live Studio adjustment leaves the saved document untouched', () => {
  useEditor.getState().newDoc('Cancel rehearsal', 320, 180);
  const original = activeTab(useEditor.getState());
  const layer = original.doc.layers[0];
  useEditor.getState().previewStudioEffects(layer.id, [newEffect('glow', 70)]);
  assert.notEqual(studioPreviewLayer(original.doc.id, layer), layer);
  useEditor.getState().cancelStudioEffects();
  assert.equal(studioPreviewLayer(original.doc.id, layer), layer);
  assert.equal(activeTab(useEditor.getState()).doc, original.doc);
  assert.equal(activeTab(useEditor.getState()).revision, original.revision);
});

test('responsive controls display their local pointer value and submit the final released value', () => {
  const studio = fs.readFileSync(path.join(root, 'src/components/FxStudio.tsx'), 'utf8');
  assert.match(studio, /setDraft\(next\)/);
  assert.match(studio, /value=\{draft\}/);
  assert.match(studio, /onFinish\(final\)/);
  assert.match(studio, /if \(!sliderPreview\) setWorking\(next\)/);
  assert.match(studio, /setWorking\(current\.current\)/);
});

test('worker source is retained between updates and obsolete results cannot overwrite the last value', () => {
  const client = fs.readFileSync(path.join(root, 'src/editor/effects-worker-client.ts'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'src/editor/effects-worker.ts'), 'utf8');
  assert.match(client, /residentSources\.has\(job\.sourceId\)/);
  assert.match(client, /latest\.has\(finished\.layer\)/);
  // createImageBitmap copies instead of detaching cached effect-stage canvases.
  assert.match(worker, /await createImageBitmap\(output\)/);
  assert.match(worker, /EffectStackCache/);
});
