const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const cache = new Map();
function load(module) {
  const name = module.replace(/^\.\//, '');
  if (cache.has(name)) return cache.get(name);
  const source = fs.readFileSync(path.join(root, 'src/editor', `${name}.ts`), 'utf8');
  const js = ts.transpileModule(source, {
    fileName: `${name}.ts`, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', js)(compiled, compiled.exports, id => load(path.posix.normalize(path.posix.join(path.posix.dirname(name),id))));
  cache.set(name, compiled.exports);
  return compiled.exports;
}
const { FILTER_CATALOG } = load('effect-catalog');
const { FX_PRESETS, newEffect } = load('fx');
const { EFFECT_PARAMETER_SCHEMA, boundedNumber } = load('effect-schema');
const { createDocument, isDocument } = load('types');

test('every filter and 22 signature FX have dedicated checked-in SVG assets', () => {
  const directory = path.join(root, 'src/assets/effect-icons');
  for (const { kind } of FILTER_CATALOG) {
    const icon = fs.readFileSync(path.join(directory, `${kind}.svg`), 'utf8');
    assert.match(icon, /<svg/);
    assert.match(icon, /viewBox="0 0 48 48"/);
    assert.ok(icon.length > 350, `Missing meaningful pictogram for ${kind}`);
  }
  for (const name of Object.keys(FX_PRESETS)) {
    const icon = fs.readFileSync(path.join(directory, `${name.toLowerCase().replaceAll(' ', '-')}.svg`), 'utf8');
    assert.match(icon, /<svg/);
  }
});

test('Gradient Map supports independently editable multicolor stops and survives project validation', () => {
  const effect = newEffect('gradientmap');
  assert.equal(effect.parameters.stops.length, 4);
  assert.notEqual(effect.parameters.stops[0].color, effect.parameters.stops[2].color);
  const modified = structuredClone(effect);
  modified.parameters.stops[1].color = '#ff5544';
  modified.parameters.stops[1].position = 0.48;
  const doc = createDocument('Gradient Map');
  doc.layers[0].effects = [modified];
  assert.equal(isDocument(JSON.parse(JSON.stringify(doc))), true);
  modified.parameters.stops[1].position = 22;
  assert.equal(isDocument(doc), false, 'Invalid stops must not reach image processing');
});

test('Curve editor uses editable control points and documents reject nonfinite points', () => {
  const effect = newEffect('curves');
  assert.ok(effect.parameters.curvePoints.length >= 3);
  const doc = createDocument('Curves');
  doc.layers[0].effects = [effect];
  assert.equal(isDocument(doc), true);
  effect.parameters.curvePoints[1].x = NaN;
  assert.equal(isDocument(doc), false);
});

test('Shadow Forge has an independent stack with multiple colors and editable positions', () => {
  const shadow = newEffect('shadow');
  assert.equal(shadow.parameters.shadows.length, 2);
  assert.notEqual(shadow.parameters.shadows[0].color, shadow.parameters.shadows[1].color);
  const doc = createDocument('Shadows');
  doc.layers[0].effects = [shadow];
  assert.equal(isDocument(doc), true);
});

test('per-filter parameters use defined bounds and stay different from generic amount', () => {
  const kinds = new Set(FILTER_CATALOG.map(item => item.kind));
  for (const [kind, controls] of Object.entries(EFFECT_PARAMETER_SCHEMA)) {
    assert.ok(kinds.has(kind), kind);
    for (const control of controls) {
      assert.ok(control.label.length > 2, `${kind}.${control.key}`);
      assert.ok(control.min < control.max, `${kind}.${control.key}`);
      assert.ok(control.initial >= control.min && control.initial <= control.max);
      assert.equal(boundedNumber(kind, control.key, Infinity), undefined);
      assert.equal(boundedNumber(kind, control.key, control.max + 200), control.max);
    }
  }
});

test('desktop close button routes OS and UI close requests through one listener', () => {
  const controls = fs.readFileSync(path.join(root, 'src/components/WindowControls.tsx'), 'utf8');
  const capability = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/capabilities/default.json')));
  assert.match(controls, /onCloseRequested/);
  const guard = fs.readFileSync(path.join(root, 'src/components/close-guard.ts'), 'utf8');
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.match(controls, /getCurrentWindow\(\)\.destroy\(\)/);
  assert.match(controls, /guardCloseRequest/);
  assert.match(controls, /saveAllProjects/);
  assert.match(controls, /Save All/);
  assert.match(controls, /Cancel/);
  assert.ok(capability.permissions.includes('core:window:allow-destroy'));
  assert.doesNotMatch(controls, /approvedClose/);
});

test('FX preview never reduces the resolution of raster or text layers', () => {
  const { effectPreviewScale, setInteractiveEffectPreview } = load('preview-quality');
  setInteractiveEffectPreview(false);
  assert.equal(effectPreviewScale(1920, 1080), 1);
  setInteractiveEffectPreview(true);
  assert.equal(effectPreviewScale(1920, 1080), 1);
  assert.equal(effectPreviewScale(3840, 2160, 'text-layer', true), 1);
  setInteractiveEffectPreview(false);
  assert.equal(effectPreviewScale(1920, 1080), 1);
});


test('legacy one-color Gradient Maps migrate to editable two-stop ramps', () => {
  const { migrateLegacyEffects } = load('effect-migration');
  const doc = createDocument('Old project');
  doc.layers[0].effects = [{ id: 'e1', kind: 'gradientmap', enabled: true, amount: 78, color: '#f03280' }];
  migrateLegacyEffects(doc);
  const updated = doc.layers[0].effects[0];
  assert.equal(updated.parameters.stops.length, 2);
  assert.equal(updated.parameters.stops[1].color, '#f03280');
  assert.equal(isDocument(doc), true);
});

test('legacy shadows migrate to independent shadow entries without losing their geometry', () => {
  const { migrateLegacyEffects } = load('effect-migration');
  const doc = createDocument('Old project');
  doc.layers[0].effects = [{ id: 'e1', kind: 'shadow', enabled: true, amount: 30,
    color: '#123456', parameters: { offsetX: 22, offsetY: -4, blur: 8, opacity: 60 } }];
  migrateLegacyEffects(doc);
  const shadow = doc.layers[0].effects[0].parameters.shadows[0];
  assert.equal(shadow.offsetX, 22);
  assert.equal(shadow.offsetY, -4);
  assert.equal(shadow.radius, 8);
  assert.equal(shadow.opacity, 0.6);
  assert.equal(shadow.color, '#123456');
  assert.equal(isDocument(doc), true);
});
