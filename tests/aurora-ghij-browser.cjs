/** Real Chromium validation of Phase H's cached geometry and Phase I's cels. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src/editor');
const sources = {};
for (const name of [
  'canvas-surface', 'immutable-effect-sources', 'types', 'effect-catalog', 'effect-schema',
  'advanced-ops', 'color-reconstruction', 'detail-reconstruction', 'subject-outline',
  'creative-reconstruction', 'stylize-reconstruction', 'aurora-expansion', 'subject-segmentation', 'effect-ops', 'effect-stack-cache', 'preview-quality', 'fx',
]) {
  sources[name] = ts.transpileModule(fs.readFileSync(path.join(root, `${name}.ts`), 'utf8'), {
    fileName: `${name}.ts`,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const script = `(() => {
const modules=${JSON.stringify(sources)};
const instances={};
function load(name) {
 const id=name.replace('./','');
 if (instances[id]) return instances[id];
 const module={exports:{}};
 instances[id]=module.exports;
 new Function('require','module','exports',modules[id])((dep)=>load(dep),module,module.exports);
 instances[id]=module.exports;
 return module.exports;
}
window.AuroraGH={...load('immutable-effect-sources'),...load('effect-ops'),...load('effect-stack-cache'),...load('fx')};
})();`;
const start = Date.now();
const run = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'aurora-ghij-browser.py')], {
  input: script, encoding: 'utf8', timeout: 140_000, maxBuffer: 3 * 1024 * 1024,
});
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
if (run.error) process.stderr.write(run.error.message+'\n');
console.log(`Aurora G–J Chromium verification elapsed ${(Date.now()-start)/1000}s`);
process.exit(run.status ?? 1);
