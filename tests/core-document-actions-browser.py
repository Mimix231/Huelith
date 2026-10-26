"""Headless Chromium validates the new raster pixel resampling, color, alpha, rotations.
This is native Canvas2D pixel verification without mocking HTML canvas."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess, os, json
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
js=subprocess.check_output(['node','-e', '''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync('src/editor/document-actions.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},fileName:'document-actions.ts'}).outputText)'''],cwd=root,text=True,env=env)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 result=page.evaluate('''async js=>{
 const m={exports:{}};new Function('module','exports','require',js)(m,m.exports,name=>{
   if(name==='./render')return{decodeImage:async src=>{const image=new Image();image.src=src;await image.decode();return image;}};
   return{};
 });
 const input=document.createElement('canvas');input.width=6;input.height=4;const ic=input.getContext('2d');
 ic.fillStyle='#ff0000';ic.fillRect(0,0,3,4);ic.fillStyle='#0000ff';ic.fillRect(3,0,3,4);
 const source=input.toDataURL('image/png');const layer={type:'raster',image:source,imageWidth:6,imageHeight:4,x:0,y:0,visible:true,opacity:1,blend:'source-over',locked:false,id:'r',name:'test'};
 const d={width:6,height:4,layers:[layer]};
 const sample=async(action,mode)=>{
   const changes=await m.exports.prepareRasterAction(d,action,mode);const updated=changes.get(source);const image=new Image();image.src=updated.data;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=updated.width;canvas.height=updated.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   return {w:canvas.width,h:canvas.height,first:Array.from(ctx.getImageData(0,0,1,1).data),last:Array.from(ctx.getImageData(canvas.width-1,0,1,1).data)};
 };
 const enlarged=await sample({kind:'resize-image',width:12,height:8},'nearest');
 const flip=await sample({kind:'flip-horizontal'});
 const rotate=await sample({kind:'rotate-cw'});
 return {enlarged,flip,rotate};
}''',js)
 assert result['enlarged']=={'w':12,'h':8,'first':[255,0,0,255],'last':[0,0,255,255]},result
 assert result['flip']=={'w':6,'h':4,'first':[0,0,255,255],'last':[255,0,0,255]},result
 assert result['rotate']['w']==4 and result['rotate']['h']==6,result
 print('HUELITH_ACTIONS_CHROMIUM_PIXELS_PASSED',json.dumps(result))
 browser.close()
