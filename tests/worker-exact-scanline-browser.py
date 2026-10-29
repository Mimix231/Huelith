"""Actual Canvas2D pixel parity and mid-kernel cancellation in the dedicated worker graph."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,os,json
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
transpile='''const ts=require('typescript'),fs=require('fs');const file=process.argv[1];process.stdout.write(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
sources={key:subprocess.check_output(['node','-e',transpile,str(root/'src/editor'/f'{key}.ts')],text=True,env=env) for key in ['expansion-120','effect-stack-cache']}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 result=page.evaluate('''async src=>{
  const expansion={exports:{}};new Function('module','exports','require',src['expansion-120'])(expansion,expansion.exports,id=>
    id==='./canvas-surface'?{createSurface:()=>document.createElement('canvas')}:{});
  const cacheMod={exports:{}};
  const mark={markImmutableEffectSource:()=>{}};
  new Function('module','exports','require',src['effect-stack-cache'])(cacheMod,cacheMod.exports,id=>
    id==='./expansion-120'?expansion.exports:id==='./effect-ops'?{applyEffect:()=>{throw Error('Expanded operation must not use blocking effect kernel')}}:mark);
  const {EffectStackCache}=cacheMod.exports;
  const source=document.createElement('canvas');source.width=480;source.height=320;
  const ctx=source.getContext('2d');const grad=ctx.createLinearGradient(0,0,480,320);
  grad.addColorStop(0,'#2d2c8d');grad.addColorStop(1,'#e4a17d');ctx.fillStyle=grad;ctx.fillRect(0,0,480,320);
  const effect={kind:'atelier_4_9',amount:71,enabled:true};
  const expected=expansion.exports.renderExpansion120(source,effect);
  const cache=new EffectStackCache(96*1024*1024);
  let yields=0,heartbeats=0;
  const interval=setInterval(()=>heartbeats++,5);
  const rendered=await cache.renderCooperatively(7,source,[effect],()=>false,async()=>{yields++;await new Promise(resolve=>setTimeout(resolve,0));});
  clearInterval(interval);
  const a=expected.getContext('2d').getImageData(0,0,480,320).data;
  const b=rendered.getContext('2d').getImageData(0,0,480,320).data;
  let mismatches=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])mismatches++;
  const second={kind:'atelier_6_3',amount:85,enabled:true};
  let cancelChecks=0;
  const canceled=await cache.renderCooperatively(7,source,[effect,second],()=>++cancelChecks>2,
    async()=>await new Promise(resolve=>setTimeout(resolve,0)));
  const later=await cache.renderCooperatively(7,source,[effect,second],()=>false,
    async()=>await new Promise(resolve=>setTimeout(resolve,0)));
  const expectedLater=expansion.exports.renderExpansion120(expected,second);
  const c=later.getContext('2d').getImageData(0,0,480,320).data;
  const d=expectedLater.getContext('2d').getImageData(0,0,480,320).data;
  let mismatchLater=0;for(let i=0;i<c.length;i++)if(c[i]!==d[i])mismatchLater++;
  return{yields,heartbeats,mismatches,canceled:canceled===null,cancelChecks,mismatchLater,stages:cache.lastMetrics.stages};
 }''',sources)
 print('WORKER_EXACT_SCANLINE_CHECK',json.dumps(result))
 assert result['mismatches']==0 and result['mismatchLater']==0,result
 assert result['yields']>=30 and result['heartbeats']>4,result
 assert result['canceled'] and result['cancelChecks']>2,result
 browser.close()
 print('WORKER_EXACT_SCANLINE_PASS')
