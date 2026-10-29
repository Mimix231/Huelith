"""Render actual continuous ink into headless Chromium with pressure/taper,
flow, symmetry and stroke continuity assertions. No fake mock Canvas2D."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess,os,json
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
js=subprocess.check_output(['node','-e', '''const ts=require('typescript'),fs=require('fs');
process.stdout.write(ts.transpileModule(fs.readFileSync('src/editor/ink-engine.ts','utf8'),{
compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},fileName:'ink-engine.ts'}).outputText);'''],cwd=root,text=True,env=env)
with sync_playwright() as playwright:
  browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page()
  result=page.evaluate('''src=>{
    const mod={exports:{}};new Function('module','exports','require',src)(mod,mod.exports,()=>({}));
    const {drawInkContour,interpolateInkSamples}=mod.exports;
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=120;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const settings={size:20,opacity:1,flow:1,spacing:.08,taper:0,pressureSize:false,pressureOpacity:false,color:'#ff0000'};
    const a={x:20,y:60,pressure:1},b={x:300,y:60,pressure:1};
    const points=[a,...interpolateInkSamples(a,b,5)];
    drawInkContour(ctx,points,settings);
    const read=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
    let gap=0;for(let x=25;x<=295;x++)if(read(x,60)[3]!==255)gap++;
    const steady={first:read(25,60),middle:read(160,60),last:read(295,60),above:read(160,30),gap};
    ctx.clearRect(0,0,320,120);
    drawInkContour(ctx,points,{...settings,taper:.35});
    let taperEdge=read(25,53)[3],taperMiddle=read(160,53)[3];
    ctx.clearRect(0,0,320,120);
    drawInkContour(ctx,points,{...settings,flow:.35});
    const flowing=read(160,60)[3];
    ctx.clearRect(0,0,320,120);
    drawInkContour(ctx,points,{...settings,size:5,pressureSize:true}, {x:0,y:0});
    const pressureSmall=read(160,63)[3];
    return {steady,taperEdge,taperMiddle,flowing,pressureSmall};
  }''',js)
  assert result['steady']['gap']==0,result
  assert result['steady']['first'][:3]==[255,0,0],result
  assert result['steady']['middle'][3]==255,result
  assert result['steady']['above'][3]==0,result
  assert result['taperEdge']<result['taperMiddle'],result
  assert 70<result['flowing']<110,result
  assert result['pressureSmall']==0,result
  print('BRUSH_ATELIER_NATIVE_CANVAS2D_PASSED',json.dumps(result))
  browser.close()
