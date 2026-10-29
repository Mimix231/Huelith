"""Verify exact pixel parity between normal Order 7 effects and the
cooperative row processor, and check browser event-loop responsiveness."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess,os,json
root=Path(__file__).resolve().parent.parent
node_env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
transpile="""const ts=require('typescript'),fs=require('fs');const file=process.argv[1];
process.stdout.write(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,
compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);"""
code=subprocess.check_output(['node','-e',transpile,str(root/'src/editor/expansion-120.ts')],text=True,env=node_env)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 data=page.evaluate('''async code=>{
  const module={exports:{}};new Function('module','exports','require',code)(module,module.exports,id=>id==='./canvas-surface'?{
   createSurface:()=>document.createElement('canvas')}:{});
  const {renderExpansion120,createExpansion120Job,EXPANSION_120}=module.exports;
  const sample=document.createElement('canvas');sample.width=128;sample.height=104;
  const ctx=sample.getContext('2d');const grad=ctx.createLinearGradient(0,0,128,104);
  grad.addColorStop(0,'#d63164');grad.addColorStop(.5,'#3347ba');grad.addColorStop(1,'#58cdb6');
  ctx.fillStyle=grad;ctx.fillRect(0,0,128,104);ctx.fillStyle='#fdf2ac';ctx.fillRect(21,22,38,42);
  let mismatch=0,pieces=0;
  const varieties=[0,16,30,48,62,78,92,106];
  for(const idx of varieties){
    const effect={kind:EXPANSION_120[idx].kind,amount:72,enabled:true};
    const exact=renderExpansion120(sample,effect).getContext('2d').getImageData(0,0,128,104).data;
    const job=createExpansion120Job(sample,effect);
    let calls=0;while(!job.runRows(5)){calls++;if(calls>500)throw Error('Cooperative job never completed');}
    const sliced=job.output().getContext('2d').getImageData(0,0,128,104).data;
    pieces+=calls+1;
    if(exact.length!==sliced.length)mismatch++;
    for(let i=0;i<exact.length;i++)if(exact[i]!==sliced[i]){mismatch++;break;}
  }
  // Simulate the worker scanline scheduler with setTimeout breaks; unrelated
  // tasks must continue to receive event-loop turns as it paints a full image.
  const large=document.createElement('canvas');large.width=1024;large.height=640;
  const largeCtx=large.getContext('2d');largeCtx.fillStyle='#8442b9';largeCtx.fillRect(0,0,1024,640);
  const job=createExpansion120Job(large,{kind:'atelier_4_9',amount:80,enabled:true});
  let heartbeat=0,steps=0;const id=setInterval(()=>heartbeat++,8);
  await new Promise((resolve,reject)=>{const start=performance.now();const run=()=>{
    if(performance.now()-start>20000){reject(Error('Cooperative scanlines exceeded 20s'));return;}
    if(job.runRows(4)){resolve();return;}
    steps++;setTimeout(run,0);
  };run();});
  clearInterval(id);
  return {mismatch,pieces,heartbeat,steps,canvasSize:[job.output().width,job.output().height]};
 }''',code)
 assert data['mismatch']==0,data
 assert data['heartbeat']>=8,data
 assert data['steps']>=100,data
 assert data['canvasSize']==[1024,640],data
 print('HUElITH_COOPERATIVE_EXACT_PIXELS_AND_RESPONSIVENESS_PASS',json.dumps(data))
 browser.close()
