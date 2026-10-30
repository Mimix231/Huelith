"""Large transparent layer: full-resolution ROI must match uncropped CPU kernels."""
import os,subprocess,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
source_files=['canvas-surface','immutable-effect-sources','effects/spatial-gpu','effects/spatial-cpu','effects/motion-blur','effects/radial-blur','effects/lens-blur','effects/alpha-roi','blur-luminance']
script='''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
codes={f:subprocess.check_output(['node','-e',script,str(root/'src/editor'/f'{f}.ts')],env=env,text=True) for f in source_files}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page()
 r=page.evaluate('''codes=>{
 const modules={};function load(name){if(modules[name])return modules[name];let m={exports:{}};modules[name]=m.exports;
 new Function('require','exports','module',codes[name])(dependency=>{const parts=name.split('/');parts.pop();
 for(const part of dependency.split('/')){if(part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}return load(parts.join('/'));},m.exports,m);
 return m.exports;}
 const cpu=load('effects/spatial-cpu').renderSpatialCpu;
 const blur=load('blur-luminance').spatialBlurStable;
 const results=[];
 const w=960,h=540;
 const src=document.createElement('canvas');src.width=w;src.height=h;
 const ctx=src.getContext('2d');ctx.fillStyle='#d34679';ctx.fillRect(300,150,220,160);
 ctx.fillStyle='#fff0ae';ctx.fillRect(350,193,145,30);
 for(const mode of ['motion','radial','lens']){
 const fx={amount:39,enabled:true,parameters:{angle:30,centerX:43,centerY:46,focusRadius:16,blades:5}};
 let start=performance.now();const cropped=blur(src,fx,mode);const roiMs=performance.now()-start;
 start=performance.now();const full=cpu(src,fx,mode);const fullMs=performance.now()-start;
 const a=cropped.getContext('2d').getImageData(0,0,w,h).data,b=full.getContext('2d').getImageData(0,0,w,h).data;
 let sum=0,max=0,nonZero=0,alphaDiff=0;
 for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d);if(d>4)nonZero++;if(i%4===3&&d>3)alphaDiff++;}
 results.push({mode,roiMs:+roiMs.toFixed(1),fullMs:+fullMs.toFixed(1),meanDiff:+(sum/a.length).toFixed(4),max,nonZero,alphaDiff});
 }
 return results;
}''',codes)
 print(json.dumps(r,indent=2))
 assert all(x['meanDiff']<.6 for x in r),r
 print('FLUIDITY_TRANSPARENT_ROI_PASS')
 b.close()
