const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../src/editor');
const modules = new Map();
const storage = new Map();
const browserStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};

function fakeZustand() {
  return {
    create: initializer => {
      let state;
      const get = () => state;
      const set = action => {
        const update = typeof action === 'function' ? action(state) : action;
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
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  const localRequire = specifier => {
    if (specifier === 'zustand') return fakeZustand();
    if (specifier.startsWith('./')) return load(specifier.slice(2));
    throw new Error(`Unexpected module: ${specifier}`);
  };
  const context = {
    require: localRequire, module, exports: module.exports, Date, Math,
    Set, Map, Number, String, structuredClone,
    globalThis: { crypto: require('node:crypto').webcrypto, localStorage: browserStorage },
    localStorage: browserStorage,
  };
  vm.runInNewContext(result.outputText, context, { filename });
  modules.set(name, module.exports);
  return module.exports;
}

const geometry = load('geometry');
const operations = load('operations');
const model = load('types');
const { useEditor, activeTab, trimHistory } = load('store');
const { documentToSVG } = load('svg');

function reset() {
  useEditor.getState().newDoc('Features', 100, 90, 'transparent');
  return useEditor.getState();
}

test('marquee bounds normalize reverse drags and contain their borders', () => {
  const box = geometry.normalizeRect({ x: 30, y: 25 }, { x: 5, y: 8 });
  assert.deepEqual(JSON.parse(JSON.stringify(box)), { x: 5, y: 8, width: 25, height: 17 });
  assert.equal(geometry.contains(box, { x: 5, y: 8 }), true);
  assert.equal(geometry.contains(box, { x: 31, y: 24 }), false);
});

test('cubic Bézier smoothing creates editable handles', () => {
  const nodes = geometry.smoothPath([{ x: 0, y: 0 }, { x: 30, y: 30 }, { x: 60, y: 0 }]);
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].in, undefined);
  assert.ok(nodes[0].out.x > 0);
  assert.ok(nodes[1].in.x < nodes[1].x);
  assert.ok(nodes[1].out.x > nodes[1].x);
  assert.equal(nodes[2].out, undefined);
});

test('moving a cubic path moves anchor points and both control handles', () => {
  const shape = {
    x: 0, y: 0, width: 10, height: 10, kind: 'path',
    nodes: [{ x: 1, y: 2, out: { x: 3, y: 4 } }, { x: 8, y: 7, in: { x: 6, y: 5 } }],
  };
  geometry.translateShape(shape, 10, -2);
  assert.equal(shape.nodes[0].x, 11);
  assert.equal(shape.nodes[0].out.y, 2);
  assert.equal(shape.nodes[1].in.x, 16);
});

test('resizing a path preserves node editing and scales handles', () => {
  const shape = {
    x: 0, y: 0, width: 10, height: 10, kind: 'path',
    nodes: [{ x: 0, y: 0, out: { x: 5, y: 3 } }, { x: 10, y: 10, in: { x: 7, y: 7 } }],
  };
  geometry.scaleShape(shape, { x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 20, width: 20, height: 40 });
  assert.equal(shape.nodes[0].out.x, 20);
  assert.equal(shape.nodes[0].out.y, 32);
  assert.equal(shape.nodes[1].in.x, 24);
  assert.equal(shape.nodes[1].in.y, 48);
});

test('rotation is reversible around the chosen center', () => {
  const original = { x: 20, y: 10 };
  const center = { x: 10, y: 10 };
  const rotated = geometry.rotate(original, center, 90);
  assert.ok(Math.abs(rotated.x - 10) < 1e-9);
  assert.ok(Math.abs(rotated.y - 20) < 1e-9);
  const recovered = geometry.rotate(rotated, center, -90);
  assert.ok(Math.hypot(recovered.x - original.x, recovered.y - original.y) < 1e-9);
});

test('validated .spectrum documents preserve cubic nodes, masks and raster transforms', () => {
  const doc = model.createDocument();
  doc.layers[0].mask = { x: 1, y: 2, width: 40, height: 50 };
  doc.layers[0].scaleX = 0.5;
  doc.layers[0].scaleY = 2;
  doc.layers[0].rotation = 15;
  const vector = model.makeVector();
  vector.shapes.push({
    id: 'bezier', kind: 'path', x: 0, y: 0, width: 30, height: 20,
    fill: 'none', stroke: '#ff0000', strokeWidth: 2,
    nodes: [{ x: 0, y: 0, out: { x: 8, y: 5 } }, { x: 30, y: 20, in: { x: 22, y: 15 } }],
  });
  doc.layers.push(vector);
  assert.equal(model.isDocument(doc), true);
  doc.layers[0].scaleX = -1;
  assert.equal(model.isDocument(doc), false);
  doc.layers[0].scaleX = 1;
  vector.shapes[0].nodes[0].in = { x: Infinity, y: 2 };
  assert.equal(model.isDocument(doc), false);
});

test('SVG serializes true cubic paths without flattening vector geometry', () => {
  const doc = model.createDocument();
  const vector = model.makeVector();
  vector.shapes.push({
    id: 'curve', kind: 'path', x: 0, y: 0, width: 30, height: 20,
    fill: 'none', stroke: '#ff0000', strokeWidth: 2,
    nodes: [{ x: 0, y: 0, out: { x: 8, y: 5 } }, { x: 30, y: 20, in: { x: 22, y: 15 } }],
  });
  doc.layers.push(vector);
  const svg = documentToSVG(doc);
  assert.match(svg, /<path d="M 0 0 C 8 5 22 15 30 20"/);
});

test('SVG mask offsets remain aligned with translated layers', () => {
  const doc = model.createDocument();
  const layer = doc.layers[0];
  layer.x = 11;
  layer.y = 20;
  layer.mask = { x: 12, y: 24, width: 33, height: 40 };
  const svg = documentToSVG(doc);
  assert.match(svg, /<rect x="1" y="4" width="33" height="40"/);
  assert.match(svg, /clip-path="url\(#clip-/);
});

test('SVG raster transform is expressed in image dimensions', () => {
  const doc = model.createDocument();
  const layer = doc.layers[0];
  layer.image = 'data:image/png;base64,AAA=';
  layer.imageWidth = 20;
  layer.imageHeight = 30;
  layer.scaleX = 2;
  layer.scaleY = 0.5;
  layer.rotation = 30;
  const svg = documentToSVG(doc);
  assert.match(svg, /width="40" height="15" transform="rotate\(30 20 7.5\)"/);
});

test('layers accept blend modes, rectangular masks and reversible changes', () => {
  reset();
  const before = activeTab(useEditor.getState());
  const id = before.doc.activeLayerId;
  useEditor.getState().setSelection({ x: 10, y: 12, width: 20, height: 22 });
  useEditor.getState().applySelectionMask(id);
  useEditor.getState().setLayerBlend(id, 'multiply');
  let layer = activeTab(useEditor.getState()).doc.layers[0];
  assert.equal(layer.mask.width, 20);
  assert.equal(layer.blend, 'multiply');
  useEditor.getState().undo();
  layer = activeTab(useEditor.getState()).doc.layers[0];
  assert.equal(layer.blend, 'source-over');
  assert.equal(layer.mask.height, 22);
  useEditor.getState().undo();
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].mask, undefined);
});

test('applying an empty selection mask does not create history', () => {
  reset();
  const initial = activeTab(useEditor.getState());
  useEditor.getState().setSelection(null);
  useEditor.getState().applySelectionMask(initial.doc.activeLayerId);
  assert.equal(activeTab(useEditor.getState()).past.length, 0);
});

test('undo back to last saved document returns to clean status', () => {
  reset();
  const state = useEditor.getState();
  const id = activeTab(state).doc.activeLayerId;
  state.renameLayer(id, 'First');
  const saved = activeTab(useEditor.getState());
  state.markSaved(saved.doc.id, saved.revision, 'drawing.spectrum');
  state.renameLayer(id, 'Second');
  assert.equal(activeTab(useEditor.getState()).dirty, true);
  state.undo();
  assert.equal(activeTab(useEditor.getState()).dirty, false);
});

test('history budget retains newest step and limits old snapshots', () => {
  const doc = model.createDocument();
  doc.layers[0].image = 'x'.repeat(2_000_000);
  const history = Array.from({ length: 40 }, (_, index) => ({ ...doc, id: `history-${index}` }));
  const limited = trimHistory(history);
  assert.ok(limited.length <= 12);
  assert.equal(limited.at(-1).id, 'history-39');
});

test('theme selection and layout settings persist without affecting documents', () => {
  const state = reset();
  state.setWorkspace('material');
  state.setToolsOpen(false);
  state.setInspectorOpen(false);
  state.setInspectorWidth(313);
  state.saveInspectorWidth();
  assert.equal(storage.get('spectrum-theme'), 'material');
  const layout = JSON.parse(storage.get('spectrum-layout'));
  assert.equal(layout.toolsOpen, false);
  assert.equal(layout.inspectorOpen, false);
  assert.equal(layout.inspectorWidth, 313);
  assert.equal(model.isDocument(activeTab(useEditor.getState()).doc), true);
});

test('three theme stylesheets use distinct layout treatments, not recolors', () => {
  const styles = ['glass', 'material', 'classic'].map(name =>
    fs.readFileSync(path.join(__dirname, `../src/styles/${name}.css`), 'utf8'));
  assert.ok(styles.every((source, index) => source.includes(`.theme-${['glass', 'material', 'classic'][index]}`)));
  assert.match(styles[0], /backdrop-filter/);
  assert.match(styles[1], /border-radius: 17px/);
  assert.match(styles[2], /repeating-linear-gradient/);
  assert.equal(new Set(styles).size, 3);
});

test('drag previews never mutate saved layers and commit yields the same result', () => {
  const layer = model.makeVector();
  layer.shapes.push({
    id: 'object', kind: 'rect', x: 2, y: 4, width: 15, height: 18,
    fill: '#123456', stroke: 'none', strokeWidth: 0,
  });
  const drag = { kind: 'move', shapeId: 'object', dx: 20, dy: 30 };
  const first = operations.previewDrag(layer, drag, 100, 100);
  const second = operations.previewDrag(layer, drag, 100, 100);
  assert.equal(layer.shapes[0].x, 2);
  assert.equal(first.shapes[0].x, 22);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
});

test('corner resize maintains opposite anchors', () => {
  const bounds = { x: 10, y: 20, width: 50, height: 60 };
  const resized = operations.computeResize(bounds, 'nw', { x: 20, y: 30 });
  assert.equal(resized.x, 20);
  assert.equal(resized.y, 30);
  assert.equal(resized.width, 40);
  assert.equal(resized.height, 50);
});

test('raster transform preview scales without modifying encoded source', () => {
  const layer = model.makeRaster();
  layer.image = 'data:image/png;base64,AAA=';
  layer.imageWidth = 40;
  layer.imageHeight = 60;
  const updated = operations.previewDrag(layer, {
    kind: 'transform', shapeId: null, mode: 'scale', handle: 'se',
    start: { x: 40, y: 60 }, last: { x: 80, y: 90 },
    bounds: { x: 0, y: 0, width: 40, height: 60 },
  }, 100, 100);
  assert.equal(updated.scaleX, 2);
  assert.equal(updated.scaleY, 1.5);
  assert.equal(updated.image, layer.image);
  assert.equal(layer.scaleX, undefined);
});

test('node control dragging preserves the anchor while moving one handle', () => {
  const layer = model.makeVector();
  layer.shapes.push({
    id: 'path', kind: 'path', x: 0, y: 0, width: 10, height: 10,
    strokeWidth: 1, stroke: '#fff', fill: 'none',
    nodes: [{ x: 5, y: 5, out: { x: 8, y: 5 } }, { x: 10, y: 10 }],
  });
  const result = operations.previewDrag(layer, {
    kind: 'node', shapeId: 'path', index: 0, handle: 'out', dx: 3, dy: 4,
  }, 100, 100);
  assert.equal(result.shapes[0].nodes[0].x, 5);
  assert.equal(result.shapes[0].nodes[0].out.x, 11);
  assert.equal(layer.shapes[0].nodes[0].out.x, 8);
});

test('SVG multiline text is exported as separate tspans with escaped content', () => {
  const doc = model.createDocument();
  const vector = model.makeVector();
  vector.shapes.push({
    id: 'label', kind: 'text', x: 5, y: 12, width: 60, height: 50,
    fill: '#334455', stroke: 'none', strokeWidth: 0,
    text: 'Hello\n<world>', fontSize: 18,
  });
  doc.layers.push(vector);
  const svg = documentToSVG(doc);
  assert.match(svg, /Hello<tspan x="5" dy="1.25em">&lt;world&gt;<\/tspan>/);
});

test('four-point line control geometry moves each handle independently', () => {
  const layer = model.makeVector('Line');
  layer.shapes.push({
    id: 'curve', kind: 'line', x: 10, y: 20, width: 70, height: 0,
    controls: [{ x: 25, y: -20 }, { x: 65, y: -20 }],
    fill: 'none', stroke: '#ffffff', strokeWidth: 4,
  });
  const preview = operations.previewDrag(layer, {
    kind: 'line-point', shapeId: 'curve', index: 1, dx: 0, dy: 23,
  }, 100, 90);
  assert.notEqual(preview, layer);
  assert.equal(layer.shapes[0].controls[0].y, -20);
  assert.equal(preview.shapes[0].controls[0].y, 3);
  assert.equal(preview.shapes[0].controls[1].y, -20);
  const endpoint = operations.previewDrag(preview, {
    kind: 'line-point', shapeId: 'curve', index: 3, dx: 12, dy: 15,
  }, 100, 90);
  assert.equal(endpoint.shapes[0].width, 82);
  assert.equal(endpoint.shapes[0].height, 15);
  const start = operations.previewDrag(endpoint, {
    kind: 'line-point', shapeId: 'curve', index: 0, dx: 5, dy: 6,
  }, 100, 90);
  assert.equal(start.shapes[0].x, 15);
  assert.equal(start.shapes[0].width, 77);
});

test('four-point curves preserve control coordinates under vector transforms and SVG export', () => {
  const shape = {
    id: 'curve-svg', kind: 'line', x: 5, y: 5, width: 45, height: 45,
    controls: [{ x: 5, y: -25 }, { x: 50, y: -25 }],
    fill: 'none', stroke: '#00aaee', strokeWidth: 2,
  };
  geometry.translateShape(shape, 8, 4);
  assert.equal(shape.controls[0].x, 13);
  geometry.scaleShape(shape, geometry.shapeBounds(shape), { x: 0, y: 0, width: 90, height: 100 });
  assert.ok(shape.controls[0].x < shape.controls[1].x);
  const doc = model.createDocument('Curve', 200, 200);
  const vector = model.makeVector('Cubic');
  vector.shapes = [shape];
  doc.layers.push(vector);
  assert.equal(model.isDocument(doc), true);
  assert.match(documentToSVG(doc), /<path d="M [\d.-]+ [\d.-]+ C [\d.-]+ [\d.-]+/);
});

test('new independent signature FX can be reordered with traditional filter, bounded and undone', () => {
  const { newEffect, FX_PRESETS, effectFilter } = load('fx');
  const state = reset();
  const id = activeTab(state).doc.activeLayerId;
  const recipe = FX_PRESETS['Neon Pulse'][0];
  const effects = [newEffect(recipe.kind, recipe.amount, recipe.color, recipe.parameters), newEffect('brightness')];
  state.appendEffects(id, effects);
  let layer = activeTab(useEditor.getState()).doc.layers.at(-1);
  assert.equal(layer.effects.length, 2);
  assert.equal(layer.effects[0].kind, 'sig_1');
  assert.equal(model.isDocument(activeTab(useEditor.getState()).doc), true);
  useEditor.getState().moveEffect(id, layer.effects[0].id, 1);
  layer = activeTab(useEditor.getState()).doc.layers.at(-1);
  assert.equal(layer.effects[0].kind, 'brightness');
  useEditor.getState().updateEffect(id, layer.effects[1].id, { amount: 999 });
  assert.equal(activeTab(useEditor.getState()).doc.layers.at(-1).effects[1].amount, 100);
  assert.equal(effectFilter({ kind: 'brightness', amount: 130, enabled: true }), 'brightness(130%)');
  useEditor.getState().undo();
  useEditor.getState().undo();
  layer = activeTab(useEditor.getState()).doc.layers.at(-1);
  assert.equal(layer.effects[0].kind, 'sig_1');
  assert.equal(layer.effects.length, 2);
});

test('malformed effect stacks are rejected from untrusted .spectrum files', () => {
  const doc = model.createDocument();
  doc.layers[0].effects = [{ id: 'ok', kind: 'glow', amount: 25, enabled: true }];
  assert.equal(model.isDocument(doc), true);
  doc.layers[0].effects[0].amount = Infinity;
  assert.equal(model.isDocument(doc), false);
  doc.layers[0].effects[0].amount = 20;
  doc.layers[0].effects[0].kind = 'execute-code';
  assert.equal(model.isDocument(doc), false);
});

test('additional theme identifiers persist as independent workspaces', () => {
  useEditor.getState().setWorkspace('midnight');
  assert.equal(useEditor.getState().workspace, 'midnight');
  assert.equal(browserStorage.getItem('spectrum-theme'), 'midnight');
  useEditor.getState().setWorkspace('studio');
  assert.equal(browserStorage.getItem('spectrum-theme'), 'studio');
});

test('edge resize handles change a single dimension without moving the opposite edge', () => {
  const bounds = { x: 10, y: 20, width: 80, height: 60 };
  const north = operations.computeResize(bounds, 'n', { x: 50, y: 5 });
  assert.equal(north.x, 10);
  assert.equal(north.width, 80);
  assert.equal(north.height, 75);
  const east = operations.computeResize(bounds, 'e', { x: 105, y: 45 });
  assert.equal(east.y, 20);
  assert.equal(east.height, 60);
  assert.equal(east.width, 95);
});


test('a workspace preserves brightness selection independently from documents', () => {
  const state = reset();
  const before = activeTab(state).doc;
  state.setWorkspace('strawberry');
  state.setAppearanceMode('dark');
  assert.equal(browserStorage.getItem('spectrum-theme'), 'strawberry');
  assert.equal(useEditor.getState().appearanceMode, 'dark');
  assert.equal(JSON.parse(browserStorage.getItem('spectrum-layout')).appearanceMode, 'dark');
  state.setAppearanceMode('light');
  assert.equal(useEditor.getState().appearanceMode, 'light');
  assert.equal(activeTab(useEditor.getState()).doc, before);
});

test('drag reordering document tabs leaves their IDs, edits and active selection intact', () => {
  reset();
  const state = useEditor.getState();
  const first = state.activeId;
  state.newDoc('Second tab', 32, 32);
  const second = useEditor.getState().activeId;
  state.reorderTabs(second, first);
  const after = useEditor.getState();
  assert.equal(after.tabs.findIndex(tab => tab.doc.id === second) + 1,
    after.tabs.findIndex(tab => tab.doc.id === first));
  assert.equal(after.activeId, second);
  assert.equal(after.tabs.find(tab => tab.doc.id === first).doc.width, 100);
  state.reorderTabs('missing', second);
  assert.equal(useEditor.getState().tabs.findIndex(tab => tab.doc.id === second) + 1,
    useEditor.getState().tabs.findIndex(tab => tab.doc.id === first));
});

test('new filter kinds are valid non-destructive effects in saved project documents', () => {
  const state = reset();
  const layer = activeTab(state).doc.layers[0];
  for (const kind of ['invert', 'pixelate', 'posterize', 'vignette']) state.addEffect(layer.id, kind);
  const next = activeTab(useEditor.getState()).doc;
  assert.equal(model.isDocument(next), true);
  assert.deepEqual(Array.from(next.layers[0].effects, effect => effect.kind),
    ['invert', 'pixelate', 'posterize', 'vignette']);
  useEditor.getState().undo();
  assert.equal(activeTab(useEditor.getState()).doc.layers[0].effects.length, 3);
});


test('brush stabilization follows pointer exactly at zero smoothing and finishes precisely', () => {
  const brush = load('brush');
  const old = { x: 20, y: 10 };
  const next = { x: 100, y: 50 };
  const smooth = brush.stabilizedPoint(old, next, 0.6);
  assert.equal(smooth.x, 52);
  assert.equal(smooth.y, 26);
  assert.deepEqual(JSON.parse(JSON.stringify(brush.stabilizedPoint(old, next, 0))), next);
  assert.deepEqual(JSON.parse(JSON.stringify(brush.stabilizedPoint(old, next, 0.95, true))), next);
});


test('before-after FX comparison is temporary and never changes saved document data', () => {
  const state = reset();
  const doc = activeTab(state).doc;
  const id = doc.layers[0].id;
  state.addEffect(id, 'blur');
  const active = useEditor.getState();
  const before = activeTab(active).doc;
  active.setFxBypassLayer(id);
  assert.equal(useEditor.getState().fxBypassLayerId, id);
  assert.equal(activeTab(useEditor.getState()).doc, before);
  assert.equal(before.layers[0].effects.length, 1);
  active.setFxBypassLayer(null);
  assert.equal(useEditor.getState().fxBypassLayerId, null);
});
