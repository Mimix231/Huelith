const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
function load(name, dependencies = {}) {
  const code = ts.transpileModule(read(name), { fileName: name,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports',code)(id => {
    if (!(id in dependencies)) throw Error(`Unmocked ${id}`);
    return dependencies[id];
  }, module, module.exports);
  return module.exports;
}
const catalog = load('src/editor/effect-catalog.ts',{'./expansion-120':{EXPANSION_120:[]}});
const schema = load('src/editor/effect-schema.ts',{'./expansion-120':{EXPANSION_120:[]}});
let id = 0;
const fx = load('src/editor/fx.ts', {
  './canvas-surface': {}, './effect-catalog': catalog,
  './types': { uid: () => `test-${++id}` },
  './effect-ops': {}, './effect-schema': schema, './preview-quality': {},
});
const newFx = ['Plasma Veins', 'Nebula Bloom', 'Spectral Refraction', 'Rift Distortion',
  'Inferno Aura', 'Crystal Resonance', 'Liquid Light'];
const newStyles = ['animecel', 'graphicnovel', 'foil', 'chromaticsilk',
  'pixelposter', 'inkwash', 'retrodream'];

test('Q: seven distinct new signature FX use independent processors and editable parameters', () => {
  assert.equal(fx.SIGNATURE_FX_NAMES.length, 22);
  for (const [idx, name] of newFx.entries()) {
    const kind = `sig_${idx + 15}`;
    assert.equal(fx.FX_PRESETS[name][0].kind, kind);
    assert.ok(schema.EFFECT_PARAMETER_SCHEMA[kind].length >= 3, name);
    assert.ok(fs.existsSync(path.join(base, 'src/assets/effect-icons', `${kind}.svg`)));
    assert.ok(fs.existsSync(path.join(base, 'src/assets/effect-icons', `${name.toLowerCase().replaceAll(' ', '-')}.svg`)));
  }
});
test('R: seven creative styles are separately selectable, with real parameter controls', () => {
  for (const kind of newStyles) {
    assert.ok(catalog.FILTER_CATALOG.some(row => row.kind === kind && row.group === 'Stylize'), kind);
    assert.ok(schema.EFFECT_PARAMETER_SCHEMA[kind].length >= 2, kind);
    assert.equal(fx.newEffect(kind, 800).amount, 100);
    assert.ok(fs.existsSync(path.join(base, 'src/assets/effect-icons', `${kind}.svg`)));
  }
});
test('S: preview/export share same full-resolution authoritatitive engine, not a draft lookalike', () => {
  const ops = read('src/editor/effect-ops.ts');
  const qrs = read('src/editor/aurora-expansion.ts');
  assert.match(ops, /renderAuroraExpansion\(source, effect\)/);
  assert.match(qrs, /ctx\.putImageData\(out, 0, 0\)/);
  assert.doesNotMatch(qrs, /canvas\.width\s*=\s*\w+\s*\*\s*0\.[0-9]/);
  assert.doesNotMatch(qrs, /paintGpuEffectDraft|paintCanvasEffectDraft/);
});
test('S: responsive profile retains more reference data without reducing image precision', () => {
  const pref = load('src/settings/preferences.ts');
  assert.equal(pref.normalizePreferences({ budgetProfile: 'responsive' }).budgetProfile, 'responsive');
  assert.equal(pref.normalizePreferences({ budgetProfile: 'economy' }).budgetProfile, 'economy');
  assert.equal(pref.normalizePreferences({ budgetProfile: 'invalid' }).budgetProfile, 'balanced');
  const worker = read('src/editor/effects-worker-client.ts');
  const runtime = read('src/editor/effects-worker.ts');
  assert.match(worker, /graphMb: 384, edgeMb: 160, silhouetteMb: 192/);
  assert.match(runtime, /stackCache\.setBudget/);
  assert.match(runtime, /setEdgeCacheBudget/);
  assert.match(runtime, /setSilhouetteCacheBudget/);
  assert.match(read('src/editor/effect-ops.ts'), /function neonEdges\(/);
});
