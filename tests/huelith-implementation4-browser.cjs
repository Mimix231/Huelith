const fs=require('node:fs'), path=require('node:path'), {spawnSync}=require('node:child_process');
const ts=require('typescript'),base=path.resolve(__dirname,'../src/editor');
const names=['canvas-surface','immutable-effect-sources','types','effect-catalog','effect-schema','advanced-ops',
  'color-reconstruction','detail-reconstruction','subject-outline','creative-reconstruction',
  'stylize-reconstruction','aurora-expansion','subject-segmentation', 'effect-ops','gradient'];
const code=Object.fromEntries(names.map(name=>[name,ts.transpileModule(fs.readFileSync(path.join(base,name+'.ts'),'utf8'),{
  fileName:name+'.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText]));
const js=`(()=>{const code=${JSON.stringify(code)},instances={};function load(name){const id=name.replace('./','');if(instances[id])return instances[id];const module={exports:{}};instances[id]=module.exports;new Function('require','module','exports',code[id])(load,module,module.exports);instances[id]=module.exports;return module.exports;}
window.Huelith4={...load('effect-ops'),...load('gradient')};})();`;
const run=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'huelith-implementation4-browser.py')],{
 input:js,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');
if(run.error)process.stderr.write(run.error.message+'\n');
process.exit(run.status??1);
