const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const source = {};
for (const name of ['creative', 'creative-render', 'types', 'animation', 'effect-catalog', 'effect-schema',
  'advanced-ops', 'color-reconstruction', 'detail-reconstruction', 'subject-outline', 'creative-reconstruction',
  'stylize-reconstruction', 'preview-quality', 'geometry', 'parametric-shapes', 'aurora-expansion', 'effect-ops', 'fx', 'render', 'typography']) {
  source[name] = ts.transpileModule(fs.readFileSync(path.join(__dirname, `../src/editor/${name}.ts`), 'utf8'), {
    fileName: `${name}.ts`, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const script = `(() => {
  const src = ${JSON.stringify(source)};
  const loaded = {};
  const loading = {};
  function load(name) {
    name = name.replace('./', '');
    if (loaded[name]) return loaded[name];
    if (loading[name]) return loading[name].exports;
    const module = { exports: {} };
    loading[name] = module;
    new Function('require', 'module', 'exports', src[name])((specifier) => load(specifier), module, module.exports);
    loaded[name] = module.exports;
    delete loading[name];
    return loaded[name];
  }
  window.Creatives = { ...load('creative'), ...load('creative-render'), ...load('types'), ...load('render'), ...load('animation') };
})();`;
const result = spawnSync('python3', [path.join(__dirname, 'creative-browser.py')], {
  input: script, encoding: 'utf8', timeout: 110000, maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) process.stderr.write(`${result.error}\n`);
process.exit(result.status ?? 1);
