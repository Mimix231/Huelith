const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const compile = (name, deps = {}) => {
  const source = ts.transpileModule(read(name).replace("new URL('./effects-worker.ts', import.meta.url)", "'worker-url'"), { fileName: name,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (!(name in deps)) throw new Error(`Unmocked import ${name} in ${name}`);
    return deps[name];
  }, module, module.exports);
  return module.exports;
};

test('Phase G: worker delivers progressive exact frames in FIFO completion order while a slider moves quickly', async () => {
  const old = [global.Worker, global.OffscreenCanvas, global.createImageBitmap, global.window];
  let submit, interactive = true, worker;
  class FakeWorker {
    constructor() { worker = this; this.messages = []; }
    postMessage(payload) { this.messages.push(payload); }
    terminate() {}
  }
  global.Worker = FakeWorker;
  global.OffscreenCanvas = class {};
  global.createImageBitmap = async source => ({ width: source.width, height: source.height, close() {} });
  global.window = { localStorage: { getItem() { return null; } }, dispatchEvent() {} };
  try {
    const client = compile('src/editor/effects-worker-client.ts', {
      './fx': { setAsyncEffectsProcessor(fn) { submit = fn; } },
      './preview-quality': { isInteractiveEffectPreview() { return interactive; } },
    });
    const dispose = client.installEffectsWorker();
    assert.equal(typeof submit, 'function');
    const source = { width: 16, height: 16 };
    const seen = [];
    submit(source, [{ kind: 'glow', amount: 10 }], 'L', () => seen.push(10));
    await Promise.resolve();
    await Promise.resolve();
    const first = worker.messages.find(x => x.effects);
    assert.ok(first);
    submit(source, [{ kind: 'glow', amount: 90 }], 'L', () => seen.push(90));
    assert.equal(worker.messages.filter(x => x.kind === 'supersede').length, 0,
      'Do not abort a valid exact frame of the same slider/source during a fast drag');
    worker.onmessage({ data: { id: first.id, result: { width: 16, close() {} } } });
    assert.deepEqual(seen, [10], 'A completed correct older frame must be shown, not starved');
    await Promise.resolve();
    const second = worker.messages.filter(x => x.effects)[1];
    assert.ok(second && second.id > first.id);
    worker.onmessage({ data: { id: second.id, result: { width: 16, close() {} } } });
    assert.deepEqual(seen, [10, 90]);
    interactive = false;
    submit(source, [{ kind: 'glow', amount: 30 }], 'L', () => seen.push(30));
    await Promise.resolve();
    const third = worker.messages.filter(x => x.effects)[2];
    submit(source, [{ kind: 'glow', amount: 80 }], 'L', () => seen.push(80));
    worker.onmessage({ data: { id: third.id, result: { width: 16, close() {} } } });
    assert.deepEqual(seen, [10, 90], 'Outside drag, older results must not overwrite the target value');
    await Promise.resolve();
    const fourth = worker.messages.filter(x => x.effects)[3];
    worker.onmessage({ data: { id: fourth.id, result: { width: 16, close() {} } } });
    assert.deepEqual(seen, [10, 90, 80]);
    dispose();
  } finally {
    [global.Worker, global.OffscreenCanvas, global.createImageBitmap, global.window] = old;
  }
});

test('Phase G/F: cooperative worker finishes no superseded remaining stages, keeps correct prefix cache', async () => {
  let calculated = [];
  let mark = () => {};
  const cache = compile('src/editor/effect-stack-cache.ts', {
    './effect-ops': { applyEffect(source, effect) {
      calculated.push(effect.kind + ':' + effect.amount);
      return { ...source, revision: `${source.revision ?? ''}/${effect.kind}:${effect.amount}` };
    } },
    './immutable-effect-sources': { markImmutableEffectSource: mark },
    './expansion-120': { EXPANSION_LOOKUP:new Map() },
  });
  const graph = new cache.EffectStackCache();
  const source = { width: 16, height: 16, revision: 'base' };
  const a = [
    { kind: 'brightness', amount: 100, enabled: true },
    { kind: 'glow', amount: 70, enabled: true },
    { kind: 'invert', amount: 40, enabled: true },
  ];
  let canceled = false;
  assert.equal(await graph.renderCooperatively(1, source, a, () => canceled, async () => { canceled = true; }), null);
  assert.deepEqual(calculated, ['brightness:100']);
  const adjusted = [a[0], { ...a[1], amount: 80 }, a[2]];
  canceled = false;
  const result = await graph.renderCooperatively(1, source, adjusted, () => canceled, async () => {});
  assert.equal(result.revision, 'base/brightness:100/glow:80/invert:40');
  assert.deepEqual(calculated, ['brightness:100', 'glow:80', 'invert:40'],
    'Completed unaffected prefix must be reused after a supersession');
  const repeated = await graph.renderCooperatively(1, source, adjusted, () => false);
  assert.equal(result.revision, repeated.revision);
  assert.equal(calculated.length, 3);
});

test('Phase H: no lookalike FX algorithms or pixel downgrades were reintroduced', () => {
  const fx = read('src/editor/fx.ts');
  const stack = read('src/editor/effect-stack-cache.ts');
  const silhouette = read('src/editor/effects/layer-distance.ts');
  const hyper = read('src/editor/subject-outline.ts');
  assert.match(fx, /processEffects/);
  assert.doesNotMatch(fx, /paintGpuEffectDraft|paintCanvasEffectDraft/);
  assert.match(stack, /applyEffect\(current, effect\)/);
  assert.match(silhouette, /isImmutableEffectSource/);
  assert.match(silhouette, /layerDistance/);
  assert.match(silhouette, /setSilhouetteCacheBudget/);
  assert.match(hyper, /retainedMattes/);
  assert.match(read('src/settings/aurora-parity.ts'), /compareNativeRgba/);
});

test('Phase H/J: native parity comparator rejects excessive RGB or alpha difference', () => {
  const parity = compile('src/settings/aurora-parity.ts', {
    '../editor/fx': {}, './native-cpu': {}, './native-aurora': {},
  });
  const reference = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 0]);
  assert.deepEqual(parity.compareNativeRgba(reference, [11, 20, 30, 255, 10, 20, 30, 0]),
    { maximumChannelDifference: 1, differentPixels: 0, passed: true });
  assert.equal(parity.compareNativeRgba(reference, [11, 20, 30, 255, 10, 20, 30, 4]).passed, false);
  assert.equal(parity.compareNativeRgba(reference, [11, 20, 30, 255]).passed, false);
});

test('Phase I: animation source identities are retained for several cels, not just one', () => {
  const fx = read('src/editor/fx.ts');
  assert.match(fx, /MAX_VARIANTS_PER_LAYER/);
  assert.match(fx, /variants\.find/);
  assert.match(fx, /sourceCache\.set\(layer\.id, \[\.\.\.variants\.filter/);
  const client = read('src/editor/effects-worker-client.ts');
  assert.match(client, /animation cel/);
  assert.match(client, /kind: 'supersede'/);
  const animation = read('src/editor/animation-export.ts');
  assert.match(animation, /frameDocument/);
  assert.match(animation, /exportCanvas/);
});
