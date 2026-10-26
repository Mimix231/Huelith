/* Small in-browser behavioral regression for live Studio draft -> exact handoff. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const base = path.resolve(__dirname, '../src/editor');
const bundle = {};
for (const name of [
  'canvas-surface', 'types', 'geometry', 'parametric-shapes', 'typography',
  'effect-catalog', 'effect-schema', 'advanced-ops', 'color-reconstruction',
  'detail-reconstruction', 'subject-outline', 'creative-reconstruction',
  'stylize-reconstruction', 'subject-segmentation', 'effect-ops', 'preview-quality', 'live-color-lut',
  'live-gpu-effects', 'fx', 'creative', 'creative-render', 'render',
]) {
  bundle[name] = ts.transpileModule(fs.readFileSync(path.join(base, name + '.ts'), 'utf8'), {
    fileName: name + '.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const loader = `(() => {
 const compiled = ${JSON.stringify(bundle)}; const loaded = {};
 function load(name) {
   if (loaded[name]) return loaded[name];
   if (!(name in compiled)) throw Error('Missing test dependency ' + name);
   const module={exports:{}};
   new Function('require','module','exports',compiled[name])(
     spec => load(spec.replace('./','')),module,module.exports);
   loaded[name]=module.exports;return module.exports;
 }
 window.PreviewContract={...load('preview-quality'),...load('live-gpu-effects'),
    ...load('live-color-lut'),...load('effect-ops'),...load('fx'),...load('render')};
})();`;
const result = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'live-preview-integration.py')], {
  input: loader, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024,
});
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
