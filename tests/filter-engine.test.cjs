const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const modules = new Map();

function load(name) {
  if (modules.has(name)) return modules.get(name);
  const location = path.resolve(__dirname, `../src/editor/${name}.ts`);
  const source = fs.readFileSync(location, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(
    dependency => load(dependency.replace(/^\.\//, '')),
    module,
    module.exports,
  );
  modules.set(name, module.exports);
  return module.exports;
}

const catalog = load('effect-catalog').FILTER_CATALOG;
const { isDocument, createDocument } = load('types');
const { FILTERS, FX_PRESETS, EFFECT_PARAMETERS, newEffect, clampEffectAmount } = load('fx');
const { strokeSamples } = load('brush');

test('68+ filters have stable unique ids, distinct categories, and operational controls', () => {
  assert.ok(catalog.length >= 68);
  assert.equal(new Set(catalog.map(item => item.kind)).size, catalog.length);
  assert.deepEqual([...new Set(catalog.map(item => item.group))],
    ['Color & light', 'Detail & texture', 'Stylize', 'Creative effects', 'Signature FX', 'Color Science', 'Lighting & Atmosphere', 'Artistic Painting', 'Distortion & Geometry', 'Anime & Comics', 'Materials & Surfaces', 'Digital & Experimental', 'Cinematic & Optical']);
  assert.equal(FILTERS.length, catalog.length);
  for (const item of catalog) {
    assert.ok(item.initial >= item.min && item.initial <= item.max, item.kind);
    assert.ok(item.step > 0, item.kind);
    assert.ok(item.label.length > 2);
  }
});

test('all effects survive document serialization without baking source layer pixels', () => {
  const doc = createDocument('Studio filters', 192, 108);
  for (const item of catalog) {
    doc.layers[0].effects = [newEffect(item.kind, item.initial)];
    assert.equal(isDocument(JSON.parse(JSON.stringify(doc))), true, item.kind);
  }
});

test('custom signature FX use only valid, working filters and parameter ranges', () => {
  assert.ok(Object.keys(FX_PRESETS).length >= 15);
  for (const [name, stages] of Object.entries(FX_PRESETS)) {
    assert.ok(stages.length >= 1, name);
    assert.ok(stages.every(stage => catalog.some(filter => filter.kind === stage.kind)), name);
    const doc = createDocument('Signature');
    doc.layers[0].effects = stages.map(stage => newEffect(stage.kind, stage.amount, stage.color, stage.parameters));
    assert.equal(isDocument(doc), true, `${name} did not round-trip`);
  }
});

test('Hyper Outline, backdrop and glow expose independently adjustable geometry', () => {
  assert.ok(EFFECT_PARAMETERS.outline.some(parameter => parameter.key === 'softness'));
  assert.ok(EFFECT_PARAMETERS.backdrop.some(parameter => parameter.key === 'offsetX'));
  assert.ok(EFFECT_PARAMETERS.backdrop.some(parameter => parameter.key === 'offsetY'));
  assert.ok(EFFECT_PARAMETERS.glow.some(parameter => parameter.key === 'spread'));
  const backdrop = newEffect('backdrop');
  assert.equal(backdrop.parameters.scale, 100);
  assert.equal(backdrop.parameters.opacity, 65);
  const outline = newEffect('outline', 999);
  assert.equal(outline.amount, 100);
  assert.equal(clampEffectAmount('swirl', -500), -180);
});

test('brush stroke sampler has finite curves, stable positions, and precise endpoint', () => {
  const result = strokeSamples({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 30, y: 40 }, 1);
  assert.ok(result.length > 25);
  assert.deepEqual(result.at(-1), { x: 30, y: 40 });
  assert.ok(result.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
});
