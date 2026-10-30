const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = filename => fs.readFileSync(path.join(root, filename), 'utf8');
const modules = new Map();
function load(name) {
  name = name.replace(/^\.\//, '');
  if (modules.has(name)) return modules.get(name);
  const file = path.join(root, 'src/editor', name + '.ts');
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {fileName:file,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{}};
  modules.set(name, mod.exports);
  new Function('require','module','exports',out)(specifier => load(path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier))),mod,mod.exports);
  modules.set(name, mod.exports);
  return mod.exports;
}
const types = load('types');
const creative = load('creative');
test('fifteen independent Originals are valid, editable and serializable', () => {
  assert.equal(creative.CREATIVE_DEFINITIONS.length, 15);
  assert.equal(new Set(creative.CREATIVE_DEFINITIONS.map(def => def.kind)).size, 15);
  for (const def of creative.CREATIVE_DEFINITIONS) {
    const created = creative.newCreative(def.kind, 400, 300);
    assert.equal(created.kind,def.kind);
    assert.ok(creative.validCreative(JSON.parse(JSON.stringify(created))),def.kind);
  }
});
test('sampled background can be saved, invalid colors rejected and legacy projects open', () => {
  const doc = types.createDocument('sample');
  doc.layers[0].effects = [{id:'e',kind:'cutout',enabled:true,amount:32,
    parameters:{backgroundSampleColor:'#ffffff',backgroundEdgeGuard:24,backgroundAuto:1,maskStrokes:[]}}];
  assert.ok(types.isDocument(JSON.parse(JSON.stringify(doc))));
  doc.layers[0].effects[0].parameters.backgroundSampleColor = 'javascript:alert(1)';
  assert.equal(types.isDocument(doc), false);
  doc.layers[0].effects[0].parameters.backgroundSampleColor = '#ffffff';
  doc.format='spectrum';
  assert.ok(types.isDocument(doc));
});
test('adjustment and clipping layers are validated, originals stay unmodified', () => {
  const doc=types.createDocument('layer workflow');
  const layer=types.makeVector('Adjustment');
  layer.adjustment=true;
  layer.effects=[{id:'b',kind:'brightness',enabled:true,amount:100}];
  layer.clipToBelow=false;
  doc.layers.push(layer);doc.activeLayerId=layer.id;
  assert.ok(types.isDocument(JSON.parse(JSON.stringify(doc))));
  layer.clipToBelow='arbitrary';
  assert.equal(types.isDocument(doc),false);
});
test('Gradient remains a standalone tool while Shape Studio contains shapes only', () => {
  const app=source('src/App.tsx');
  assert.match(app, /id: 'gradient', label: 'Gradient'/);
  assert.doesNotMatch(app, /SHAPE_TOOL_IDS = \[[^\]]*gradient/);
  assert.doesNotMatch(app, /tools\.filter\(option => \['gradient'/);
  assert.match(app, /huelith-color-pair/);
  assert.match(app, /huelith-color-actions/);
});
test('new Originals have specific processors and editable paths', () => {
  const render=source('src/editor/originals-expansion.ts');
  for (const key of ['particleGarden','warpCage','lightTrails','patternArchitect','gradientReactor']) {
    assert.match(render, new RegExp("case '" + key + "'"));
  }
  assert.match(source('src/components/CreativeLab.tsx'),/Editable path nodes/);
});
test('text styling includes local presets and layers have grouping, clipping and adjustments', () => {
  const textTools=source('src/components/FocusTextTools.tsx');
  assert.match(textTools,/huelith-text-presets-v1/);
  assert.match(textTools,/Rotate \+15/);
  const store=source('src/editor/store.ts');
  for (const action of ['groupSelectedLayer','ungroupSelectedLayer','setClipToBelow','addAdjustmentLayer'])
    assert.match(store,new RegExp(action));
  const render=source('src/editor/render.ts');
  assert.match(render,/export function renderClippedLayer/);
  assert.match(render,/export function applyAdjustmentLayer/);
});
