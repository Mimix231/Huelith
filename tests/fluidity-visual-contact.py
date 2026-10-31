"""Generate a real Chromium contact sheet of native-resolution output for a reviewed subset.
Visual inspection is required in addition to pixel-change assertions.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,os,json,base64
root=Path(__file__).resolve().parent.parent
script=r'''const fs=require('fs'),path=require('path'),ts=require('typescript');
function all(d){let out=[];for(const f of fs.readdirSync(d,{withFileTypes:true})){
 let p=path.join(d,f.name);if(f.isDirectory())out.push(...all(p));else if(p.endsWith('.ts'))out.push(p);}return out;}
const root=path.resolve(process.argv[1]),mods={};for(const file of all(root)){
 let name=path.relative(root,file).replaceAll('\\','/').replace(/\.ts$/,'');
 mods[name]=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}
process.stdout.write(JSON.stringify(mods));'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
mods=json.loads(subprocess.check_output(['node','-e',script,str(root/'src/editor')],env=env))
art=base64.b64encode((root/'DrawingArtwork.png').read_bytes()).decode()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-gpu'])
 page=browser.new_page(viewport={'width':1200,'height':1050},device_scale_factor=1)
 page.evaluate('''async ({mods,art})=>{
 const cache={};function load(id){if(cache[id])return cache[id].exports;
  const module={exports:{}};cache[id]=module;if(!mods[id])throw Error('Missing '+id);
  new Function('module','exports','require',mods[id])(module,module.exports,name=>{
   const seg=id.split('/');seg.pop();for(const s of name.split('/')){if(s==='.')continue;if(s==='..')seg.pop();else seg.push(s);}return load(seg.join('/'));
  });return module.exports;}
 const apply=load('effect-ops').applyEffect,catalog=load('effect-catalog').FILTER_CATALOG,
 schema=load('effect-schema'),kinds=['exposure','levels','vibrance','oilpaint','watercolor','cartoon','ink','foil','aurora','sig_0','sig_1','sig_2','sig_3','sig_4','sig_6','sig_7','sig_8','sig_9','sig_10','sig_15','sig_16','sig_19','radiance','miasma'];
 const img=new Image();img.src='data:image/png;base64,'+art;await img.decode();
 const w=256,h=144,out=document.createElement('canvas');out.width=4*(w+16);out.height=6*(h+36);document.body.style.margin='0';document.body.appendChild(out);
 const ctx=out.getContext('2d');ctx.fillStyle='#19202b';ctx.fillRect(0,0,out.width,out.height);ctx.font='bold 13px sans-serif';ctx.textBaseline='top';
 for(let n=0;n<kinds.length;n++){
  const kind=kinds[n],entry=catalog.find(e=>e.kind===kind),base=document.createElement('canvas');base.width=w;base.height=h;
  base.getContext('2d').drawImage(img,0,0,w,h);
  let result=base;try{result=apply(base,{kind,amount:entry.initial,id:'x',enabled:true,parameters:schema.defaultParameters(kind)});}catch(e){console.error(kind,String(e));}
  const x=(n%4)*(w+16),y=Math.floor(n/4)*(h+36);
  ctx.drawImage(result,x,y+20,w,h);ctx.fillStyle='#e6f1f7';ctx.fillText(entry.label,x+4,y+2);
 }
}''',{'mods':mods,'art':art})
 destination=root/'docs'/'FLUIDITY_90_VISUAL_REVIEW.png'
 destination.parent.mkdir(exist_ok=True)
 page.screenshot(path=str(destination),full_page=True)
 browser.close()
 print(destination)
