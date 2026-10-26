const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const base = path.resolve(__dirname, '../src/editor');
const modules = {};
for (const name of [
  'canvas-surface','immutable-effect-sources','types','effect-catalog','effect-schema',
  'advanced-ops','color-reconstruction','detail-reconstruction','subject-outline',
  'creative-reconstruction','stylize-reconstruction','aurora-expansion','subject-segmentation', 'effect-ops',
  'effect-stack-cache','preview-quality','fx'
]) {
  modules[name] = ts.transpileModule(fs.readFileSync(path.join(base, `${name}.ts`), 'utf8'), {
    fileName: `${name}.ts`, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const script = `(()=>{const code=${JSON.stringify(modules)},instances={};
function load(name){const key=name.replace('./','');if(instances[key])return instances[key];
const module={exports:{}}; instances[key]=module.exports;
new Function('require','module','exports',code[key])(load,module,module.exports);instances[key]=module.exports;return module.exports;}
window.AuroraQRS={...load('effect-ops'),...load('fx'),...load('effect-stack-cache')};})();`;
const run = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname,'aurora-qrs-browser.py')], {
  input: script, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
if (run.error) process.stderr.write(`${run.error.message}\n`);
process.exit(run.status ?? 1);
