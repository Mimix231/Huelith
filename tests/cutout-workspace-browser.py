from pathlib import Path
import json,subprocess,os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
js=subprocess.check_output(['node','-e', '''const ts=require('typescript'),fs=require('fs'); process.stdout.write(ts.transpileModule(fs.readFileSync('src/editor/render.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);'''], cwd=root,text=True,env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()})
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page()
 result=page.evaluate('''async code => {
   const mod={exports:{}};
   new Function('module','exports','require',code)(mod,mod.exports,id=>({
     './fx':{renderWithEffects:(ctx,layer,paint)=>paint(ctx,layer)},
     './creative-render':{paintCreativeLayer:(ctx,l,doc,paint)=>paint(ctx,l)},
     './geometry':{shapeBounds:()=>({x:0,y:0,width:10,height:10})},
     './gradient':{drawGradientShape:()=>{}},
     './parametric-shapes':{shapePath:()=>''},
     './typography':{transformText:s=>s},
   }[id] || {}));
   const render=mod.exports;
   const original=document.createElement('canvas');original.width=16;original.height=12;
   const oc=original.getContext('2d');oc.fillStyle='#f5f5f5';oc.fillRect(0,0,16,12);
   oc.fillStyle='#c81828';oc.fillRect(4,2,7,8);
   const mask=document.createElement('canvas');mask.width=16;mask.height=12;
   const mc=mask.getContext('2d');mc.fillStyle='#fff';mc.fillRect(4,2,7,8);
   const layer={type:'raster',id:'x',name:'subject',visible:true,locked:false,opacity:1,blend:'source-over',x:0,y:0,image:original.toDataURL(),
     cutoutMask:{data:mask.toDataURL(),width:16,height:12,enabled:true}};
   await Promise.all([render.decodeImage(layer.image),render.decodeImage(layer.cutoutMask.data)]);
   const output=document.createElement('canvas');output.width=16;output.height=12;
   const ctx=output.getContext('2d');render.renderLayer(ctx,layer);
   const sample=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
   const a=sample(0,0),b=sample(6,5);
   ctx.clearRect(0,0,16,12);render.renderLayer(ctx,{...layer,cutoutMask:{...layer.cutoutMask,enabled:false}});
   const c=sample(0,0),d=sample(6,5);
   ctx.clearRect(0,0,16,12);
   render.renderLayer(ctx,{...layer,x:1,y:1,rotation:180});
   const e=sample(1,1),f=sample(10,7);
   return {transparentOutside:a,opaqueInside:b,restoredBackground:c,restoredSubject:d,rotatedOutside:e,rotatedInside:f};
 }''',js)
 print('PIXEL_OUTPUT',json.dumps(result))
 assert result['transparentOutside'][3]==0
 assert result['opaqueInside']==[200,24,40,255]
 assert result['restoredBackground']==[245,245,245,255]
 assert result['restoredSubject']==[200,24,40,255]
 assert result['rotatedOutside'][3]==0
 b.close()
 print('CUTOUT_PIXEL_TESTS_PASSED')
