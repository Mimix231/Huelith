from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess, os, shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
node = shutil.which('node') or 'node'
script = "const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync('src/editor/effect-ops.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)"
env=os.environ.copy()
env['NODE_PATH']=subprocess.check_output(['npm','root','-g'],text=True).strip()
code=subprocess.check_output([node,'-e',script],cwd=root,env=env,text=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome') or '/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page()
 page.evaluate('''({code}) => {
  const m={exports:{}};
  const mocked={
    './canvas-surface':{createSurface:()=>document.createElement('canvas')},
    './aurora-expansion':{AURORA_NEW_KINDS:new Set()},
    './stylize-reconstruction':{DRAWING_STYLES:new Set()},
    './color-reconstruction':{RECONSTRUCTED_COLOR_KINDS:new Set()},
  };
  new Function('module','exports','require',code)(m,m.exports,id=>mocked[id]||{});
  window.appfx=m.exports.applyEffect;
}''', {'code':code})
 metrics=page.evaluate('''() => {
  const src=document.createElement('canvas');src.width=100;src.height=60;
  const c=src.getContext('2d');c.fillStyle='white';c.fillRect(0,0,100,60);
  c.fillStyle='#222244';c.fillRect(30,15,40,30);
  c.fillStyle='#ff2244';c.fillRect(45,20,10,15);
  const px=(canvas,x,y)=>[...canvas.getContext('2d').getImageData(x,y,1,1).data];
  const fx=(kind,amount,parameters={})=>window.appfx(src,{kind,amount,parameters,enabled:true});
  const chrom=fx('chromatic',40,{colorMix:80});
  const vhs=fx('vhs',80,{seed:25,density:90,scanlines:0});
  const glitch=fx('glitch',80,{seed:25,density:90});
  const cut=fx('cutout',30,{backgroundAuto:1,maskStrokes:[]});
  const keep=fx('cutout',30,{backgroundAuto:1,maskStrokes:[{x:.1,y:.1,radius:7,mode:'keep'}]});
  const manual=fx('cutout',30,{backgroundAuto:0,maskStrokes:[{x:.5,y:.5,radius:8,mode:'remove'}]});
  const data=canvas=>[...canvas.getContext('2d').getImageData(0,0,100,60).data];
  const b=data(src), a=data(chrom), v=data(vhs), g=data(glitch);
  const differences=(x,y)=>x.reduce((n,val,i)=>n+(val!==y[i]?1:0),0);
  return {
     chromaticDifferent: differences(b,a),vhsDifferent:differences(b,v),glitchDifferent:differences(b,g),
     distinctVhsChrom:differences(a,v), distinctVhsGlitch:differences(v,g),
     chromaticAlphaIdentical:!a.some((val,i)=>i%4===3&&val!==b[i]),
     cutBorderAlpha:px(cut,5,5)[3], cutSubjectAlpha:px(cut,40,25)[3],
     keepBorderAlpha:px(keep,10,6)[3], removeSubjectAlpha:px(manual,50,30)[3],
     removeOtherAlpha:px(manual,35,25)[3],
     vhsOnlyOriginalRGB:new Set(Array.from({length:100*60},(_,i)=>i).map(i=>v.slice(i*4,i*4+3).join(','))).size
  }
}''')
 print('BROWSER_PIXEL_METRICS',metrics)
 assert metrics['chromaticDifferent']>0
 assert metrics['vhsDifferent']>0
 assert metrics['glitchDifferent']>0
 assert metrics['distinctVhsChrom']>0 and metrics['distinctVhsGlitch']>0
 assert metrics['chromaticAlphaIdentical']
 assert metrics['cutBorderAlpha']==0 and metrics['cutSubjectAlpha']==255
 assert metrics['keepBorderAlpha']==255 and metrics['removeSubjectAlpha']==0 and metrics['removeOtherAlpha']==255
 # stylesheet readability on real rendered div for dark and light themes
 css=(root/'src/styles/shadow.css').read_text()+'\n'+(root/'src/styles/app.css').read_text()+'\n'+(root/'src/components/CreativeLab.css').read_text()
 page.set_content('<style>'+css+'</style><div class="app theme-shadow tone-dark"><aside class="creative-lab"><div class="creative-head"><strong>Huelith Originals</strong></div><div class="creative-content"><input class="creative-search" value="Find tools"></div></aside></div>')
 m=page.evaluate('''() => { const el=document.querySelector('.creative-lab'); const head=document.querySelector('.creative-head'); const input=document.querySelector('input');const col=e=>getComputedStyle(e);return {panel:col(el).backgroundColor,text:col(el).color,head:col(head).backgroundColor,inputBackground:col(input).backgroundColor,inputText:col(input).color}; }'''); print('DARK_THEME',m)
 assert 'rgb(' in m['panel'] and 'rgb(' in m['text']
 page.eval_on_selector('.app',"el=>{el.classList.replace('tone-dark','tone-light')}")
 m=page.evaluate("() => ({panel:getComputedStyle(document.querySelector('.creative-lab')).backgroundColor,text:getComputedStyle(document.querySelector('.creative-lab')).color})")
 print('LIGHT_THEME',m)
 b.close()
print('CHROMIUM_CHECKS_PASSED')
