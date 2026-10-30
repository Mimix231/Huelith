"""Legacy detail processors: identity, alpha, actual edge behavior and measured update cost."""
import os,subprocess,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
names=['canvas-surface','immutable-effect-sources','effects/spatial-gpu','effects/spatial-cpu','effects/motion-blur','effects/radial-blur','effects/lens-blur','effects/alpha-roi','blur-luminance','effects/detail-gaussian','effects/sharpen','effects/unsharp-mask','effects/clarity','effects/texture-detail','effects/surface-blur','effects/noise-reduction']
script='''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
codes={s:subprocess.check_output(['node','-e',script,str(root/'src/editor'/f'{s}.ts')],env=env,text=True) for s in names}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page()
 r=page.evaluate('''codes=>{
 const cache={};function load(name){if(cache[name])return cache[name];const m={exports:{}};cache[name]=m.exports;
  new Function('module','exports','require',codes[name])(m,m.exports,dep=>{
   const parts=name.split('/');parts.pop();for(const s of dep.split('/')){if(s==='.')continue;if(s==='..')parts.pop();else parts.push(s);}return load(parts.join('/'));
  });return m.exports;}
 const modules=[['sharpen','renderSharpen'],['unsharp-mask','renderUnsharpMask'],['clarity','renderClarity'],['texture-detail','renderTextureDetail'],['surface-blur','renderSurfaceBlur'],['noise-reduction','renderNoiseReduction']];
 const source=document.createElement('canvas');source.width=960;source.height=540;
 const c=source.getContext('2d');c.fillStyle='#3254a9';c.fillRect(150,80,640,380);
 c.fillStyle='#fbedc0';c.fillRect(320,150,340,230);
 c.fillStyle='#0af';c.fillRect(300,180,120,130);
 for(let n=0;n<1600;n++){const x=152+(n*371)%635,y=82+(n*173)%375; c.fillStyle=n%2?'#3f69a9':'#46629b';c.fillRect(x,y,2,2);}
 const original=c.getImageData(0,0,960,540).data;
 load('immutable-effect-sources').markImmutableEffectSource(source);
 const results=[];
 for(const [file,name] of modules){
  const fn=load('effects/'+file)[name];
  const effect={amount:80,enabled:true,parameters:{radius:4,threshold:name==='renderSurfaceBlur'?95:4}};
  const start=performance.now(),first=fn(source,effect),coldMs=performance.now()-start;
  const next=performance.now(),second=fn(source,{...effect,amount:55}),warmMs=performance.now()-next;
  const a=first.getContext('2d').getImageData(0,0,960,540).data;
  let diff=0,alphaDiff=0;
  for(let i=0;i<a.length;i+=4){
   diff+=Math.abs(a[i]-original[i])+Math.abs(a[i+1]-original[i+1])+Math.abs(a[i+2]-original[i+2]);
   alphaDiff+=Math.abs(a[i+3]-original[i+3]);
  }
  results.push({name,coldMs:+coldMs.toFixed(1),warmMs:+warmMs.toFixed(1),meanRGBDelta:+(diff/(960*540*3)).toFixed(4),alphaDiff,zeroIdentity:fn(source,{...effect,amount:0})===source,warmOutput:second.width===960});
 }
 return results;
}''',codes)
 print(json.dumps(r,indent=2))
 assert all(x['alphaDiff']==0 and x['zeroIdentity'] and x['warmOutput'] and x['meanRGBDelta']>.005 for x in r),r
 print('FLUIDITY_DETAIL_PROCESSORS_PASS')
 b.close()
