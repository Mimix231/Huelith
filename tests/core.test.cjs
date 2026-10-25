/** Logic-level tests that don't need a DOM or a native WebView. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../src/editor');
const modules = new Map();

function fakeZustand() {
  return {
    create: initializer => {
      let state;
      const get = () => state;
      const set = change => {
        const update = typeof change === 'function' ? change(state) : change;
        state = { ...state, ...update };
      };
      state = initializer(set, get);
      const store = selector => selector ? selector(state) : state;
      store.getState = get;
      return store;
    },
  };
}

function load(name) {
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(root, `${name}.ts`);
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, strict: true },
    reportDiagnostics: true,
  });
  const errors = result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) ?? [];
  assert.equal(errors.length, 0, `TypeScript syntax/transpilation errors in ${name}`);
  const module = { exports: {} };
  const localRequire = specifier => {
    if (specifier === 'zustand') return fakeZustand();
    if (specifier.startsWith('./')) return load(specifier.slice(2));
    throw new Error(`Unexpected test import: ${specifier}`);
  };
  const context = {
    require: localRequire, module, exports: module.exports, structuredClone,
    Date, Math, Set, Map, Array, Object, Number, String, Error,
    globalThis: { crypto: require('node:crypto').webcrypto },
  };
  vm.runInNewContext(result.outputText, context, { filename });
  modules.set(name, module.exports);
  return module.exports;
}

const model = load('types');
const { useEditor, activeTab } = load('store');
const { documentToSVG } = load('svg');

function reset() {
  const st = useEditor.getState();
  st.newDoc('Fixture', 640, 480, '#ffffff');
  return useEditor.getState();
}

test('new Huelith 0.2 documents have a valid stable format and raster layer', () => {
  const doc = model.createDocument('Drawing', 1024, 768, 'transparent');
  assert.equal(doc.format, 'huelith');
  assert.equal(doc.version, 1);
  assert.equal(doc.layers[0].type, 'raster');
  assert.ok(model.isDocument(doc));
});

test('legacy Spectrum-format documents remain readable after the Huelith rename', () => {
  const doc = model.createDocument('Legacy artwork', 32, 32);
  assert.equal(doc.format, 'huelith');
  const legacy = { ...doc, format: 'spectrum' };
  assert.equal(model.isDocument(legacy), true);
  assert.equal(model.isDocument({ ...doc, format: 'not-a-project' }), false);
});

test('dimension limits reject NaN, fractional sizes and oversized canvases', () => {
  assert.equal(model.validSize(1, 1), true);
  for (const [width, height] of [[0, 2], [2, Infinity], [2, NaN], [1.1, 2], [16000, 16000]]) {
    assert.equal(model.validSize(width, height), false);
  }
});

test('document validation rejects bad nested data and unsupported layer types', () => {
  const doc = model.createDocument();
  assert.equal(model.isDocument({ ...doc, layers: [{ id: 'bad', type: 'script' }] }), false);
  assert.equal(model.isDocument({ ...doc, layers: [{ ...doc.layers[0], opacity: 2 }] }), false);
  assert.equal(model.isDocument({ ...doc, layers: [{ ...doc.layers[0], image: '<script>' }] }), false);
  assert.equal(model.isDocument({ ...doc, layers: [doc.layers[0], doc.layers[0]] }), false);
});

test('no-op editor operations do not create phantom undo steps', () => {
  reset();
  const before = activeTab(useEditor.getState());
  useEditor.getState().removeLayer();
  const after = activeTab(useEditor.getState());
  assert.equal(after.past.length, before.past.length);
  assert.equal(after.dirty, false);
});

test('layer creation, duplicate and undo/redo work in order', () => {
  reset();
  useEditor.getState().addLayer('vector');
  assert.equal(activeTab(useEditor.getState()).doc.layers.length, 2);
  useEditor.getState().duplicateLayer();
  assert.equal(activeTab(useEditor.getState()).doc.layers.length, 3);
  assert.notEqual(activeTab(useEditor.getState()).doc.layers[1].id,
    activeTab(useEditor.getState()).doc.layers[2].id);
  useEditor.getState().undo();
  assert.equal(activeTab(useEditor.getState()).doc.layers.length, 2);
  useEditor.getState().redo();
  assert.equal(activeTab(useEditor.getState()).doc.layers.length, 3);
});

test('save is tied to a document ID and revision, even after a tab change', () => {
  reset();
  const previous = activeTab(useEditor.getState());
  useEditor.getState().renameLayer(previous.doc.activeLayerId, 'New name');
  const changed = activeTab(useEditor.getState());
  const revision = changed.revision;
  useEditor.getState().addLayer('vector');
  useEditor.getState().newDoc('Other tab');
  useEditor.getState().markSaved(changed.doc.id, revision, 'example.huelith');
  const target = useEditor.getState().tabs.find(tab => tab.doc.id === changed.doc.id);
  assert.equal(target.path, 'example.huelith');
  assert.equal(target.dirty, true, 'saving an older revision cannot mark newer edits clean');
  assert.equal(activeTab(useEditor.getState()).doc.name, 'Other tab');
});

test('vector shapes are stored relative to the selected layer offset', () => {
  reset();
  useEditor.getState().addLayer('vector');
  const id = activeTab(useEditor.getState()).doc.activeLayerId;
  useEditor.getState().mutate(doc => {
    const layer = doc.layers.find(item => item.id === id);
    layer.x = 50;
    layer.y = 30;
  });
  useEditor.getState().addShape({
    id: 'shape-123', kind: 'line', x: 100, y: 100, width: 20, height: 10,
    fill: 'none', stroke: '#112233', strokeWidth: 2,
  });
  const doc = activeTab(useEditor.getState()).doc;
  const layer = doc.layers.find(item => item.id === id);
  assert.equal(layer.shapes[0].x, 50);
  assert.equal(layer.shapes[0].y, 70);
});

test('vector duplication regenerates shape IDs', () => {
  reset();
  useEditor.getState().addShape({
    id: 'source-shape', kind: 'rect', x: 5, y: 7, width: 10, height: 12,
    fill: '#ffffff', stroke: 'none', strokeWidth: 0,
  });
  useEditor.getState().duplicateLayer();
  const layers = activeTab(useEditor.getState()).doc.layers.filter(item => item.type === 'vector');
  assert.equal(layers.length, 2);
  assert.notEqual(layers[0].shapes[0].id, layers[1].shapes[0].id);
});

test('SVG export escapes potentially unsafe text and preserves vector elements', () => {
  const doc = model.createDocument('SVG');
  doc.layers = [model.makeVector('Logo')];
  doc.layers[0].shapes.push({
    id: 'text-1', kind: 'text', x: 12, y: 8, width: 200, height: 30,
    fill: '#000000', stroke: 'none', strokeWidth: 0, text: '<vector & art> "safe"',
  });
  const markup = documentToSVG(doc);
  assert.ok(markup.includes('&lt;vector &amp; art&gt; &quot;safe&quot;'));
  assert.ok(!markup.includes('<vector & art>'));
  assert.ok(markup.includes('<text '));
});

test('SVG export skips hidden layers and retains group transforms', () => {
  const doc = model.createDocument('Group');
  const child = model.makeVector('Inside');
  child.shapes.push({
    id: 'rect-1', kind: 'rect', x: 4, y: 8, width: 20, height: 30,
    fill: '#ff0000', stroke: 'none', strokeWidth: 0,
  });
  doc.layers = [{
    id: 'group-1', type: 'group', name: 'Group', visible: true, locked: false,
    opacity: 0.5, blend: 'source-over', x: 10, y: 15, children: [child],
  }];
  doc.activeLayerId = 'group-1';
  assert.ok(model.isDocument(doc));
  const svg = documentToSVG(doc);
  assert.ok(svg.includes('transform="translate(10 15)"'));
  assert.ok(svg.includes('<rect '));
  doc.layers[0].visible = false;
  assert.ok(!documentToSVG(doc).includes('<rect x="4"'));
});

test('multiple opened project tabs have unique document identities', () => {
  const source = model.createDocument('Repeated');
  useEditor.getState().openDoc(source);
  const first = activeTab(useEditor.getState()).doc.id;
  useEditor.getState().openDoc(source);
  const second = activeTab(useEditor.getState()).doc.id;
  assert.notEqual(first, second);
});

test('document validation rejects duplicate vector shape IDs', () => {
  const doc = model.createDocument('Dupes');
  const layer = model.makeVector();
  const shape = {
    id: 'duplicate', kind: 'rect', x: 1, y: 1, width: 9, height: 9,
    fill: '#ffffff', stroke: 'none', strokeWidth: 0,
  };
  layer.shapes = [shape, { ...shape }];
  doc.layers.push(layer);
  assert.equal(model.isDocument(doc), false);
});

test('duplicating groups regenerates nested layer and shape IDs', () => {
  reset();
  const state = useEditor.getState();
  state.mutate(doc => {
    const nested = model.makeVector('Nested');
    nested.shapes.push({
      id: 'nested-shape', kind: 'rect', x: 2, y: 2, width: 5, height: 5,
      fill: '#ff00ff', stroke: 'none', strokeWidth: 0,
    });
    doc.layers.push({
      id: 'original-group', type: 'group', name: 'Group', visible: true, locked: false,
      opacity: 1, blend: 'source-over', x: 0, y: 0, children: [nested],
    });
    doc.activeLayerId = 'original-group';
  });
  useEditor.getState().duplicateLayer();
  assert.equal(model.isDocument(activeTab(useEditor.getState()).doc), true);
});

test('raster SVG exports its intrinsic image dimensions, not a stretched document size', () => {
  const doc = model.createDocument('Image', 640, 480);
  doc.layers[0].image = 'data:image/png;base64,AA==';
  doc.layers[0].imageWidth = 240;
  doc.layers[0].imageHeight = 120;
  const markup = documentToSVG(doc);
  assert.ok(markup.includes('width="240" height="120"'));
});

test('editing a vector text object can be undone and redone', () => {
  reset();
  useEditor.getState().addShape({
    id: 'editable-label', kind: 'text', x: 12, y: 18, width: 150, height: 40,
    fill: '#112233', stroke: 'none', strokeWidth: 0, fontSize: 40, text: 'First',
  });
  useEditor.getState().updateShape('editable-label', shape => { shape.text = 'Second'; });
  const text = () => activeTab(useEditor.getState()).doc.layers
    .filter(layer => layer.type === 'vector')[0].shapes[0].text;
  assert.equal(text(), 'Second');
  useEditor.getState().undo();
  assert.equal(text(), 'First');
  useEditor.getState().redo();
  assert.equal(text(), 'Second');
});
