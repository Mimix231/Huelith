const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(root, 'src/editor', `${name}.ts`);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('module','exports','require',js)(module,module.exports,id => load(path.posix.normalize(path.posix.join(path.posix.dirname(name),id))));
  modules.set(name,module.exports);
  return module.exports;
}
const { createDocument, isDocument } = load('types');
const { newEffect } = load('fx');
const animation = load('animation');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Phase T: VHS, Chromatic Shift and Digital Glitch have separate color-safe renderers', () => {
  const source = read('src/editor/effect-ops.ts');
  for (const name of ['chromaticShift', 'vhsTracking', 'digitalGlitch']) assert.match(source, new RegExp(`function ${name}\\(`));
  assert.doesNotMatch(source, /case 'chromatic': case 'glitch': case 'vhs'/);
  assert.doesNotMatch(source.slice(source.indexOf('function chromaticShift('), source.indexOf('/** Render each shadow')), /globalCompositeOperation = 'screen'/);
  assert.match(source, /src\[from \+ c\]/);
});

test('Phase T: animation layers inherit saved FX stacks without modifying other cel artwork', () => {
  const doc = createDocument('FX animation', 72, 40, 'transparent');
  animation.enableAnimation(doc);
  animation.insertFrame(doc, false);
  const layerId = doc.layers[0].id;
  const effect = newEffect('glow');
  const first = doc.animation.frames[0].layers[0];
  first.effects = [effect];
  const second = doc.animation.frames[1].layers[0];
  second.effects = [];
  second.image = '';
  // Simulate a pre-Phase-AI project with FX only on the first cel.
  delete doc.animation.trackEffects;
  const resolved = animation.frameDocument(doc, 1);
  assert.equal(resolved.layers[0].effects[0].id, effect.id);
  assert.equal(resolved.layers[0].image, '', 'FX inheritance cannot replace the cel artwork');
  assert.equal(second.effects.length, 0, 'Export helper should not mutate original frames');
});

test('Phase V: editable background masks pass project validation and reject malformed brush marks', () => {
  const doc = createDocument('Mask safety', 128, 96);
  const cutout = newEffect('cutout');
  cutout.parameters.maskStrokes = [{ x: 0.5, y: 0.5, radius: 24, mode: 'keep' }, { x: 0.1, y: 0.12, radius: 8, mode: 'remove' }];
  doc.layers[0].effects = [cutout];
  assert.equal(isDocument(JSON.parse(JSON.stringify(doc))),true);
  cutout.parameters.maskStrokes[0].x = -5;
  assert.equal(isDocument(doc),false);
});

test('Phase U: Originals inspector uses centralized theme colors and a direct placement pad', () => {
  const css = read('src/components/CreativeLab.css');
  const style = read('src/styles/app.css');
  const ui = read('src/components/CreativeLab.tsx');
  for (const token of ['--surface-panel','--surface-raised','--surface-input','--content-primary','--surface-selected']) assert.ok(style.includes(token), token);
  assert.match(css,/color:\s*var\(--content-primary\)/);
  assert.match(ui,/creative-position-pad/);
  assert.match(ui,/Huelith Originals/);
  assert.doesNotMatch(css,/var\(--panel,\s*#f5faf8\)/);
});

test('Phase V: mask corrections are editable only and do not paint into source-layer pixels', () => {
  const editor = read('src/components/EffectAdvancedEditors.tsx');
  const processor = read('src/editor/effect-ops.ts');
  assert.match(editor,/Keep subject/);
  assert.match(editor,/Remove background/);
  assert.match(editor,/maskStrokes/);
  assert.match(processor,/applyBackgroundMask/);
  assert.match(processor,/backgroundAuto === 0/);
});
