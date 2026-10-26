"""Phase AL browser pixel regression: manual selection geometry and contour refinement.
Runs the actual exported CutoutWorkspace helpers inside Chromium Canvas2D."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,os,json
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
script=subprocess.check_output(['node','-e','''const ts=require('typescript'),fs=require('fs');
process.stdout.write(ts.transpileModule(fs.readFileSync('src/components/CutoutWorkspace.tsx','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},fileName:'CutoutWorkspace.tsx'}).outputText);'''],cwd=root,text=True,env=env)
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 outcome=page.evaluate('''source => {
 const mod={exports:{}};new Function('module','exports','require',source)(mod,mod.exports,()=>({}));
 const {paintCutoutCommand,refineCutoutMask}=mod.exports;
 const sourceImage=document.createElement('canvas');sourceImage.width=128;sourceImage.height=80;
 const sc=sourceImage.getContext('2d');sc.fillStyle='#ffffff';sc.fillRect(0,0,128,80);sc.fillStyle='#9933ff';sc.fillRect(24,20,64,45);
 const mask=document.createElement('canvas');mask.width=128;mask.height=80;
 const mc=mask.getContext('2d');
 const keep={tool:'polygon',operation:'keep',size:12,points:[{x:24,y:20},{x:88,y:20},{x:88,y:65},{x:24,y:65}]};
 paintCutoutCommand(mc,keep);
 const alpha=(c,x,y)=>c.getContext('2d').getImageData(x,y,1,1).data[3];
 const prior=alpha(mask,50,45);
 const remove={tool:'line',operation:'remove',size:11,points:[{x:52,y:29},{x:52,y:60}]};
 paintCutoutCommand(mc,remove);const erased=alpha(mask,52,45);
 mc.clearRect(0,0,128,80);paintCutoutCommand(mc,keep);const undone=alpha(mask,52,45);
 paintCutoutCommand(mc,remove);const smooth=refineCutoutMask(mask,0,0,true);
 const feather=refineCutoutMask(mask,2,0,true);
 const preview=document.createElement('canvas');preview.width=128;preview.height=80;
 const pc=preview.getContext('2d');pc.drawImage(sourceImage,0,0);pc.globalCompositeOperation='destination-in';pc.drawImage(feather,0,0);pc.globalCompositeOperation='source-over';
 const result={kept:prior,erased,undone,smoothedEdge:alpha(smooth,24,40),featheredEdge:alpha(feather,24,40),
  outside:alpha(preview,2,2),inside:alpha(preview,40,40),erasedHole:alpha(preview,52,45),
  subjectRgb:Array.from(pc.getImageData(40,40,1,1).data).slice(0,3),
  width:feather.width,height:feather.height};
 return result;
 }''',script)
 print('PHASE_AL_MASK_BROWSER',json.dumps(outcome))
 assert outcome['kept']==255
 assert outcome['erased']==0
 assert outcome['undone']==255
 assert outcome['outside']==0
 assert outcome['inside']==255
 assert outcome['erasedHole']<6
 assert outcome['subjectRgb']==[153,51,255]
 assert outcome['width']==128 and outcome['height']==80
 browser.close()
 print('PHASE_AL_NATIVE_MASK_PIXELS_PASSED')
