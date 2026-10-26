const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const scripts = {};
const base = path.resolve(__dirname, '../src/editor');
for (const name of ['canvas-surface','immutable-effect-sources','effect-stack-cache','creative', 'originals-expansion',
  'creative-render','types','animation','effect-catalog','effect-schema','advanced-ops', 'color-reconstruction',
  'detail-reconstruction','subject-outline','creative-reconstruction','stylize-reconstruction',
  'preview-quality','geometry','parametric-shapes','aurora-expansion','subject-segmentation', 'effect-ops','fx','render','typography']) {
  scripts[name] = ts.transpileModule(fs.readFileSync(path.join(base, `${name}.ts`),'utf8'), {
    fileName:`${name}.ts`, compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
}
const script = `(()=>{
  const source = ${JSON.stringify(scripts)};
  const loaded = {}, inProgress = {};
  function load(name){
    name=name.replace('./','');
    if(loaded[name])return loaded[name];
    if(inProgress[name])return inProgress[name].exports;
    const mod={exports:{}};inProgress[name]=mod;
    new Function('require','module','exports',source[name])(load,mod,mod.exports);
    loaded[name]=mod.exports;delete inProgress[name];return mod.exports;
  }
  window.AnimationTrackTest = {...load('types'),...load('animation'),...load('render'),...load('fx')};
})();`;
const run = spawnSync('python3',[path.join(__dirname,'animation-track-browser.py')],{
  input:script,encoding:'utf8',timeout:85000,maxBuffer:2*1024*1024,
});
process.stdout.write(run.stdout??'');process.stderr.write(run.stderr??'');
if(run.error)process.stderr.write(`${run.error.message}\n`);
process.exit(run.status??1);
