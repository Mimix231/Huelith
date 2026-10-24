const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const instances = new Map();
const values = new Map();
const browserStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

function load(modulePath) {
  if (instances.has(modulePath)) return instances.get(modulePath);
  const location = path.join(root, `src/editor/${modulePath}.ts`);
  const js = ts.transpileModule(fs.readFileSync(location, 'utf8'), {
    fileName: location,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const dependencies = dependency => {
    if (dependency === 'zustand') return {
      create: initializer => {
        let state;
        const get = () => state;
        const set = action => { state = { ...state, ...(typeof action === 'function' ? action(state) : action) }; };
        state = initializer(set, get);
        const hook = selector => selector ? selector(state) : state;
        hook.getState = get;
        return hook;
      },
    };
    if (!dependency.startsWith('./')) throw new Error(`Unexpected dependency ${dependency}`);
    return load(dependency.slice(2));
  };
  vm.runInNewContext(js, {
    module, exports: module.exports, require: dependencies,
    Map, Set, Date, Math, String, Object, Number, JSON, structuredClone,
    localStorage: browserStorage,
    globalThis: { crypto: require('node:crypto').webcrypto, localStorage: browserStorage },
  }, { filename: location });
  instances.set(modulePath, module.exports);
  return module.exports;
}

const { createDocument, makeVector, isDocument, uid } = load('types');
const { shapePath } = load('parametric-shapes');
const { documentToSVG } = load('svg');
const { handleAt, handleCursor, selectableShape } = load('interaction');
const { EFFECT_CONTROLS, clampEffectAmount, newEffect, FX_PRESETS, effectFilter } = load('fx');
const { useEditor, activeTab } = load('store');
const base = { id: 'geometry', x: 10, y: 10, width: 60, height: 50,
  fill: '#f00000', stroke: '#000000', strokeWidth: 2 };

for (const kind of ['roundedRect', 'triangle', 'polygon', 'star', 'arrow', 'heart', 'ring']) {
  test(`${kind} is an editable document shape and exported as vector geometry`, () => {
    const shape = { ...base, kind, sides: 5, innerRatio: 0.5, cornerRadius: 11 };
    const doc = createDocument('Geometry', 120, 120);
    const layer = makeVector();
    layer.shapes.push(shape);
    doc.layers.push(layer);
    assert.equal(isDocument(doc), true);
    assert.match(shapePath(shape), /^M /);
    const svg = documentToSVG(doc);
    assert.match(svg, /<path d="M /);
    assert.match(svg, /fill-rule="evenodd"/);
    assert.equal(isDocument(JSON.parse(JSON.stringify(doc))), true);
  });
}

test('rotation-aware resize handle cursors do not persist beyond handle radius', () => {
  const bounds = { x: 10, y: 10, width: 80, height: 40 };
  assert.equal(handleAt({ x: 10, y: 10 }, bounds, 0, 1), 'nw');
  assert.equal(handleAt({ x: 70, y: 40 }, bounds, 0, 1), null);
  assert.equal(handleAt({ x: 10, y: 10 }, bounds, 0, 8), 'nw');
  assert.equal(handleCursor('nw'), 'nwse-resize');
  assert.equal(handleCursor('e'), 'ew-resize');
  assert.equal(handleCursor('rotate'), 'crosshair');
  assert.equal(handleCursor('e', 90), 'ns-resize');
  assert.equal(handleAt({ x: 10, y: 10 }, bounds, 90, 1), null);
});

test('hit tests prioritize upper visible unlocked text objects', () => {
  const bottom = makeVector();
  const top = makeVector();
  bottom.shapes.push({ ...base, kind: 'text', text: 'B' });
  top.shapes.push({ ...base, id: 'upper', kind: 'text', text: 'T' });
  assert.equal(selectableShape({ x: 20, y: 20 }, [bottom, top], 1, true).shape.id, 'upper');
  top.locked = true;
  assert.equal(selectableShape({ x: 20, y: 20 }, [bottom, top], 1, true).shape.id, 'geometry');
  bottom.visible = false;
  assert.equal(selectableShape({ x: 20, y: 20 }, [bottom, top], 1, true), null);
});

test('effect descriptors have meaningful independent units and bounds', () => {
  assert.equal(EFFECT_CONTROLS.blur.unit, 'px');
  assert.equal(EFFECT_CONTROLS.hue.max, 360);
  assert.equal(EFFECT_CONTROLS.grayscale.max, 100);
  assert.equal(clampEffectAmount('outline', 500), 100);
  assert.equal(clampEffectAmount('blur', -10), 0);
  assert.equal(effectFilter({ id: uid(), enabled: true, kind: 'blur', amount: 35 }), 'blur(35px)');
  assert.equal(effectFilter({ id: uid(), enabled: true, kind: 'hue', amount: 300 }), 'hue-rotate(300deg)');
});

test('Glitch Matrix exposes deterministic editable scanline and distortion settings', () => {
  const effect = FX_PRESETS['Glitch Matrix'][0];
  assert.ok(effect.parameters.density > 0);
  assert.ok(effect.parameters.scanlines > 0);
  const instance = newEffect(effect.kind, effect.amount, effect.color, effect.parameters);
  assert.equal(instance.parameters.seed, effect.parameters.seed);
});

test('FX slider previews change document without history and commit exactly once', () => {
  const state = useEditor.getState();
  state.newDoc('FX preview', 100, 100, 'transparent');
  const layerId = activeTab(useEditor.getState()).doc.activeLayerId;
  state.addEffect(layerId, 'blur');
  const before = activeTab(useEditor.getState());
  const effectId = before.doc.layers[0].effects[0].id;
  const pastLength = before.past.length;
  for (const amount of [9, 18, 39, 55]) {
    state.previewEffect(layerId, effectId, { amount });
    assert.equal(activeTab(useEditor.getState()).past.length, pastLength);
    assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects[0].amount, amount);
  }
  state.finishEffectPreview();
  assert.equal(activeTab(useEditor.getState()).past.length, pastLength + 1);
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects[0].amount, 55);
  state.undo();
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects[0].amount, 5);
});

test('canceling live FX preview restores previous effects without history', () => {
  const state = useEditor.getState();
  state.newDoc('Cancel FX preview', 64, 64);
  const layerId = activeTab(useEditor.getState()).doc.activeLayerId;
  state.addEffect(layerId, 'brightness');
  const before = activeTab(useEditor.getState());
  const id = before.doc.layers[0].effects[0].id;
  state.previewEffect(layerId, id, { amount: 240 });
  state.cancelEffectPreview();
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects[0].amount, 115);
  assert.equal(activeTab(useEditor.getState()).past.length, before.past.length);
});

test('every top-level menu command has a real, uniquely named entry', () => {
  const content = fs.readFileSync(path.join(root, 'src/commands/menus.ts'), 'utf8');
  const id = [...content.matchAll(/\{ id: '([\w-]+)', label: /g)].map(item => item[1]);
  assert.equal(new Set(id).size, id.length);
  assert.ok(id.includes('export-apng'));
  assert.ok(id.includes('create-vector'));
  assert.ok(content.includes('Effects:'));
  assert.ok(content.includes('Animation:'));
});
