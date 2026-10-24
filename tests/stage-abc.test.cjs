/** Stage A–C behavior tests. Uses the real editor model/store with a small Zustand adapter. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const loaded = new Map();

function create(initializer) {
  let state;
  const get = () => state;
  const set = change => { state = { ...state, ...(typeof change === 'function' ? change(state) : change) }; };
  state = initializer(set, get);
  const useStore = selector => selector ? selector(state) : state;
  useStore.getState = get;
  return useStore;
}

function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const filename = path.join(root, 'src/editor', `${name}.ts`);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
  const module = { exports: {} };
  const requireDependency = specifier => specifier === 'zustand' ? { create } : load(specifier.slice(2));
  const invoke = new Function('require', 'module', 'exports', 'structuredClone', 'document', 'localStorage',
    'crypto', 'requestAnimationFrame', 'cancelAnimationFrame', output.outputText);
  invoke(requireDependency, module, module.exports, structuredClone,
    { createElement: () => ({ getContext: () => ({ font: '', measureText: line => ({ width: line.length * 21 }) }) }) },
    { getItem: () => null, setItem: () => {} }, require('node:crypto').webcrypto,
    callback => setTimeout(callback, 0), timer => clearTimeout(timer));
  loaded.set(name, module.exports);
  return module.exports;
}

const model = load('types');
const catalog = load('studio-catalog');
const { useEditor, activeTab } = load('store');
const { scaleShape } = load('geometry');
const { transformText, DEFAULT_TEXT_FORMAT } = load('typography');

function freshLayer() {
  const state = useEditor.getState();
  state.newDoc('Stage ABC', 480, 240);
  const doc = activeTab(useEditor.getState()).doc;
  return { doc, layer: doc.layers[0], state: useEditor.getState() };
}

test('catalog separates 72 Creativity filters, 7 independent Effects, and 22 signature FX', () => {
  assert.equal(catalog.CREATIVITY_FILTERS.length, 72);
  assert.equal(catalog.LAYER_EFFECTS.length, 7);
  assert.equal(Object.keys(load('fx').FX_PRESETS).length, 22);
  assert.equal(catalog.LAYER_EFFECTS.find(item => item.kind === 'cutout').kind, 'cutout');
});

test('preset effects share one stable rounded-icon identity and remain valid save data', () => {
  const group = catalog.createStudioPreset('Neon Pulse');
  assert.equal(group.length, 1, 'Each new signature FX is an independent editable processor');
  assert.equal(group[0].kind, 'sig_1');
  assert.equal(new Set(group.map(effect => effect.studioGroupId)).size, 1);
  assert.equal(catalog.appliedStudioItems(group).length, 1);
  assert.equal(catalog.appliedStudioItems(group)[0].category, 'fx');
  const { doc, layer } = freshLayer();
  layer.effects = group;
  assert.equal(model.isDocument(JSON.parse(JSON.stringify(doc))), true);
});

test('legacy untagged effects remain classified and preserve effect order', () => {
  const collection = [load('fx').newEffect('brightness'), load('fx').newEffect('glow'), load('fx').newEffect('shadow')];
  const items = catalog.appliedStudioItems(collection);
  assert.deepEqual(items.map(item => item.category), ['creativity', 'effects', 'effects']);
  assert.deepEqual(items.map(item => item.effects[0].id), collection.map(item => item.id));
});

test('Stage B temporary preview Cancel restores the original without creating history', () => {
  const { layer } = freshLayer();
  const original = activeTab(useEditor.getState());
  const changes = [catalog.createStudioFilter('brightness')];
  useEditor.getState().previewStudioEffects(layer.id, changes);
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects?.length ?? 0, 0);
  assert.equal(load('store').studioPreviewLayer(activeTab(useEditor.getState()).doc.id, layer).effects?.length, 1);
  useEditor.getState().cancelStudioEffects();
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects?.length ?? 0, 0);
  assert.equal(activeTab(useEditor.getState()).past.length, original.past.length);
  assert.equal(activeTab(useEditor.getState()).revision, original.revision);
});

test('Stage B Apply commits one history step and undo removes the entire preset chain', () => {
  const { layer } = freshLayer();
  const group = catalog.createStudioPreset('Comic Pop');
  const count = activeTab(useEditor.getState()).past.length;
  useEditor.getState().previewStudioEffects(layer.id, group);
  useEditor.getState().previewStudioEffects(layer.id, [...group].map(item => ({ ...item, amount: item.amount + 1 })));
  const finished = [...group].map(item => ({ ...item, amount: item.amount + 2 }));
  useEditor.getState().commitStudioEffects(layer.id, finished);
  assert.equal(activeTab(useEditor.getState()).past.length, count + 1);
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects.length, finished.length);
  useEditor.getState().undo();
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects?.length ?? 0, 0);
});

test('Stage C corner scaling increases text glyph size, not just movement', () => {
  const shape = { id: 't', kind: 'text', text: 'Hi', x: 12, y: 12, width: 60, height: 30,
    fontSize: 30, fill: '#000000', stroke: 'none', strokeWidth: 0 };
  scaleShape(shape, { x: 12, y: 12, width: 60, height: 30 }, { x: 12, y: 12, width: 120, height: 60 });
  assert.equal(shape.fontSize, 60);
  assert.equal(shape.x, 12);
  assert.equal(shape.width, 120);
});

test('Stage C transformations change display casing, not the editable source', () => {
  assert.equal(transformText('hello world', 'uppercase'), 'HELLO WORLD');
  assert.equal(transformText('HeLLo', 'lowercase'), 'hello');
  assert.equal(transformText('hello world', 'capitalize'), 'Hello World');
  assert.equal(transformText('hello world', 'none'), 'hello world');
  assert.equal(DEFAULT_TEXT_FORMAT.textDecoration, 'none');
});

test('stage C new whole-object text style fields validate when serialized', () => {
  const { doc } = freshLayer();
  const vector = model.makeVector('Text');
  vector.shapes.push({ id: 't', kind: 'text', x: 20, y: 20, width: 50, height: 30,
    fill: '#121212', stroke: 'none', strokeWidth: 0, text: 'Welcome', fontSize: 42,
    textTransform: 'uppercase', textDecoration: 'underline', textShadowBlur: 9,
    textShadowColor: '#112233', textPadding: 8, textBackground: '#ffffff' });
  doc.layers.push(vector);
  assert.equal(model.isDocument(JSON.parse(JSON.stringify(doc))), true);
  vector.shapes[0].textShadowBlur = Infinity;
  assert.equal(model.isDocument(doc), false);
});

test('Focus Text exposes organized styling controls and canvas intercepts text hits', () => {
  const tools = fs.readFileSync(path.join(root, 'src/components/FocusTextTools.tsx'), 'utf8');
  const canvas = fs.readFileSync(path.join(root, 'src/components/Canvas.tsx'), 'utf8');
  const studio = fs.readFileSync(path.join(root, 'src/components/FxStudio.tsx'), 'utf8');
  assert.ok((tools.match(/action\(/g) ?? []).length >= 30, 'Text styling actions must be substantive');
  assert.match(canvas, /textHit = selectableShape/);
  assert.match(canvas, /if \(!event\.ctrlKey\)/);
  assert.match(canvas, /mode: handle === 'rotate' \? 'rotate' : 'scale'/);
  assert.match(studio, /commitStudioEffects/);
  assert.match(studio, /cancelStudioEffects/);
  assert.match(studio, /Applied \{category === 'creativity'/);
});

test('Stage B moving one applied FX icon moves its whole processing group', () => {
  const first = load('fx').newEffect('brightness');
  const preset = catalog.createStudioPreset('Dream Bloom');
  const last = load('fx').newEffect('contrast');
  const result = catalog.moveStudioItem([first, ...preset, last], preset[0].studioGroupId, -1);
  assert.deepEqual(result.slice(0, preset.length).map(item => item.id), preset.map(item => item.id));
  assert.equal(result[preset.length].id, first.id);
  assert.equal(result.at(-1).id, last.id);
});

test('east side handle stretches glyphs horizontally without moving text or font height', () => {
  const shape = { id: 'wide-text', kind: 'text', text: 'Wide', x: 6, y: 10, width: 70,
    height: 24, fontSize: 24, textScaleX: 1, fill: '#ffffff', stroke: 'none', strokeWidth: 0 };
  scaleShape(shape, { x: 6, y: 10, width: 70, height: 24 }, { x: 6, y: 10, width: 140, height: 24 });
  assert.equal(shape.x, 6);
  assert.equal(shape.fontSize, 24);
  assert.equal(shape.width, 140);
  assert.equal(shape.textScaleX, 2);
});
