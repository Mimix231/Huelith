const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const modules = new Map();

function load(name) {
  name = name.replace(/^\.\//, '');
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(root, 'src/editor', `${name}.ts`);
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpiled)(specifier => load(specifier), module, module.exports);
  modules.set(name, module.exports);
  return module.exports;
}

const { createDocument, isDocument } = load('types');
const { newEffect } = load('fx');
const { EFFECT_PARAMETER_SCHEMA } = load('effect-schema');

const STYLIZED = ['chromatic', 'glitch', 'vhs', 'sig_4', 'sig_8', 'sig_13'];
test('VHS, Chromatic Split, Digital Glitch and matching FX have independent saved channel colors', () => {
  for (const kind of STYLIZED) {
    const effect = newEffect(kind, undefined, undefined, { colorA: '#00ff55', colorB: '#6633ee', colorMix: 82 });
    const doc = createDocument('Chromatic palettes');
    doc.layers[0].effects = [effect];
    assert.ok(isDocument(JSON.parse(JSON.stringify(doc))), kind);
    assert.equal(effect.parameters.colorA, '#00ff55');
    assert.equal(effect.parameters.colorB, '#6633ee');
    assert.ok(EFFECT_PARAMETER_SCHEMA[kind].some(item => item.key === 'colorMix'), kind);
  }
});

test('existing Spectrum 0.1 documents lacking new optional effect parameters remain readable', () => {
  const previous = createDocument('Historical project');
  previous.layers[0].effects = [newEffect('sig_0', 65, '#fefefe', { radius: 8 }), newEffect('vhs', 60)];
  for (const effect of previous.layers[0].effects) {
    delete effect.parameters.colorA;
    delete effect.parameters.colorB;
    delete effect.parameters.silhouetteMode;
    delete effect.parameters.silhouetteTolerance;
  }
  assert.ok(isDocument(JSON.parse(JSON.stringify(previous))));
});

test('outline preferences validate and survive saving while bad modes are rejected', () => {
  const doc = createDocument('Subject boundaries');
  doc.layers[0].effects = [newEffect('sig_0', 90, '#ff3344', {
    silhouetteMode: 'edge', silhouetteTolerance: 42,
  })];
  const saved = JSON.parse(JSON.stringify(doc));
  assert.ok(isDocument(saved));
  saved.layers[0].effects[0].parameters.silhouetteMode = 'execute-code';
  assert.equal(isDocument(saved), false);
  saved.layers[0].effects[0].parameters.silhouetteMode = 'auto';
  saved.layers[0].effects[0].parameters.colorA = '<script>alert(1)</script>';
  assert.equal(isDocument(saved), false);
});

test('Worker entry uses bundled module URL and deterministic synchronous exports are preserved', () => {
  const client = fs.readFileSync(path.join(root, 'src/editor/effects-worker-client.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/editor/fx.ts'), 'utf8');
  const native = fs.readFileSync(path.join(root, 'src/editor/render.ts'), 'utf8');
  assert.match(client, /new Worker\(new URL\('\.\/effects-worker\.ts', import\.meta\.url\)/);
  assert.match(client, /latest\.set\(layer/);
  assert.match(client, /worker\.terminate\(\)/);
  assert.match(renderer, /if \(onReady && asyncProcessor\)/);
  assert.match(renderer, /const processed = processEffects\(source, effects\)/);
  assert.match(native, /drawDocument\(ctx, doc\)/);
});

test('signature FX default amount, colorization and outline parameters are bounded', () => {
  assert.equal(newEffect('sig_0', -500).amount, 0);
  assert.equal(newEffect('sig_0', 9999).amount, 100);
  assert.equal(newEffect('chromatic', 9999).amount, 70);
  assert.equal(newEffect('sig_0').parameters.silhouetteMode, 'auto');
  for (const kind of STYLIZED) {
    assert.equal(newEffect(kind).parameters.colorMix, 65);
  }
});
