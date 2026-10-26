const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{spawnSync}=require('node:child_process');
const base=path.join(__dirname,'../src/editor');
const names=['canvas-surface','subject-segmentation','immutable-effect-sources','types','effect-catalog','effect-schema',
  'advanced-ops','color-reconstruction','detail-reconstruction','subject-outline','creative-reconstruction','stylize-reconstruction',
  'aurora-expansion','effect-ops','fx'];
const files=Object.fromEntries(names.map(name=>[name,ts.transpileModule(fs.readFileSync(path.join(base,name+'.ts'),'utf8'),
  {fileName:name+'.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText]));
const bootstrap=`(()=>{const modules=${JSON.stringify(files)},cache={};function load(name){const id=name.replace('./','');if(cache[id])return cache[id];const module={exports:{}};cache[id]=module.exports;new Function('require','module','exports',modules[id])(load,module,module.exports);cache[id]=module.exports;return module.exports;}window.HuelithSeg={...load('effect-ops'),...load('subject-segmentation'),...load('fx')};})();`;
const result=spawnSync(process.env.PYTHON||'python3',[path.join(__dirname,'phase-aj-browser.py')],{input:bootstrap,encoding:'utf8',timeout:150000,maxBuffer:3*1024*1024});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.error)process.stderr.write(String(result.error)+'\n');
process.exit(result.status??1);
