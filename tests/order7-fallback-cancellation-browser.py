"""Chromium functional fallback check: source fidelity, nonblocking UI and
latest-only cancellation when rapidly changing an Order 7 slider."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,subprocess,os
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
transpile="""const ts=require('typescript'),fs=require('fs');const file=process.argv[1];
process.stdout.write(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,
compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);"""
scripts={name:subprocess.check_output(['node','-e',transpile,str(root/'src/editor'/name)],text=True,env=env) for name in ['expansion-120.ts','cooperative-effects-fallback.ts']}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page()
 values=page.evaluate('''async scripts=>{
 const x={exports:{}};new Function('module','exports','require',scripts['expansion-120.ts'])(x,x.exports,id=>id==='./canvas-surface'?{
  createSurface:()=>document.createElement('canvas')}:{});
 let processor=null;const mockFx={setAsyncEffectsProcessor:fn=>{processor=fn;}};
 const m={exports:{}};new Function('module','exports','require',scripts['cooperative-effects-fallback.ts'])(m,m.exports,id=>{
  if(id==='./fx')return mockFx;
  if(id==='./effect-ops')return {applyEffect:(source)=>source};
  if(id==='./expansion-120')return x.exports;
  throw Error('Unknown dependency '+id);
 });
 const dispose=m.exports.installCooperativeEffectsFallback();
 const source=document.createElement('canvas');source.width=650;source.height=410;
 const ctx=source.getContext('2d');const grad=ctx.createLinearGradient(0,0,650,410);
 grad.addColorStop(0,'#241a70');grad.addColorStop(.6,'#aa5493');grad.addColorStop(1,'#f4c9a0');
 ctx.fillStyle=grad;ctx.fillRect(0,0,650,410);
 let stale=0,fresh=0,heartbeats=0;
 const interval=setInterval(()=>heartbeats++,12);
 const first={kind:'atelier_4_9',amount:10,enabled:true},second={...first,amount:84};
 processor(source,[first],'layer-1',()=>stale++);
 let output;
 await new Promise((resolve,reject)=>{
   processor(source,[second],'layer-1',canvas=>{fresh++;output=canvas;resolve();});
   setTimeout(()=>reject(Error('Fallback stalled')),19000);
 });
 clearInterval(interval);dispose();
 const expected=x.exports.renderExpansion120(source,second);
 const a=expected.getContext('2d').getImageData(0,0,650,410).data;
 const b=output.getContext('2d').getImageData(0,0,650,410).data;
 let mismatch=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])mismatch++;
 return {stale,fresh,heartbeats,mismatch,correctDimensions:output.width===650&&output.height===410};
}''',scripts)
 assert values['stale']==0,values
 assert values['fresh']==1,values
 assert values['heartbeats']>=3,values
 assert values['mismatch']==0,values
 assert values['correctDimensions'],values
 print('HUELITH_FALLBACK_CANCEL_LATEST_EXACT_PASSED',json.dumps(values))
 browser.close()
