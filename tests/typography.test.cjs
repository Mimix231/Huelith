/** Regression coverage for text drafts: one undo step, font changes, cancellation, tabs. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../src/editor');
const cache = new Map();

function createStore(initializer) {
  let state;
  const get = () => state;
  const set = update => {
    state = { ...state, ...(typeof update === 'function' ? update(state) : update) };
  };
  state = initializer(set, get);
  const store = selector => selector ? selector(state) : state;
  store.getState = get;
  return store;
}

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.join(root, `${name}.ts`);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const dom = {
    createElement: () => ({
      getContext: () => ({
        font: '',
        measureText: text => ({ width: text.length * 26 }),
      }),
    }),
  };
  const context = {
    require: specifier => specifier === 'zustand' ? { create: createStore }
      : specifier.startsWith('./') ? load(specifier.slice(2)) : (() => { throw Error(specifier); })(),
    exports: module.exports,
    module,
    document: dom,
    structuredClone,
    Date,
    Math,
    Set,
    Map,
    Number,
    String,
    globalThis: { crypto: require('node:crypto').webcrypto },
  };
  vm.runInNewContext(source, context, { filename });
  cache.set(name, module.exports);
  return module.exports;
}

const { useEditor, activeTab } = load('store');
const { DEFAULT_TEXT_FORMAT, normalizeTextFormat } = load('typography');
const { normalizeFontFamilies, fontCssFamily } = load('fonts');

function start(text = '') {
  useEditor.getState().newDoc('Text case', 640, 360);
  const state = useEditor.getState();
  state.setTool('text');
  state.startTextDraft({
    ...DEFAULT_TEXT_FORMAT,
    sessionId: `draft-${Date.now()}`,
    documentId: activeTab(state).doc.id,
    id: null,
    layerId: null,
    x: 100,
    y: 80,
    value: text,
  });
  return useEditor.getState();
}

function texts(doc) {
  return doc.layers.flatMap(layer => layer.type === 'vector'
    ? layer.shapes.filter(shape => shape.kind === 'text') : []);
}

test('draft typing and font changes do not flood project history', () => {
  const state = start();
  const before = activeTab(state).past.length;
  state.changeTextDraft({ value: 'Hello\nWorld' });
  state.setTextFormat({ fontFamily: 'Georgia', fontSize: 42, fontStyle: 'italic' });
  assert.equal(activeTab(useEditor.getState()).past.length, before);
  assert.equal(texts(activeTab(useEditor.getState()).doc).length, 0);
  assert.equal(useEditor.getState().textDraft.value, 'Hello\nWorld');
  useEditor.getState().commitTextDraft();
  const after = activeTab(useEditor.getState());
  assert.equal(after.past.length, before + 1);
  assert.equal(texts(after.doc).length, 1);
  assert.equal(texts(after.doc)[0].fontFamily, 'Georgia');
  assert.equal(texts(after.doc)[0].fontStyle, 'italic');
  assert.equal(texts(after.doc)[0].text, 'Hello\nWorld');
  useEditor.getState().undo();
  assert.equal(texts(activeTab(useEditor.getState()).doc).length, 0);
  useEditor.getState().redo();
  assert.equal(texts(activeTab(useEditor.getState()).doc).length, 1);
});

test('canceling new text avoids a blank shape and unnecessary history', () => {
  const state = start('Temporary');
  const revision = activeTab(state).revision;
  state.cancelTextDraft();
  assert.equal(activeTab(useEditor.getState()).revision, revision);
  assert.equal(useEditor.getState().textDraft, null);
  assert.equal(texts(activeTab(useEditor.getState()).doc).length, 0);
});

test('editing text is atomic and keeps its shape ID and position', () => {
  const state = start('First');
  state.commitTextDraft();
  const original = texts(activeTab(useEditor.getState()).doc)[0];
  const layer = activeTab(useEditor.getState()).doc.layers.find(item =>
    item.type === 'vector' && item.shapes.some(shape => shape.id === original.id));
  const before = activeTab(useEditor.getState()).past.length;
  useEditor.getState().startTextDraft({
    ...DEFAULT_TEXT_FORMAT,
    sessionId: 'edit-old', id: original.id,
    layerId: layer.id, documentId: activeTab(useEditor.getState()).doc.id,
    x: original.x, y: original.y, value: original.text,
  });
  useEditor.getState().changeTextDraft({ value: 'Changed!' });
  useEditor.getState().commitTextDraft();
  const tab = activeTab(useEditor.getState());
  assert.equal(tab.past.length, before + 1);
  assert.equal(texts(tab.doc)[0].id, original.id);
  assert.equal(texts(tab.doc)[0].x, original.x);
  assert.equal(texts(tab.doc)[0].text, 'Changed!');
});

test('switching documents commits text to its origin document', () => {
  const state = start('Original document text');
  const source = activeTab(state).doc.id;
  state.newDoc('Second document');
  // The editing draft belongs to source, not the currently active document.
  useEditor.getState().commitTextDraft();
  const old = useEditor.getState().tabs.find(tab => tab.doc.id === source);
  assert.equal(texts(old.doc).length, 1);
  assert.equal(texts(activeTab(useEditor.getState()).doc).length, 0);
});

test('font normalization deduplicates and strips empty font names', () => {
  assert.deepEqual([...normalizeFontFamilies([' Georgia ', '', 'Arial', 'Arial', 'Georgia'])], ['Arial', 'Georgia']);
  assert.equal(fontCssFamily('Some "Font"'), '"Some Font", sans-serif');
});

test('text sizing clamps invalid values and retains paragraph alignment', () => {
  const format = normalizeTextFormat({ ...DEFAULT_TEXT_FORMAT,
    fontSize: Number.POSITIVE_INFINITY, lineHeight: -1, letterSpacing: 900, textAlign: 'center',
  });
  assert.equal(format.fontSize, 48);
  assert.equal(format.lineHeight, 0.6);
  assert.equal(format.letterSpacing, 100);
  assert.equal(format.textAlign, 'center');
});

test('Tauri window declares decoration-free header and native window permission rules', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(root, '../../src-tauri/tauri.conf.json'), 'utf8'));
  const caps = JSON.parse(fs.readFileSync(path.resolve(root, '../../src-tauri/capabilities/default.json'), 'utf8'));
  assert.equal(config.app.windows[0].decorations, false);
  for (const action of ['close', 'minimize', 'toggle-maximize', 'start-dragging']) {
    assert.ok(caps.permissions.includes(`core:window:allow-${action}`));
  }
});

test('SVG export retains editable multiline text, font family and italic style', () => {
  const state = start('First line\nSecond line');
  state.setTextFormat({ fontFamily: 'Georgia', fontStyle: 'italic' });
  state.commitTextDraft();
  const { documentToSVG } = load('svg');
  const output = documentToSVG(activeTab(useEditor.getState()).doc);
  assert.ok(output.includes('font-family="Georgia"'));
  assert.ok(output.includes('font-style="italic"'));
  assert.ok(output.includes('<tspan'));
});
