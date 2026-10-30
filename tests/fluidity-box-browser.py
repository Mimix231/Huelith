import os,subprocess,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
script='''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
codes={name:subprocess.check_output(['node','-e',script,str(root/'src/editor'/f'{name}.ts')],text=True,env=env) for name in ['detail-reconstruction','effects/box-blur']}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page()
 r=page.evaluate('''codes=>{
 const run=(name)=>{const m={exports:{}};new Function('module','exports','require',codes[name])(m,m.exports,()=>({createSurface:()=>document.createElement('canvas')}));return m.exports;};
 const legacy=run('detail-reconstruction').boxKernel,fast=run('effects/box-blur').renderBoxBlur;
 const samples=[];
 for(const [w,h] of [[320,210],[960,540],[1920,1080]]){
  const src=document.createElement('canvas');src.width=w;src.height=h;
  const ctx=src.getContext('2d');ctx.fillStyle='#d831a3';ctx.fillRect(0,0,w,h);
  ctx.clearRect(w*.15,h*.11,w*.57,h*.61);
  ctx.fillStyle='#26d0b3';ctx.fillRect(w*.3,h*.31,w*.24,h*.35);
  const fx={amount:17,enabled:true,parameters:{radiusY:9}};
  let t=performance.now();const old=legacy(src,fx);const oldMs=performance.now()-t;
  t=performance.now();const fresh=fast(src,fx);const fastMs=performance.now()-t;
  const a=old.getContext('2d').getImageData(0,0,w,h).data,b=fresh.getContext('2d').getImageData(0,0,w,h).data;
  let max=0,mean=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);mean+=d;}
  samples.push({w,h,oldMs:+oldMs.toFixed(1),fastMs:+fastMs.toFixed(1),max,mean:+(mean/a.length).toFixed(4)});
 }
 return samples;
}''',codes)
 print(json.dumps(r,indent=2))
 assert all(x['mean']<.2 and x['max']<=3 for x in r),r
 print('FLUIDITY_BOX_BLUR_PARITY_PASS')
 b.close()
