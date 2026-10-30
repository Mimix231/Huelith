const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(name) {
  name = name.replace(/^\.\//, '');
  if (cache.has(name)) return cache.get(name);
  const filename = path.join(root, 'src/editor', `${name}.ts`);
  const code = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(code, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(specifier => load(path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier))), module, module.exports);
  cache.set(name, module.exports);
  return module.exports;
}
const { FILTER_CATALOG } = load('effect-catalog');
const { newEffect, FX_PRESETS, SIGNATURE_FX_NAMES } = load('fx');
const { appliedStudioItems, createStudioPreset, CREATIVITY_FILTERS, LAYER_EFFECTS } = load('studio-catalog');
const { createDocument, isDocument } = load('types');

const count = group => FILTER_CATALOG.filter(item => item.group === group).length;
test('D–H inventory preserves 24 color, 21 detail, 32 stylize, 2 creative effects and 22 native FX', () => {
  assert.deepEqual([count('Color & light'), count('Detail & texture'), count('Stylize'),
    count('Creative effects'), count('Signature FX')], [24, 21, 32, 2, 22]);
  assert.equal(CREATIVITY_FILTERS.length, 192);
  assert.equal(LAYER_EFFECTS.length, 7);
  assert.equal(SIGNATURE_FX_NAMES.length, 22);
});

test('all 22 independently editable FX presets compile down to one dedicated effect kind', () => {
  for (const [index, name] of SIGNATURE_FX_NAMES.entries()) {
    const recipe = FX_PRESETS[name];
    assert.equal(recipe.length, 1, name);
    assert.equal(recipe[0].kind, `sig_${index}`, name);
    const applied = createStudioPreset(name);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].studioCategory, 'fx');
    assert.equal(applied[0].kind, `sig_${index}`);
    assert.ok(applied[0].parameters && typeof applied[0].parameters === 'object');
  }
});

test('new FX persist as one non-destructive editing object', () => {
  const document = createDocument('Native Signature');
  document.layers[0].effects = createStudioPreset('Holographic');
  assert.ok(isDocument(JSON.parse(JSON.stringify(document))));
  assert.equal(appliedStudioItems(document.layers[0].effects).length, 1);
  assert.equal(appliedStudioItems(document.layers[0].effects)[0].title, 'Holographic');
});

test('legacy chained FX metadata still groups previous project data into one editable Studio icon', () => {
  const group = 'existing-project-group';
  const effects = [
    { ...newEffect('outline'), studioCategory: 'fx', studioGroupId: group, studioPreset: 'Old Hyper Outline' },
    { ...newEffect('glow'), studioCategory: 'fx', studioGroupId: group, studioPreset: 'Old Hyper Outline' },
  ];
  const doc = createDocument('Legacy FX');
  doc.layers[0].effects = effects;
  assert.ok(isDocument(JSON.parse(JSON.stringify(doc))));
  assert.equal(appliedStudioItems(effects).length, 1);
  assert.equal(appliedStudioItems(effects)[0].effects.length, 2);
});

test('Radiance and Miasma are layer effects rather than photographic brightness adjustments', () => {
  for (const kind of ['radiance', 'miasma']) {
    const effect = newEffect(kind);
    const doc = createDocument('Creative lighting');
    doc.layers[0].effects = [effect];
    assert.ok(isDocument(doc));
    assert.equal(appliedStudioItems([effect])[0].category, 'effects');
    assert.ok(typeof effect.parameters.radius === 'number');
    assert.ok(typeof effect.parameters.opacity === 'number');
  }
});

test('Shock Zoom exposes separate lens bulge, softness, chromatic and center controls', () => {
  const parameters = load('effect-schema').EFFECT_PARAMETER_SCHEMA.zoomblur;
  for (const key of ['bulge', 'radius', 'chromatic', 'centerX', 'centerY']) {
    assert.ok(parameters.some(parameter => parameter.key === key), key);
  }
  assert.equal(FILTER_CATALOG.find(item => item.kind === 'zoomblur').label, 'Shock zoom');
});

test('Spectral glow has a four-stop default while simple glow remains available', () => {
  const effect = newEffect('glow');
  assert.equal(effect.parameters.glowPalette, 'single');
  assert.equal(effect.parameters.stops.length, 4);
  const doc = createDocument('Spectral Glow');
  effect.parameters.glowPalette = 'spectrum';
  doc.layers[0].effects = [effect];
  assert.ok(isDocument(doc));
  effect.parameters.glowPalette = 'untrusted';
  assert.equal(isDocument(doc), false);
});

test('every new effect and signature FX icon resolves to an SVG', () => {
  for (const effect of FILTER_CATALOG.filter(item => ['Creative effects', 'Signature FX'].includes(item.group))) {
    const icon = path.join(root, 'src/assets/effect-icons', `${effect.kind}.svg`);
    assert.ok(fs.existsSync(icon), icon);
    assert.match(fs.readFileSync(icon, 'utf8'), /<svg/);
  }
});

test('new standalone FX dispatches independently of named filters', () => {
  const code = fs.readFileSync(path.join(root, 'src/editor/effect-ops.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/editor/creative-reconstruction.ts'), 'utf8');
  assert.match(code, /kind\.startsWith\('sig_'\).*applySignatureFX/s);
  assert.match(renderer, /export function applySignatureFX/);
  assert.doesNotMatch(renderer, /processEffects\(/);
  assert.doesNotMatch(renderer, /applyEffect\(/);
});

test('focused details are implemented by separate processors, not a shared blur preset', () => {
  const source = fs.readFileSync(path.join(root, 'src/editor/detail-reconstruction.ts'), 'utf8');
  assert.match(source, /export function shockZoom/);
  assert.match(source, /export function depthLensBlur/);
  assert.match(source, /export function boxKernel/);
  assert.match(source, /Sliding windows are O\(width × height\)/);
});
