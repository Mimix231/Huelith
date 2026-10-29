const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function compile(name, deps) {
  const source = ts.transpileModule(read(name).replace("new URL('./effects-worker.ts', import.meta.url)", "'worker-url'"), {
    fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (!(name in deps)) throw Error(`Missing mock ${name}`);
    return deps[name];
  }, mod, mod.exports);
  return mod.exports;
}

test('Phase L: the same source ID may NEVER reuse an effect result from different pixels', async () => {
  let calculations = 0;
  const { EffectStackCache } = compile('src/editor/effect-stack-cache.ts', {
    './effect-ops': { applyEffect(source, effect) { calculations++; return { width: source.width, height: source.height, value: source.value + effect.amount }; } },
    './immutable-effect-sources': { markImmutableEffectSource() {} },
    './expansion-120': { EXPANSION_LOOKUP:new Map() },
  });
  const cache = new EffectStackCache();
  const effects = [{ enabled: true, kind: 'glow', amount: 30 }, { enabled: true, kind: 'miasma', amount: 50 }];
  const a = { width: 8, height: 8, value: 1 };
  const b = { width: 8, height: 8, value: 99 };
  assert.equal((await cache.renderCooperatively(42, a, effects, () => false, async () => {})).value, 81);
  assert.equal(calculations, 2);
  assert.equal((await cache.renderCooperatively(42, a, effects, () => false, async () => {})).value, 81);
  assert.equal(calculations, 2, 'retain identical source and parameter prefixes');
  assert.equal(cache.lastMetrics.reused, 2);
  assert.equal((await cache.renderCooperatively(42, b, effects, () => false, async () => {})).value, 179);
  assert.equal(calculations, 4, 'a different canvas with the same size and numeric source ID must invalidate pixels');
  assert.equal(cache.lastMetrics.reused, 0);
});

test('Phase L: edits to an effect reuse the unchanged PREFIX and retain all following effects', async () => {
  let calls = [];
  const { EffectStackCache } = compile('src/editor/effect-stack-cache.ts', {
    './effect-ops': { applyEffect(src, effect) { calls.push(effect.kind); return { ...src, stack: [...(src.stack ?? []), `${effect.kind}:${effect.amount}`] }; } },
    './immutable-effect-sources': { markImmutableEffectSource() {} },
    './expansion-120': { EXPANSION_LOOKUP:new Map() },
  });
  const graph = new EffectStackCache();
  const source = { width: 20, height: 16, stack: [] };
  const sequence = ['vhs', 'outline', 'glow', 'miasma', 'brightness', 'contrast'].map((kind, i) => ({ kind, enabled: true, amount: i * 10 + 5 }));
  const first = await graph.renderCooperatively(3, source, sequence, () => false, async () => {});
  assert.equal(first.stack.length, 6);
  assert.equal(calls.length, 6);
  const changed = sequence.map((e, i) => i === 2 ? { ...e, amount: 90 } : e);
  const second = await graph.renderCooperatively(3, source, changed, () => false, async () => {});
  assert.equal(calls.length, 10, 'four affected effects recomputed');
  assert.equal(graph.lastMetrics.reused, 2, 'VHS and outline should be reused');
  assert.deepEqual(second.stack.map(value => value.split(':')[0]), sequence.map(effect => effect.kind));
  assert.equal(second.stack[2], 'glow:90');
});

test('Phase M: a running slider is not starved until an accurate frame has been displayed', async () => {
  const saved = [global.Worker, global.OffscreenCanvas, global.createImageBitmap, global.window];
  let processor, worker;
  class WorkerMock {
    constructor() { worker = this; this.messages = []; }
    postMessage(message) { this.messages.push(message); }
    terminate() {}
  }
  global.Worker = WorkerMock;
  global.OffscreenCanvas = class {};
  global.createImageBitmap = async source => ({ width: source.width, height: source.height, close() {} });
  global.window = { dispatchEvent() {} };
  try {
    const mod = compile('src/editor/effects-worker-client.ts', {
      './fx': { setAsyncEffectsProcessor(fn) { processor = fn; } },
      './preview-quality': { isInteractiveEffectPreview() { return true; } },
    });
    const dispose = mod.installEffectsWorker();
    const src = { width: 10, height: 10 };
    const seen = [];
    processor(src, [{ kind: 'glow', amount: 1 }], 'L', () => seen.push(1));
    await Promise.resolve(); await Promise.resolve();
    const first = worker.messages.find(m => m.effects);
    processor(src, [{ kind: 'glow', amount: 2 }], 'L', () => seen.push(2));
    assert.equal(worker.messages.some(m => m.kind === 'supersede'), false, 'first complete image must not be starved');
    worker.onmessage({ data: { id: first.id, result: { width: 10, close() {} } } });
    assert.deepEqual(seen, [1]);
    await Promise.resolve();
    const second = worker.messages.filter(m => m.effects)[1];
    processor(src, [{ kind: 'glow', amount: 3 }], 'L', () => seen.push(3));
    assert.ok(worker.messages.some(m => m.kind === 'supersede' && m.sourceId === second.sourceId),
      'after a genuine frame, expensive obsolete remaining stages may be superseded');
    worker.onmessage({ data: { id: second.id, aborted: true } });
    await Promise.resolve();
    const third = worker.messages.filter(m => m.effects)[2];
    assert.ok(third && third.effects[0].amount === 3);
    worker.onmessage({ data: { id: third.id, result: { width: 10, close() {} } } });
    assert.deepEqual(seen, [1, 3]);
    dispose();
  } finally {
    [global.Worker, global.OffscreenCanvas, global.createImageBitmap, global.window] = saved;
  }
});

test('Phase K: draw-only Glow/filters do not insist on Canvas2D software readback; readers still opt in', () => {
  const creative = read('src/editor/creative-reconstruction.ts');
  const ops = read('src/editor/effect-ops.ts');
  assert.match(creative, /readPixels = false/);
  assert.match(creative, /copy\(source, true\)/);
  assert.match(creative, /ctx\(source, true\)\.getImageData/);
  assert.match(ops, /const ctx = output\.getContext\('2d'\)/);
  assert.match(creative, /getStencil\(source, color\)/);
  assert.doesNotMatch(creative, /paintGpuEffectDraft/);
});

test('Phase K: native GPU blur uses three real RGBA passes, alpha-aware full-resolution math and CPU fallback', () => {
  const gpu = read('src-tauri/src/aurora/gpu.rs');
  const shader = read('src-tauri/src/aurora/blur.wgsl');
  const cpu = read('src-tauri/src/aurora/mod.rs');
  assert.match(gpu, /fn apply_blur/);
  assert.match(gpu, /\(5, &source, &intermediate_a\)/);
  assert.match(gpu, /\(6, &intermediate_a, &intermediate_b\)/);
  assert.match(gpu, /\(7, &intermediate_b, &output\)/);
  assert.match(shader, /premul/);
  assert.match(shader, /params\.width/);
  assert.match(shader, /params\.height/);
  assert.match(cpu, /sliding sums/);
  assert.match(cpu, /gpu_supported_operations: vec!\[[^\]]*"blur"/);
});

test('Phase M: statistics distinguish UI FPS, canvas repaints, effect completions, cache and slowest stage', () => {
  const client = read('src/editor/effects-worker-client.ts');
  const worker = read('src/editor/effects-worker.ts');
  const canvas = read('src/components/Canvas.tsx');
  for (const name of ['queueDepth', 'processingMs', 'metrics']) assert.ok(client.includes(name));
  assert.match(worker, /metrics: stackCache\.lastMetrics/);
  for (const term of ['UI ${uiFrames} FPS', 'repaints/s', 'exact FX ${exact}/s', 'slowest ${slowest}']) assert.ok(canvas.includes(term), term);
});
