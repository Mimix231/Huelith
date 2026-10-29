const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loadCache(apply) {
  const source = fs.readFileSync(path.join(root, 'src/editor/effect-stack-cache.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === './effect-ops') return { applyEffect: apply };
    if (name === './immutable-effect-sources') return { markImmutableEffectSource() {} };
    if (name === './expansion-120') return { EXPANSION_LOOKUP: new Map() }; 
    throw new Error('Unknown test import: ' + name);
  }, result, result.exports);
  return result.exports.EffectStackCache;
}

function effect(id, amount) { return { id, kind: 'glow', amount, enabled: true, parameters: {} }; }

test('worker cache reuses preceding expensive effects, updates the edited stage only', () => {
  const calls = [];
  const Cache = loadCache((canvas, fx) => {
    calls.push(fx.id + '=' + fx.amount);
    return { width: canvas.width, height: canvas.height, path: [...(canvas.path ?? []), fx.id + fx.amount] };
  });
  const cache = new Cache(1024 * 1024);
  const original = { width: 16, height: 16, path: [] };
  const a = effect('expensive-A', 12), b = effect('expensive-B', 20), c = effect('changing-C', 30);
  assert.deepEqual(cache.render(1, original, [a, b, c]).path, ['expensive-A12', 'expensive-B20', 'changing-C30']);
  assert.equal(calls.length, 3);
  assert.deepEqual(cache.render(1, original, [a, b, { ...c, amount: 67 }]).path,
    ['expensive-A12', 'expensive-B20', 'changing-C67']);
  assert.equal(calls.length, 4, 'Only the edited last stage should be recalculated');
  cache.render(1, original, [a, b, { ...c, amount: 67 }]);
  assert.equal(calls.length, 4, 'Identical settings should not rerun the processor');
  cache.render(1, original, [a, { ...b, amount: 22 }, c]);
  assert.equal(calls.length, 6, 'Editing the middle must invalidate later stages');
  cache.clearSource(1);
  cache.render(1, original, [a, b, c]);
  assert.equal(calls.length, 9, 'New source pixels must invalidate previous results');
  cache.render(2, original, [a, b, c]);
  assert.equal(calls.length, 12, 'Different layer source IDs cannot share stale cached images');
});

test('preview cache honors parameter edits and enabled steps', () => {
  let count = 0;
  const Cache = loadCache(source => { count++; return { width: source.width, height: source.height }; });
  const cache = new Cache();
  const source = { width: 40, height: 40 };
  const settings = [effect('a', 6), effect('b', 9)];
  cache.render(55, source, settings);
  assert.equal(count, 2);
  cache.render(55, source, [{ ...settings[0], parameters: { angle: 11 } }, settings[1]]);
  assert.equal(count, 4);
  cache.render(55, source, [settings[0], { ...settings[1], enabled: false }]);
  assert.equal(count, 5, 'Reverting a modified prefix must calculate that prefix again');
  cache.render(55, source, [settings[0], { ...settings[1], enabled: false }]);
  assert.equal(count, 5, 'Repeating the disabled-step state must reuse the stage');
});

test('Studio and native color pickers drive one frame scheduler, not slow trailing timers', () => {
  const studio = fs.readFileSync(path.join(root, 'src/components/FxStudio.tsx'), 'utf8');
  const complex = fs.readFileSync(path.join(root, 'src/components/EffectAdvancedEditors.tsx'), 'utf8');
  const canvas = fs.readFileSync(path.join(root, 'src/components/Canvas.tsx'), 'utf8');
  const store = fs.readFileSync(path.join(root, 'src/editor/store.ts'), 'utf8');
  assert.match(studio, /requestAnimationFrame\(flushPreview\)/);
  assert.doesNotMatch(studio, /setTimeout\(flushPreview,\s*50\)/);
  assert.match(complex, /requestAnimationFrame\(send\)/);
  assert.doesNotMatch(complex, /setTimeout\(\(\)\s*=>\s*onPreview\(color\),\s*100\)/);
  assert.match(canvas, /paintFrame\.current\(\)/);
  assert.doesNotMatch(canvas, /setRevision\(/);
  assert.match(store, /queueLayerEffectPreview\(layerId, effects\)/);
  assert.match(studio, /onFinish=\{amount => finishSlider/);
});
