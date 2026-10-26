const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const base = path.resolve(__dirname, '../src/editor');
const sources = {};
for (const name of [
  'canvas-surface', 'immutable-effect-sources', 'types', 'effect-catalog', 'effect-schema',
  'advanced-ops', 'color-reconstruction', 'detail-reconstruction',
  'subject-outline', 'creative-reconstruction', 'stylize-reconstruction',
  'aurora-expansion', 'subject-segmentation', 'effect-ops', 'preview-quality', 'fx',
]) {
  sources[name] = ts.transpileModule(fs.readFileSync(path.join(base, `${name}.ts`), 'utf8'), {
    fileName: `${name}.ts`,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const js = `(() => {
  const modules=${JSON.stringify(sources)};
  const instances={};
  function load(name) {
    const id=name.replace('./','');
    if(instances[id])return instances[id];
    const module={exports:{}};
    instances[id]=module.exports;
    new Function('require','module','exports',modules[id])((dep)=>load(dep),module,module.exports);
    instances[id]=module.exports;
    return module.exports;
  }
  window.AuthoritativeFX={...load('types'),...load('effect-ops'),...load('fx'),...load('preview-quality')};
})();`;
const run = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'authoritative-effect-preview.py')], {
  input: js, encoding: 'utf8', timeout: 90000, maxBuffer: 2 * 1024 * 1024,
});
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
if (run.error) process.stderr.write(`${run.error.message}\n`);
process.exit(run.status ?? 1);
