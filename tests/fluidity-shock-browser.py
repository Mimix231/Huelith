import os,subprocess,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
script='''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
names=['detail-reconstruction','effects/shock-zoom']
codes={name:subprocess.check_output(['node','-e',script,str(root/'src/editor'/f'{name}.ts')],text=True,env=env) for name in names}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page()
 r=page.evaluate('''codes=>{
 const map={};function load(name){if(map[name])return map[name];const m={exports:{}};map[name]=m.exports;
 new Function('module','exports','require',codes[name])(m,m.exports,id=>({createSurface:()=>document.createElement('canvas')}));return m.exports;}
 const original=load('detail-reconstruction').shockZoom,optimized=load('effects/shock-zoom').renderShockZoom;
 const result=[];
 for(const [w,h] of [[320,180],[960,540]]){
  const src=document.createElement('canvas');src.width=w;src.height=h;const c=src.getContext('2d');
  c.fillStyle='#535aab';c.fillRect(0,0,w,h);
  c.fillStyle='#ffffff';c.fillRect(w*.2,h*.3,w*.4,h*.35);
  const settings={amount:57,parameters:{centerX:40,centerY:64,bulge:55,radius:26,chromatic:32}};
  let t=performance.now();const a=original(src,settings);const oldMs=performance.now()-t;
  t=performance.now();const b=optimized(src,settings);const newMs=performance.now()-t;
  const A=a.getContext('2d').getImageData(0,0,w,h).data,B=b.getContext('2d').getImageData(0,0,w,h).data;
  let sum=0,max=0;for(let i=0;i<A.length;i++){const d=Math.abs(A[i]-B[i]);sum+=d;max=Math.max(max,d);}
  result.push({w,h,oldMs:+oldMs.toFixed(1),newMs:+newMs.toFixed(1),max,meanDiff:+(sum/A.length).toFixed(6)});
 }
 return result;
}''',codes)
 print(json.dumps(r,indent=2))
 assert all(x['max']<=1 for x in r),r
 print('FLUIDITY_SHOCK_ZOOM_REFERENCE_PARITY_PASS')
 b.close()
