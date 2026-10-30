const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

const cache = new Map();
function requireEditor(name) {
  if (cache.has(name)) return cache.get(name);
  const source = fs.readFileSync(path.join(root, 'src/editor', `${name}.ts`), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result)(
    specifier => requireEditor(path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier))), module, module.exports,
  );
  cache.set(name, module.exports);
  return module.exports;
}
const { EffectPreviewScheduler } = requireEditor('effect-preview-scheduler');
const { createDocument, isDocument } = requireEditor('types');

// The scheduler must never drop the final value or generate one undo per pixel.
test('effect preview scheduler commits the last slider value exactly once', () => {
  let tick = 100;
  const events = [];
  const scheduler = new EffectPreviewScheduler((layer, effect, changes) => {
    events.push({ layer, effect, changes });
  }, () => events.push('commit'), 75, () => tick);
  scheduler.preview('layer', 'effect', { amount: 30 });
  tick += 3;
  for (let amount = 31; amount <= 160; amount++) scheduler.preview('layer', 'effect', { amount });
  scheduler.commit();
  assert.equal(events.filter(item => item === 'commit').length, 1);
  assert.equal(events.at(-2).changes.amount, 160);
  assert.ok(events.length <= 3, 'Slider drag cannot trigger hundreds of full renders');
  scheduler.dispose();
});

test('scheduler merges different advanced parameter drags into one final preview', () => {
  let tick = 100;
  const events = [];
  const scheduler = new EffectPreviewScheduler((layer, effect, changes) => {
    events.push(changes);
  }, () => {}, 100, () => tick);
  scheduler.preview('layer', 'effect', { parameters: { offsetX: 10 } });
  tick++;
  scheduler.preview('layer', 'effect', { parameters: { offsetY: 15 } });
  scheduler.preview('layer', 'effect', { parameters: { offsetX: 40 } });
  scheduler.commit();
  assert.deepEqual(events.at(-1).parameters, { offsetX: 40, offsetY: 15 });
  scheduler.dispose();
});

test('new glow modes and gradient backdrop remain valid on-disk settings', () => {
  const doc = createDocument('Studio 0.1');
  doc.layers[0].effects = [{
    id: 'light', kind: 'glow', enabled: true, amount: 30, color: '#aabbcc',
    parameters: { glowMode: 'bloom', threshold: 160, falloff: 65 },
  }, {
    id: 'stage', kind: 'backdrop', enabled: true, amount: 60, color: '#ddeeff',
    parameters: { backdropMode: 'gradient', offsetX: 23, offsetY: -11, angle: 75,
      stops: [{ id: 'a', position: 0, color: '#09162b', opacity: 1 },
        { id: 'b', position: 1, color: '#e6baff', opacity: 1 }] },
  }, {
    id: 'shadow', kind: 'shadow', enabled: true, amount: 25,
    parameters: { shadows: [{ id: 'inner', enabled: true, style: 'inner', offsetX: 4,
      offsetY: 5, radius: 8, spread: 2, opacity: 0.7, color: '#000000' }] },
  }];
  assert.equal(isDocument(JSON.parse(JSON.stringify(doc))), true);
  doc.layers[0].effects[0].parameters.glowMode = 'invalid';
  assert.equal(isDocument(doc), false);
});

test('Focus Text uses a single editing session and correct Enter / Shift+Enter actions', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/FocusTextEditor.tsx'), 'utf8');
  assert.match(source, /createPortal/);
  assert.match(source, /event\.key === 'Enter' && !event\.shiftKey/);
  assert.match(source, /event\.nativeEvent\.isComposing/);
  assert.match(source, /commitTextDraft/);
  assert.match(source, /cancelTextDraft/);
  assert.match(source, /useEditor\.getState\(\)\.setTextFormat/);
  assert.match(fs.readFileSync(path.join(root, 'src/components/Canvas.tsx'), 'utf8'), /<FocusTextEditor/);
});


test('interactive previews preserve native resolution for every layer', () => {
  const { effectPreviewScale, setInteractiveEffectPreview } = requireEditor('preview-quality');
  setInteractiveEffectPreview(true, 'foreground');
  assert.equal(effectPreviewScale(1920, 1080, 'foreground'), 1);
  assert.equal(effectPreviewScale(3840, 2160, 'foreground', true), 1);
  assert.equal(effectPreviewScale(1920, 1080, 'background'), 1);
  setInteractiveEffectPreview(false);
  assert.equal(effectPreviewScale(1920, 1080, 'foreground'), 1);
});
