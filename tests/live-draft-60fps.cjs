const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ts=require('typescript');
const src=fs.readFileSync(path.join(__dirname,'../src/editor/live-gpu-effects.ts'),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const result=spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname,'live-draft-60fps.py')],{
  input:js,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,
});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
process.exit(result.status??1);
