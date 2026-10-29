"""Native Chromium Canvas2D pixel validation for real tools, without synthetic rendered screenshots."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,os,subprocess
root=Path(__file__).resolve().parent.parent
node_env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
transpile="""const ts=require('typescript'),fs=require('fs');const file=process.argv[1];
process.stdout.write(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)"""
scripts={key:subprocess.check_output(['node','-e',transpile,str(root/'src/editor'/f'{key}.ts')],text=True,env=node_env) for key in ['raster-tools','cutout-edit','selection-mask']}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page()
 result=page.evaluate('''modules=>{
 const load=(key)=>{const m={exports:{}};new Function('module','exports','require',modules[key])(m,m.exports,()=>({}));return m.exports;};
 const tools=load('raster-tools'),selection=load('selection-mask');
 const canvas=document.createElement('canvas');canvas.width=72;canvas.height=44;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle='#ee0000';ctx.fillRect(0,0,36,44);ctx.fillStyle='#0044ee';ctx.fillRect(36,0,36,44);
 const source=ctx.getImageData(0,0,72,44);
 const contiguous=tools.floodRegion(source,10,10,5,true);let red=0,blue=0;
 for(let y=0;y<44;y++)for(let x=0;x<72;x++){if(contiguous[y*72+x]){if(x<36)red++;else blue++;}}
 const mask=tools.rasterPolygon(72,44,[{x:5,y:5},{x:30,y:5},{x:30,y:31},{x:5,y:31}]);
 const pixelSelection=selection.setPixelSelection('test',72,44,mask);
 const before=ctx.getImageData(0,0,72,44),changed=ctx.getImageData(0,0,72,44);
 const affected=new Uint8Array(72*44);affected.fill(255);tools.fillRegion(changed,affected,'#00ff00',1);
 selection.constrainPixels(before,changed,pixelSelection);
 const at=(data,x,y)=>Array.from(data.data.slice((y*72+x)*4,(y*72+x)*4+4));
 const inside=at(changed,10,10),outside=at(changed,50,10);
 ctx.putImageData(source,0,0);
 tools.retouchStamp(ctx,'dodge',{x:17,y:16},{x:16,y:16},9,.95,'#ffffff');const dodge=ctx.getImageData(17,16,1,1).data[0];
 tools.retouchStamp(ctx,'burn',{x:18,y:17},{x:17,y:16},9,.95,'#000000');const burn=ctx.getImageData(18,17,1,1).data[0];
 tools.retouchStamp(ctx,'patternBrush',{x:51,y:18},{x:50,y:17},10,1,'#33ff66',3);
 const pattern=at(ctx.getImageData(0,0,72,44),51,18);
 const edge=tools.magneticPoint(source,{x:34,y:20},7);
 return{red,blue,inside,outside,dodge,burn,pattern,edge,bounds:pixelSelection.bounds};
}''',scripts)
 print('HUELITH_DRAWING_PIXEL_CHECK',json.dumps(result))
 assert result['red']==36*44 and result['blue']==0
 assert result['inside']==[0,255,0,255] and result['outside']==[0,68,238,255]
 assert result['dodge']>238 and result['burn']<result['dodge']
 assert result['pattern'][1]>68
 assert 31<=result['edge']['x']<=39
 browser.close()
 print('HUELITH_DRAWING_NATIVE_BROWSER_PASS')
