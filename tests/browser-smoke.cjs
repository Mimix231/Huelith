/** Optional integration smoke test: Node TypeScript transpilation + Python Playwright + Chromium. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const sourceRoot = path.join(__dirname, '../src/editor');
const bundle = {};
for (const name of ['canvas-surface', 'immutable-effect-sources', 'creative', 'creative-render', 'effect-catalog', 'effect-schema', 'advanced-ops', 'color-reconstruction', 'detail-reconstruction', 'subject-outline', 'creative-reconstruction', 'stylize-reconstruction', 'preview-quality', 'types', 'animation', 'geometry', 'parametric-shapes', 'aurora-expansion', 'subject-segmentation', 'effect-ops', 'fx', 'effect-stack-cache', 'effects-worker', 'render', 'svg', 'brush', 'typography', 'store', 'clipboard']) {
  bundle[name] = ts.transpileModule(fs.readFileSync(path.join(sourceRoot, `${name}.ts`), 'utf8'), {
    fileName: `${name}.ts`,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

const script = `(() => {
  const source = ${JSON.stringify(bundle)};
  const loaded = {};
  function load(name) {
    if (loaded[name]) return loaded[name];
    const module = { exports: {} };
    const required = path => path === 'zustand' ? {
      create: initializer => {
        let state;
        const get = () => state;
        const set = action => { state = { ...state, ...(typeof action === 'function' ? action(state) : action) }; };
        state = initializer(set, get);
        const store = selector => selector ? selector(state) : state;
        store.getState = get;
        return store;
      },
    } : load(path.replace('./', ''));
    const compiled = new Function('require', 'module', 'exports', source[name]);
    compiled(required, module, module.exports);
    loaded[name] = module.exports;
    return loaded[name];
  }
  window.HuelithBundledModules = source;
  window.HuelithTest = { ...load('types'), ...load('creative'), ...load('creative-render'), ...load('animation'), ...load('geometry'), ...load('render'), ...load('effect-ops'), ...load('fx'), ...load('preview-quality'), ...load('brush'), ...load('clipboard'), ...load('store') };
})();`;

const executable = process.env.PYTHON ?? 'python3';
const result = spawnSync(executable, [path.join(__dirname, 'browser-smoke.py')], {
  input: script,
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
