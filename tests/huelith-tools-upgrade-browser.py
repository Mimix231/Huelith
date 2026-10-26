"""Pixel-level behavior checks for Gradients and editable Remove Background masks."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,subprocess,shutil
root=Path(__file__).resolve().parent.parent
node=shutil.which('node') or 'node'
cmd='''const fs=require('fs'),ts=require('typescript');process.stdout.write(JSON.stringify(['src/editor/gradient.ts','src/editor/effect-ops.ts'].map(f=>ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)));'''
env=os.environ.copy();env['NODE_PATH']=subprocess.check_output(['npm','root','-g'],text=True).strip()
import json
compiled=json.loads(subprocess.check_output([node,'-e',cmd],cwd=root,env=env,text=True))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 page.evaluate('''({modules})=>{
   const exports=[];
   const mock={ './canvas-surface':{createSurface:()=>document.createElement('canvas')},
     './aurora-expansion':{AURORA_NEW_KINDS:new Set()}, './stylize-reconstruction':{DRAWING_STYLES:new Set()},
     './color-reconstruction':{RECONSTRUCTED_COLOR_KINDS:new Set()}, };
   for(const code of modules){const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,k=>mock[k]||{});exports.push(m.exports);}
   window.gradient=exports[0];window.fx=exports[1];
 }''', {'modules':compiled})
 result=page.evaluate('''()=>{
  const base={kind:'gradient',fill:'none',stroke:'none',strokeWidth:0,width:180,height:120,
    gradientMode:'spiral',gradientTwist:2,gradientRepeats:4,
    gradientStops:[{id:'1',position:0,color:'#ff0088',opacity:1},{id:'2',position:1,color:'#0033ff',opacity:1}]};
  const data=c=>[...c.getContext('2d').getImageData(0,0,c.width,c.height).data];
  const diff=(a,b)=>a.filter((x,i)=>x!==b[i]).length;
  const regular=data(window.gradient.gradientShapeCanvas(base));
  const warped=data(window.gradient.gradientShapeCanvas({...base,gradientWave:55,gradientFrequency:7,gradientSkewX:65}));
  const shifted=data(window.gradient.gradientShapeCanvas({...base,gradientCenterX:.15,gradientCenterY:.8}));
  const mirrored=data(window.gradient.gradientShapeCanvas({...base,gradientMirror:true}));
  const input=document.createElement('canvas'); input.width=120;input.height=80;
  const c=input.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,120,80);c.fillStyle='#50308a';c.fillRect(35,15,50,50);
  const e=(options={})=>window.fx.applyEffect(input,{kind:'cutout',enabled:true,amount:50,parameters:{backgroundAuto:1,backgroundSampleColor:'#ffffff',backgroundEdgeGuard:16,...options}});
  const px=(canvas,x,y)=>canvas.getContext('2d').getImageData(x,y,1,1).data[3];
  const auto=e(), manual=e({backgroundAuto:0,maskStrokes:[{x:.45,y:.46,radius:10,mode:'remove'}]}),
    protectedResult=e({backgroundGlobal:1,maskStrokes:[{x:.05,y:.05,radius:8,mode:'keep'}]});
  return {
    wave:diff(regular,warped),center:diff(regular,shifted),mirror:diff(regular,mirrored),
    autoBackground: px(auto,2,2),autoSubject:px(auto,50,40),
    manualSubject:px(manual,55,38), protectedBackground:px(protectedResult,6,6),
    originalSubject:px(input,55,38)
  };
 }''')
 print('Huelith upgrade Chromium pixel checks:',result)
 assert result['wave']>100 and result['center']>100 and result['mirror']>100
 assert result['autoBackground']==0 and result['autoSubject']==255
 assert result['manualSubject']==0 and result['protectedBackground']==255
 assert result['originalSubject']==255
 browser.close()
print('CHROMIUM_UPGRADE_CHECKS_PASSED')
