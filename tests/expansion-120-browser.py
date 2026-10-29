"""Exercise all 120 actual Canvas2D algorithms (not merely their catalog cards)."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess,os,json
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
script='''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
code=subprocess.check_output(['node','-e',script,str(root/'src/editor/expansion-120.ts')],text=True,env=env)
blur=subprocess.check_output(['node','-e',script,str(root/'src/editor/blur-luminance.ts')],text=True,env=env)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page()
 outputs=page.evaluate('''({code,blur})=>{
   const make=src=>{const m={exports:{}};new Function('module','exports','require',src)(m,m.exports,id=>id==='./canvas-surface'?{createSurface:()=>document.createElement('canvas')}:{}) ;return m.exports;};
   const lib=make(code),b=make(blur);const source=document.createElement('canvas');source.width=40;source.height=40;
   const ctx=source.getContext('2d');const grad=ctx.createLinearGradient(0,0,40,40);
   grad.addColorStop(0,'#30203a');grad.addColorStop(.4,'#cd3c62');grad.addColorStop(1,'#58bfe0');ctx.fillStyle=grad;ctx.fillRect(0,0,40,40);
   ctx.fillStyle='#fff1b9';ctx.fillRect(5,13,24,6);ctx.fillStyle='#131212';ctx.fillRect(17,2,12,25);
   const original=ctx.getImageData(0,0,40,40).data;
   const hashes=new Map(),changed=[],opaque=[],zero=[];
   function digest(image){const d=image.getContext('2d').getImageData(0,0,40,40).data;
     const str=Array.from(d).join(',');return str;}
   for(const entry of lib.EXPANSION_120){
     const effect={kind:entry.kind,amount:70,enabled:true};const output=lib.renderExpansion120(source,effect);
     const d=output.getContext('2d').getImageData(0,0,40,40).data;
     const pixels=Array.from(d);const key=pixels.join(',');hashes.set(entry.kind,key);
     changed.push(pixels.some((v,i)=>i%4!==3 && Math.abs(v-original[i])>1)?entry.kind:null);
     opaque.push(pixels.every((v,i)=>i%4!==3 || v===255)?null:entry.kind);
     const identity=lib.renderExpansion120(source,{...effect,amount:0}).getContext('2d').getImageData(0,0,40,40).data;
     zero.push(Array.from(identity).every((v,i)=>v===original[i])?null:entry.kind);
   }
   const unique=new Set(hashes.values());
   // All blur families must preserve a flat, opaque neutral area with no brightening.
   const uniform=document.createElement('canvas');uniform.width=uniform.height=28;
   const u=uniform.getContext('2d');u.fillStyle='#557799';u.fillRect(0,0,28,28);
   const blurStats={};const gaussian=b.gaussianBlurStable(uniform,6);
   const cases={gaussian, motion:b.spatialBlurStable(uniform,{kind:'motionblur',amount:50,parameters:{angle:30}},'motion'),
     radial:b.spatialBlurStable(uniform,{kind:'radialblur',amount:50,parameters:{}},'radial'),
     lens:b.spatialBlurStable(uniform,{kind:'lensblur',amount:50,parameters:{}},'lens')};
   for(const [name,surface] of Object.entries(cases)){
     const img=surface.getContext('2d').getImageData(0,0,28,28).data;
     blurStats[name]={minAlpha:255,maxAlpha:0,maxDiff:0,corner:[...img.slice(0,4)]};
     for(let i=0;i<img.length;i+=4){const s=blurStats[name];s.minAlpha=Math.min(s.minAlpha,img[i+3]);s.maxAlpha=Math.max(s.maxAlpha,img[i+3]);for(let k=0;k<3;k++)s.maxDiff=Math.max(s.maxDiff,Math.abs(img[i+k]-[85,119,153][k]));}
   }
   return {count:lib.EXPANSION_120.length,unique:unique.size,unchanged:changed.filter(v=>v!==null),brokenAlpha:opaque.filter(v=>v!==null),nonneutralZero:zero.filter(v=>v!==null),blurStats};
 }''',{'code':code,'blur':blur})
 print(json.dumps(outputs,indent=2))
 assert outputs['count']==120
 assert outputs['unique']>=110,'Some independently registered outputs collapse to the same artwork'
 assert not outputs['brokenAlpha'] and not outputs['nonneutralZero']
 assert len(outputs['unchanged'])>=110
 for effect,stats in outputs['blurStats'].items():
  assert stats['minAlpha']>=250,(effect,stats)
  assert stats['maxDiff']<=4,(effect,stats)
 b.close()
 print('HUElITH_120_NATIVE_CHROMIUM_PASS')
