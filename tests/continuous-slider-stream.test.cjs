const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

function loadClient(setProcessor) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/editor/effects-worker-client.ts'), 'utf8')
    .replace("new URL('./effects-worker.ts', import.meta.url)", "'worker-url'"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => ({
    './fx': { setAsyncEffectsProcessor: setProcessor },
    './preview-quality': { isInteractiveEffectPreview: () => true },
  })[id], module, module.exports);
  return module.exports;
}

test('frames keep arriving throughout a long uninterrupted drag; queue remains bounded and final value wins', async () => {
  const old = { Worker: global.Worker, createImageBitmap: global.createImageBitmap, window: global.window };
  let worker, process;
  class WorkerMock {
    messages = [];
    constructor() { worker = this; }
    postMessage(message) { this.messages.push(message); }
    terminate() {}
  }
  Object.assign(global, {
    Worker: WorkerMock,
    createImageBitmap: async source => ({ ...source, close() {} }),
    window: { dispatchEvent() {} },
  });
  try {
    const dispose = loadClient(fn => process = fn).installEffectsWorker();
    const source = { width: 1920, height: 1080 };
    const seen = [];
    const submit = value => process(source, [{ kind: 'atelier_1_2', amount: value, enabled: true }], 'L', () => seen.push(value));
    const finish = () => {
      const job = worker.messages.filter(m => m.effects).at(-1);
      worker.onmessage({ data: { id: job.id, result: { width: 1920, close() {} } } });
    };
    submit(1);
    await Promise.resolve(); await Promise.resolve();
    for (let value = 2; value <= 80; value++) {
      submit(value);
      if (value % 4 === 0) finish();
      await Promise.resolve();
    }
    finish();
    assert.ok(seen.length >= 20, `Only ${seen.length} frames arrived during the drag`);
    assert.equal(seen.at(-1), 80);
    assert.ok(seen.every((v, i) => i === 0 || v > seen[i - 1]));
    assert.equal(worker.messages.filter(m => m.kind === 'supersede').length, 0);
    assert.ok(worker.messages.filter(m => m.effects).length <= 22, 'pending pointer values must coalesce');
    dispose();
  } finally { Object.assign(global, old); }
});

test('changing the source during a drag discards the obsolete cel and a cache miss retains the latest settings', async () => {
  const old = { Worker: global.Worker, createImageBitmap: global.createImageBitmap, window: global.window };
  let worker, process;
  class WorkerMock {
    messages = [];
    constructor() { worker = this; }
    postMessage(message) { this.messages.push(message); }
    terminate() {}
  }
  Object.assign(global, { Worker: WorkerMock, createImageBitmap: async source => ({ ...source, close() {} }), window: { dispatchEvent() {} } });
  try {
    const dispose = loadClient(fn => process = fn).installEffectsWorker();
    const seen = [], a = { width: 20 }, b = { width: 20 };
    process(a, [{ amount: 10 }], 'L', () => seen.push('old cel'));
    await Promise.resolve(); await Promise.resolve();
    const first = worker.messages.filter(m => m.effects).at(-1);
    process(b, [{ amount: 20 }], 'L', () => seen.push('new cel'));
    let closed = false;
    worker.onmessage({ data: { id: first.id, result: { close() { closed = true; } } } });
    assert.equal(closed, true);
    assert.deepEqual(seen, []);
    await Promise.resolve(); await Promise.resolve();
    const second = worker.messages.filter(m => m.effects).at(-1);
    process(b, [{ amount: 90 }], 'L', () => seen.push('latest'));
    worker.onmessage({ data: { id: second.id, error: `Uncached effect source ${second.sourceId}` } });
    await Promise.resolve(); await Promise.resolve();
    const final = worker.messages.filter(m => m.effects).at(-1);
    assert.equal(final.effects[0].amount, 90);
    worker.onmessage({ data: { id: final.id, result: { close() {} } } });
    assert.deepEqual(seen, ['latest']);
    dispose();
  } finally { Object.assign(global, old); }
});
