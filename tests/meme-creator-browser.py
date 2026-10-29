"""Native Chromium pixel integration for editable Meme Creator geometry.
Runs the production drawShape renderer on real procedural caption data."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,subprocess,os
root=Path(__file__).resolve().parent.parent
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
source=subprocess.check_output(['node','-e', '''const ts=require('typescript'),fs=require('fs');const opts={compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}};let result={};for(const name of ['meme-creator','render'])result[name]=ts.transpileModule(fs.readFileSync((name==='render'?'src/editor/':'src/editor/')+name+'.ts','utf8'),opts).outputText;process.stdout.write(JSON.stringify(result));'''],cwd=root,text=True,env=env)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 result=page.evaluate('''payload=>{
  const source=JSON.parse(payload);
  let nextId=0;
  const types={uid:()=>`id-${++nextId}`,makeVector:(name)=>({id:`layer-${++nextId}`,name,type:'vector',visible:true,locked:false,opacity:1,blend:'source-over',x:0,y:0,shapes:[]}),makeRaster:(name)=>({id:`layer-${++nextId}`,name,type:'raster',visible:true,locked:false,opacity:1,blend:'source-over',x:0,y:0,image:''})};
  const load=(name)=>{const m={exports:{}};new Function('module','exports','require',source[name])(m,m.exports,id=>{
   if(id==='./types')return types;
   if(id==='./animation')return {ensureTrackEffects:()=>({}),syncActiveCel:()=>{}};
   if(id==='./geometry')return {shapeBounds:s=>({x:s.x,y:s.y,width:s.width,height:s.height})};
   if(id==='./parametric-shapes')return {shapePath:()=>''};
   if(id==='./typography')return {transformText:(t)=>t};
   return {};
  });return m.exports;};
  const meme=load('meme-creator'),renderer=load('render');
  const render=(layout)=>{
   const doc={width:640,height:400},settings={...meme.MEME_DEFAULTS,layout,
    top:'HELLO FROM HUELITH',bottom:'SECOND CAPTION'};
   const artwork=meme.composeMemeArtwork(doc,settings);
   const c=document.createElement('canvas');c.width=640;c.height=400;
   const ctx=c.getContext('2d');ctx.fillStyle='#4477bb';ctx.fillRect(0,0,640,400);
   for(const shape of [...artwork.backdrops,...artwork.captions])renderer.drawShape(ctx,shape);
   const pixels=ctx.getImageData(0,0,640,400).data;
   let changed=0,white=0,black=0;
   for(let i=0;i<pixels.length;i+=4){if(pixels[i]!==68||pixels[i+1]!==119||pixels[i+2]!==187)changed++;
    if(pixels[i]>220&&pixels[i+1]>220&&pixels[i+2]>220)white++;
    if(pixels[i]<50&&pixels[i+1]<50&&pixels[i+2]<50)black++;}
   return{changed,white,black,topPixel:Array.from(ctx.getImageData(320,0,1,1).data),center:Array.from(ctx.getImageData(320,195,1,1).data)};
  };
  return{classic:render('classic'),demotivational:render('demotivational'),caption:render('caption'),reaction:render('reaction')};
}''',source)
 assert result['classic']['changed']>1000,result
 assert result['demotivational']['black']>1000,result
 assert result['caption']['black']>1000,result
 assert result['classic']['center']==[68,119,187,255],result
 assert result['classic']['changed']!=result['reaction']['changed'],result
 print('HUELITH_MEME_CHROMIUM_PIXELS_PASSED',json.dumps(result))
 browser.close()
