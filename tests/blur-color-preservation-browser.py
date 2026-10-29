"""Chromium color/alpha fidelity for real applyEffect processing, stacked blurs."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess,os,json
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
script='''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
modules={name:subprocess.check_output(['node','-e',script,str(root/'src/editor'/f'{name}.ts')],text=True,env=env) for name in ['effect-ops','blur-luminance','detail-reconstruction','expansion-120']}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page()
 result=page.evaluate('''mods=>{
  const map={};const surface={createSurface:()=>document.createElement('canvas')};
  const exports=(name)=>{if(map[name])return map[name];let out={exports:{}};new Function('module','exports','require',mods[name])(out,out.exports,id=>{
    if(id==='./canvas-surface')return surface;
    if(id==='./detail-reconstruction')return exports('detail-reconstruction');
    if(id==='./blur-luminance')return exports('blur-luminance');
    if(id==='./expansion-120')return exports('expansion-120');
    if(id==='./aurora-expansion')return {AURORA_NEW_KINDS:new Set()};
    if(id==='./color-reconstruction')return {RECONSTRUCTED_COLOR_KINDS:new Set()};
    if(id==='./stylize-reconstruction')return {DRAWING_STYLES:new Set()};
    return {};
  });return map[name]=out.exports;};
  const operations=exports('effect-ops');
  const canvas=document.createElement('canvas');canvas.width=60;canvas.height=44;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#557799';ctx.fillRect(0,0,60,44);
  const names=['blur','surfaceblur','boxblur','motionblur','radialblur','lensblur','frosted','zoomblur','denoise','sharpen','unsharp'];
  const report=[];
  for(const kind of names){
    const source=operations.applyEffect(canvas,{kind,amount:kind==='blur'?7:kind==='surfaceblur'?7:15,enabled:true,parameters:{angle:35,threshold:60,radiusY:8}});
    const pixels=source.getContext('2d').getImageData(0,0,60,44).data;let maxdiff=0,minAlpha=255;
    for(let i=0;i<pixels.length;i+=4){minAlpha=Math.min(minAlpha,pixels[i+3]);for(let c=0;c<3;c++)maxdiff=Math.max(maxdiff,Math.abs(pixels[i+c]-[85,119,153][c]));}
    report.push({kind,maxdiff,minAlpha});
  }
  let stacked=canvas;
  for(const kind of ['blur','boxblur','surfaceblur','motionblur','radialblur','lensblur'])stacked=operations.applyEffect(stacked,{kind,amount:9,enabled:true,parameters:{threshold:60}});
  const data=stacked.getContext('2d').getImageData(0,0,60,44).data;
  let maxShift=0,minAlpha=255;
  for(let i=0;i<data.length;i+=4){minAlpha=Math.min(minAlpha,data[i+3]);for(let c=0;c<3;c++)maxShift=Math.max(maxShift,Math.abs(data[i+c]-[85,119,153][c]));}
  return{report,stack:{maxShift,minAlpha}};
 }''',modules)
 print(json.dumps(result,indent=2))
 for entry in result['report']:
  if entry['kind'] in ['blur','surfaceblur','boxblur','motionblur','radialblur','lensblur','denoise','sharpen','unsharp','frosted','zoomblur']:
   assert entry['maxdiff']<=4 and entry['minAlpha']>=250,entry
 assert result['stack']['maxShift']<=4 and result['stack']['minAlpha']>=250
 b.close()
 print('HUELITH_COLOR_PRESERVATION_PASSED')
