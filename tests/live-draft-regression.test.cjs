const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function load(name) {
  const code = ts.transpileModule(read(`src/editor/${name}.ts`), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, () => ({}));
  return mod.exports;
}

test('interactive Canvas2D and WebGL lookalike effects are not used by the editor', () => {
  const fx = read('src/editor/fx.ts');
  assert.doesNotMatch(fx, /(?:paintGpuEffectDraft|paintCanvasEffectDraft|drawLiveStrengthPreview)/);
  assert.doesNotMatch(fx, /from ['"]\.\/live-(?:gpu-effects|preview-mixer|color-lut)['"]/);
  assert.match(fx, /queueLayerEffectPreview\(layer\.id, effects\)/);
  assert.match(fx, /const result = processEffects\(source,effects\)/);
});

test('brightness continues to map to brightness, not contrast', () => {
  const fx = read('src/editor/fx.ts');
  assert.match(fx, /\['brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'invert'\]/);
  assert.match(fx, /return `\$\{name\}\(\$\{amount\}%\)`/);
  assert.doesNotMatch(fx, /brightness.*contrast\(\$\{amount/);
});

test('no maximum four-effect preview cutoff remains', () => {
  const fx = read('src/editor/fx.ts');
  assert.doesNotMatch(fx, /enabled\)\.length\s*<=\s*4/);
  assert.doesNotMatch(fx, /effects\.length\s*<=\s*4/);
  assert.match(fx, /effects\.some\(effect => effect\.enabled\)/);
});

test('editor source previews are never resized below full document resolution', () => {
  const { effectPreviewScale } = load('preview-quality');
  for (const [w, h] of [[1920, 1080], [3840, 2160], [7680, 4320]]) {
    assert.equal(effectPreviewScale(w, h, 'active-layer', true), 1);
  }
});

test('worker-side intermediate stages reuse unchanged prefix instead of reapplying previous FX', () => {
  const engine = read('src/editor/effect-stack-cache.ts');
  assert.match(engine, /previous\[index\]\?\.signature === signature/);
  assert.match(engine, /current = applyEffect\(current, effect\)/);
  assert.match(engine, /this\.trim\(\)/);
});

test('active large source is not evicted by other displayed layers', () => {
  const { previewCacheVictim, setInteractiveEffectPreview } = load('preview-quality');
  setInteractiveEffectPreview(true, 'edited');
  assert.equal(previewCacheVictim(['edited', 'other-a', 'other-b']), 'other-a');
  assert.equal(previewCacheVictim(['edited']), undefined);
  setInteractiveEffectPreview(false);
});
