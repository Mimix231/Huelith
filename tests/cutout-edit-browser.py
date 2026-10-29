"""Cutout mask shape manipulation: real Chromium pixels before/after handle drag and undo."""
from playwright.sync_api import sync_playwright
import subprocess,os,json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
script="""const ts=require('typescript'),fs=require('fs');const file=process.argv[1];process.stdout.write(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)"""
files={name:subprocess.check_output(['node','-e',script,str(root/name)],text=True,env=env) for name in ['src/components/CutoutWorkspace.tsx','src/editor/cutout-edit.ts']}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page()
 result=page.evaluate('''files=>{
 const geom={exports:{}};new Function('module','exports','require',files['src/editor/cutout-edit.ts'])(geom,geom.exports,()=>({}));
 const mod={exports:{}};new Function('module','exports','require',files['src/components/CutoutWorkspace.tsx'])(mod,mod.exports,(id)=>id==='../editor/cutout-edit'?geom.exports:{});
 const g=geom.exports;const canvas=document.createElement('canvas');canvas.width=80;canvas.height=70;const ctx=canvas.getContext('2d');
 const paint=shapes=>{ctx.clearRect(0,0,80,70);for(const shape of shapes)mod.exports.paintCutoutCommand(ctx,shape);};
 const alpha=(x,y)=>ctx.getImageData(x,y,1,1).data[3];
 const original={id:'rect',tool:'rectangle',operation:'keep',size:5,points:[{x:15,y:15},{x:40,y:40}]};
 const resized=g.resizeCutout(original,0,{x:5,y:5});
 paint([original]);const a=[alpha(9,9),alpha(19,19)];
 paint([resized]);const b=[alpha(9,9),alpha(19,19)];
 const history=[{kind:'add',shape:original},{kind:'update',id:'rect',shape:resized}];
 paint(g.resolveCutoutHistory(history.slice(0,-1)));const undo=[alpha(9,9),alpha(19,19)];
 const line={id:'line',tool:'line',operation:'keep',size:7,points:[{x:10,y:50},{x:38,y:50}]};
 const moved=g.resizeCutout(line,1,{x:65,y:50});paint([moved]);const linePixel=alpha(55,50);
 return{a,b,undo,linePixel};
}''',files)
 assert result['a']==[0,255],result
 assert result['b']==[255,255],result
 assert result['undo']==[0,255],result
 assert result['linePixel']==255,result
 print('HUELITH_CUTOUT_EDIT_BROWSER_PASS',json.dumps(result))
 browser.close()
