"""Small, deliberately strict behavioral probes; NOT certification of all 221 effects."""
from pathlib import Path
import subprocess, os, json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
script="""const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)"""
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
trans=lambda name:subprocess.check_output(['node','-e',script,str(root/'src/editor'/name)],text=True,env=env)
code=trans('expansion-120.ts');style=trans('stylize-reconstruction.ts');schema=trans('effect-schema.ts')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page()
 results=page.evaluate('''({code,style,schema})=>{
  const modules={};
  const factory=(text)=>{const m={exports:{}};new Function('module','exports','require',text)(m,m.exports,
    id=>id==='./canvas-surface'?{createSurface:()=>document.createElement('canvas')}:
      id==='./expansion-120'?modules.expansion:{});return m.exports;};
  modules.expansion=factory(code);modules.style=factory(style);modules.schema=factory(schema);
  const makeCanvas=(w,h)=>{let c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  let source=makeCanvas(80,80),ctx=source.getContext('2d');
  const grad=ctx.createLinearGradient(0,0,80,80);grad.addColorStop(0,'#151730');grad.addColorStop(.45,'#bd4b7b');grad.addColorStop(1,'#baffff');ctx.fillStyle=grad;ctx.fillRect(0,0,80,80);
  ctx.fillStyle='white';ctx.fillRect(6,14,38,8);ctx.fillStyle='black';ctx.fillRect(20,12,19,54);
  const bytes=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  const base=bytes(source),diff=(a,b)=>Array.from(a).reduce((sum,v,i)=>sum+(v!==b[i]?1:0),0);
  const exp=modules.expansion,render=(kind,amount=90,parameters={})=>exp.renderExpansion120(source,{kind,amount,parameters});
  const noChange=[],zeroLeaks=[],distinct=new Set();
  for(const def of exp.EXPANSION_120){const current=bytes(render(def.kind,90));
    if(!diff(current,base))noChange.push(def.label);
    if(diff(bytes(render(def.kind,0)),base))zeroLeaks.push(def.label);
    distinct.add(Array.from(current).join(','));
  }
  const styleNoChange=[],styleZeroLeaks=[];
  for(const kind of ['sketch','ink','comicink','cartoon']){
    if(!diff(bytes(modules.style.drawStyle(source,{kind,amount:90})),base))styleNoChange.push(kind);
    if(diff(bytes(modules.style.drawStyle(source,{kind,amount:0})),base))styleZeroLeaks.push(kind);
  }
  const sortInput=makeCanvas(80,5),sortCtx=sortInput.getContext('2d');
  for(let y=0;y<5;y++)for(let x=0;x<80;x++){
    const j=(x*37+y*71)%240;sortCtx.fillStyle=`rgb(${j},${Math.max(0,j-23)},${Math.min(255,j+7)})`;sortCtx.fillRect(x,y,1,1);
  }
  const sorted=exp.renderExpansion120(sortInput,{kind:'atelier_3_12',amount:100,parameters:{threshold:0}});
  const rowSig=(d,y)=>{
    let a=[];for(let x=0;x<80;x++){const i=(y*80+x)*4;a.push(`${d[i]},${d[i+1]},${d[i+2]},${d[i+3]}`);}return a.sort().join('|');};
  const pre=bytes(sortInput),post=bytes(sorted);
  const sortChanged=diff(pre,post)>0;
  const sortPixelsPreserved=Array.from({length:5},(_,y)=>rowSig(pre,y)===rowSig(post,y)).every(Boolean);
  const trans=makeCanvas(80,80),tc=trans.getContext('2d');tc.fillStyle='rgb(255 255 255)';tc.fillRect(31,31,14,14);
  const px=(arr,x,y)=>(y*80+x)*4;
  const halo=bytes(exp.renderExpansion120(trans,{kind:'atelier_7_0',amount:100,parameters:{frequency:80}}));
  const spreads=halo[px(halo,29,36)+3]>0;
  const noHaloCenter=halo[px(halo,0,0)+3]===0;
  const transparentIdentity=bytes(exp.renderExpansion120(trans,{kind:'atelier_7_0',amount:0}));
  const centerControl=(kind,p)=>diff(bytes(render(kind,90,{centerX:25,...p})),bytes(render(kind,90,{centerX:75,...p})))>0;
  const exposed=(k)=>modules.schema.EFFECT_PARAMETER_SCHEMA[k].map(c=>c.key);
  return {registered:exp.EXPANSION_120.length,distinct:distinct.size,noChange,zeroLeaks,styleNoChange,styleZeroLeaks,
     sortChanged,sortPixelsPreserved,spreads,noHaloCenter,haloZero:diff(transparentIdentity,bytes(trans))===0,
     eyeCenterMoves:centerControl('atelier_4_7',{}),ghostCenterMoves:centerControl('atelier_7_2',{}),
     pixelSortControls:exposed('atelier_3_12'),filmHalationControls:exposed('atelier_7_0'),
     energyEyeControls:exposed('atelier_4_7'),chromeControls:exposed('atelier_5_2')};
}''',{'code':code,'style':style,'schema':schema})
 browser.close()
 print(json.dumps(results,indent=2))
 assert results['registered']==120 and results['distinct']==120
 assert not results['noChange'],results['noChange']
 assert not results['zeroLeaks'],results['zeroLeaks']
 assert not results['styleZeroLeaks'],results['styleZeroLeaks']
 assert not results['styleNoChange'],results['styleNoChange']
 assert results['sortChanged'] and results['sortPixelsPreserved']
 assert results['spreads'] and results['noHaloCenter'] and results['haloZero']
 assert results['eyeCenterMoves'] and results['ghostCenterMoves']
 print('HUElITH_BEHAVIORAL_PROBES_PASS (not full artistic certification)')
