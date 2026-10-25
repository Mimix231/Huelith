const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Studio queues worker results AND invalidates canvas when setting changes', () => {
  const store = read('src/editor/store.ts');
  const dispatch = store.match(/function announceStudioPreview\([\s\S]*?\n}\n/);
  assert.ok(dispatch);
  assert.match(dispatch[0], /queueLayerEffectPreview\(layerId, effects\)/);
  assert.match(dispatch[0], /dispatchEvent\(new Event\('huelith-studio-preview'\)\)/);
  assert.doesNotMatch(dispatch[0], /queueLayerEffectPreview\(layerId, effects\)\) return/);
});

test('working slider effects are not cloned on every pointer frame', () => {
  const studio = read('src/components/FxStudio.tsx');
  const store = read('src/editor/store.ts');
  assert.match(studio, /requestAnimationFrame\(flushPreview\)/);
  assert.match(studio, /onFinish\(final\)/);
  assert.match(store, /studioEffectPath\(layer, studioOverlay\.layerId, studioOverlay\.effects, false\)/);
});

test('worker previews are generation-safe and older completions cannot overwrite newer frames', () => {
  const fx = read('src/editor/fx.ts');
  assert.match(fx, /revision < \(lastPublishedRevision\.get\(layerId\)/);
  assert.match(fx, /generation !== activeGeneration\(layerId\)/);
  assert.match(fx, /putLastPreview\(layerId, result\)/);
});

test('no temporary painter substitutes a different algorithm during dragging', () => {
  const fx = read('src/editor/fx.ts');
  assert.doesNotMatch(fx, /paintGpuEffectDraft|paintCanvasEffectDraft|drawLiveStrengthPreview/);
  assert.match(fx, /queueLayerEffectPreview\(layer\.id, effects\)/);
  assert.match(fx, /const processed = processEffects\(source, effects\)/);
});
