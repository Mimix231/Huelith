const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '../src/editor');
const modules = new Map();
function load(name) {
  name = name.replace(/^\.\//, '');
  if (modules.has(name)) return modules.get(name);
  const file = path.join(root, `${name}.ts`);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  modules.set(name, mod.exports);
  new Function('require', 'module', 'exports', source)(dependency => load(require('node:path').posix.normalize(require('node:path').posix.join(require('node:path').posix.dirname(name),dependency))), mod, mod.exports);
  modules.set(name, mod.exports);
  return mod.exports;
}
const { createDocument, isDocument } = load('types');
const { CREATIVE_DEFINITIONS, newCreative, evaluatedCreative, setCreativeKeyframe, creativeDefinition, validCreative } = load('creative');
const { enableAnimation, frameDocument, insertFrame, selectFrame } = load('animation');

test('all fifteen Originals have distinct registered interfaces and numeric controls', () => {
  assert.equal(CREATIVE_DEFINITIONS.length, 15);
  assert.equal(new Set(CREATIVE_DEFINITIONS.map(item => item.kind)).size, 15);
  for (const def of CREATIVE_DEFINITIONS) {
    assert.ok(def.description.length > 20, def.kind);
    assert.ok(Object.keys(def.controls).length >= 3, def.kind);
    const obj = newCreative(def.kind, 1280, 720, 'layer-id');
    assert.ok(validCreative(obj), def.kind);
    assert.equal(creativeDefinition(def.kind), def);
  }
});

test('creative objects survive JSON round trips without changing original static documents', () => {
  const baseline = createDocument('Historical project');
  assert.ok(isDocument(baseline));
  const copy = JSON.parse(JSON.stringify(baseline));
  copy.creative = CREATIVE_DEFINITIONS.map(def => newCreative(def.kind, 1280, 720));
  assert.ok(isDocument(copy));
  assert.equal(JSON.stringify(baseline), JSON.stringify(createComparable(baseline)));
  function createComparable(value) { return JSON.parse(JSON.stringify(value)); }
});

test('animation keyframes interpolate numeric values and both RGB colors', () => {
  const light = newCreative('lightSculptor', 800, 600);
  light.x = 10;
  light.color = '#000000';
  setCreativeKeyframe(light, 'x', 0);
  setCreativeKeyframe(light, 'color', 0);
  light.x = 110;
  light.color = '#ffffff';
  setCreativeKeyframe(light, 'x', 10);
  setCreativeKeyframe(light, 'color', 10);
  assert.equal(evaluatedCreative(light, 0).x, 10);
  assert.equal(evaluatedCreative(light, 5).x, 60);
  assert.equal(evaluatedCreative(light, 5).color, '#808080');
  assert.equal(evaluatedCreative(light, 10).x, 110);
  assert.equal(evaluatedCreative(light, 20).x, 110);
});

test('frames retain shared Originals while independent cels remain editable', () => {
  const doc = createDocument('Animated', 600, 400);
  doc.creative = [newCreative('paletteFlow', 600, 400)];
  enableAnimation(doc, 12);
  doc.creative[0].controls.speed = 10;
  setCreativeKeyframe(doc.creative[0], 'speed', 0);
  assert.equal(insertFrame(doc, true), true);
  doc.creative[0].controls.speed = 50;
  setCreativeKeyframe(doc.creative[0], 'speed', 1);
  assert.equal(evaluatedCreative(doc.creative[0], 0).controls.speed, 10);
  assert.equal(evaluatedCreative(doc.creative[0], 1).controls.speed, 50);
  assert.equal(frameDocument(doc, 0).creativeFrame, 0);
  assert.equal(frameDocument(doc, 1).creativeFrame, 1);
  assert.ok(frameDocument(doc, 0).animation, 'motion echo must have previous cels during export');
  selectFrame(doc, 0);
  assert.ok(isDocument(JSON.parse(JSON.stringify(doc))));
});

test('malformed tracks and unbounded creative objects are rejected rather than executed', () => {
  const doc = createDocument('Tampering');
  doc.creative = [newCreative('livingInk', 500, 500)];
  const raw = JSON.parse(JSON.stringify(doc));
  raw.creative[0].tracks = { intensity: [{ frame: -1, value: 60 }] };
  assert.equal(isDocument(raw), false);
  raw.creative[0].tracks = { intensity: [{ frame: 2, value: Number.MAX_VALUE }] };
  assert.equal(isDocument(raw), false);
  raw.creative[0].tracks = { intensity: [{ frame: 2, value: 60 }] };
  assert.ok(isDocument(raw));
  raw.creative[0].points = Array(2100).fill({ x: 1, y: 1 });
  assert.equal(isDocument(raw), false);
});
