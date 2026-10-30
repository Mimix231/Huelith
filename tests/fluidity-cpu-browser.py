"""CPU blur quality/performance regression. Standalone Chromium, not Windows WebView2."""
import os,subprocess,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
cmd='''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
files=['canvas-surface','effects/spatial-cpu','effects/motion-blur','effects/radial-blur','effects/lens-blur']
code={f:subprocess.check_output(['node','-e',cmd,str(root/'src/editor'/f'{f}.ts')],env=env,text=True) for f in files}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page()
 result=page.evaluate('''codes=>{
 const loaded={};function load(name){if(loaded[name])return loaded[name];const m={exports:{}};loaded[name]=m.exports;
  new Function('module','exports','require',codes[name])(m,m.exports,dep=>{
    const parts=name.split('/');parts.pop();for(const seg of dep.split('/')){if(seg==='.')continue;if(seg==='..')parts.pop();else parts.push(seg);}return load(parts.join('/'));
  });return m.exports;
 }
 const kernels=['motion-blur','radial-blur','lens-blur'].map(k=>load('effects/'+k));
 const tests=[];
 for(const [w,h] of [[150,110],[960,540],[1920,1080]]){
  const source=document.createElement('canvas');source.width=w;source.height=h;const c=source.getContext('2d');
  c.fillStyle='#432c99';c.fillRect(0,0,w,h);c.clearRect(Math.floor(w*.14),Math.floor(h*.17),Math.ceil(w*.64),Math.ceil(h*.56));
  c.fillStyle='#f55542';c.fillRect(w*.35,h*.38,w*.21,h*.23);
  const original=c.getImageData(0,0,w,h).data;
  for(let k=0;k<3;k++){
    const effect={amount:44,parameters:{angle:36,centerX:45,centerY:41,focusRadius:18,blades:5}};
    const fn=[kernels[0].motionBlurCpu,kernels[1].radialBlurCpu,kernels[2].lensBlurCpu][k];
    const start=performance.now();const result=fn(source,effect);const duration=performance.now()-start;
    const pixels=result.getContext('2d').getImageData(0,0,w,h).data;
    let changed=0,fringe=0;for(let i=0;i<pixels.length;i+=4){
      if(Math.abs(pixels[i]-original[i])+Math.abs(pixels[i+1]-original[i+1])+Math.abs(pixels[i+3]-original[i+3])>9)changed++;
      if(pixels[i+3]>0 && pixels[i+3]<255)fringe++;
    }
    const zero=fn(source,{...effect,amount:0});
    tests.push({w,h,mode:['motion','radial','lens'][k],ms:+duration.toFixed(1),changed,fringe,zeroIdentity:zero===source});
  }
 }
 const plain=document.createElement('canvas');plain.width=320;plain.height=180;const c=plain.getContext('2d');c.fillStyle='#4a7db0';c.fillRect(0,0,320,180);
 const solid=[];for(let k=0;k<3;k++){
    const fn=[kernels[0].motionBlurCpu,kernels[1].radialBlurCpu,kernels[2].lensBlurCpu][k];
    const out=fn(plain,{amount:52,parameters:{angle:75,blades:6,focusRadius:30}});
    const d=out.getContext('2d').getImageData(0,0,320,180).data;let delta=0,least=255;
    for(let i=0;i<d.length;i+=4){least=Math.min(least,d[i+3]);delta=Math.max(delta,Math.abs(d[i]-74),Math.abs(d[i+1]-125),Math.abs(d[i+2]-176));}
    solid.push({mode:k,minAlpha:least,maxDiff:delta});
 }
 return {tests,solid};
}''',code)
 print(json.dumps(result,indent=2))
 assert all(row['zeroIdentity'] and row['changed']>20 for row in result['tests']),result
 assert all(row['minAlpha']==255 and row['maxDiff']<=2 for row in result['solid']),result
 print('FLUIDITY_CPU_CORRECTNESS_PASS')
 browser.close()
