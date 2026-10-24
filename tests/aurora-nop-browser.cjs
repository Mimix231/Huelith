const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'../src/editor');
const names=['canvas-surface','immutable-effect-sources','types','effect-catalog','effect-schema',
 'advanced-ops','color-reconstruction','detail-reconstruction','subject-outline','creative-reconstruction',
 'stylize-reconstruction','aurora-expansion', 'effect-ops','effect-stack-cache','preview-quality','fx'];
const modules=Object.fromEntries(names.map(name=>[name,ts.transpileModule(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{
 fileName:name+'.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText]));
const script=`(()=>{const modules=${JSON.stringify(modules)},cache={};function load(name){const id=name.replace('./','');
 if(cache[id])return cache[id];const module={exports:{}};cache[id]=module.exports;
 new Function('require','module','exports',modules[id])(load,module,module.exports);cache[id]=module.exports;return module.exports;}
 window.AuroraNOP={...load('fx'),...load('effect-ops'),...load('effect-stack-cache')};})();`;
const run=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'aurora-nop-browser.py')],{
 input:script,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');
if(run.error)process.stderr.write(run.error.message+'\n');
process.exit(run.status??1);
