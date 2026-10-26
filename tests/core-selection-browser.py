"""Huelith pixel-editing regression in real Chromium Canvas2D: fill, stroke, clear,
while preserving pixels outside the selected transformed document rectangle."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess, os,json
root=Path(__file__).resolve().parent.parent
node_env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
js=subprocess.check_output(['node','-e', '''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync('src/editor/selection-actions.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},fileName:'selection-actions.ts'}).outputText)'''],cwd=root,text=True,env=node_env)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 result=page.evaluate('''async js=>{
 const module={exports:{}};const load=async source=>{const im=new Image();im.src=source;await im.decode();return im};
 new Function('module','exports','require',js)(module,module.exports,name=>name==='./render'?{decodeImage:load}:name==='./document-actions'?{
  cropRect:(r,w,h)=>{const x=Math.max(0,r.x),y=Math.max(0,r.y);return{x,y,width:Math.min(w-x,r.width),height:Math.min(h-y,r.height)}},
  validDimensions:(w,h)=>w>0&&h>0}:{});
 const c=document.createElement('canvas');c.width=40;c.height=24;
 const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,40,24);
 const base={image:c.toDataURL('image/png'),imageWidth:40,imageHeight:24,x:0,y:0,scaleX:1,scaleY:1,locked:false};
 const pick=async (action,layer,area,color='#00ff00',strokeWidth=2)=>{
  const result=await module.exports.prepareSelectionEdit(layer,area,action,color,strokeWidth,40,24);
  const im=await load(result.image);const cc=document.createElement('canvas');cc.width=40;cc.height=24;
  const ct=cc.getContext('2d');ct.drawImage(im,0,0);const at=(x,y)=>Array.from(ct.getImageData(x,y,1,1).data);
  return {left:at(1,1),center:at(18,10),border:at(10,10),inside:at(18,15),right:at(38,12),native:[result.width,result.height]};
 };
 const fill=await pick('fill',base,{x:10,y:5,width:20,height:13});
 const cleared=await pick('clear',base,{x:10,y:5,width:20,height:13});
 const stroked=await pick('stroke',base,{x:10,y:10,width:20,height:11});
 const shifted=await pick('fill',{...base,x:5,y:3},{x:15,y:8,width:20,height:12});
 return {fill,cleared,stroked,shifted};
}''',js)
 assert result['fill']['center']==[0,255,0,255],result
 assert result['fill']['left']==[255,0,0,255],result
 assert result['cleared']['center']==[0,0,0,0],result
 assert result['cleared']['right']==[255,0,0,255],result
 assert result['stroked']['border'][1]>=240,result
 assert result['stroked']['inside']==[255,0,0,255],result
 assert result['shifted']['center']==[0,255,0,255],result
 print('HUELITH_SELECTION_CHROMIUM_PIXELS_PASSED',json.dumps(result))
 browser.close()
