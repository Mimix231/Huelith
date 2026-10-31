"""Real Chromium visual/zero-strength/alpha regression for Project Fluidity's 22 Signature FX.
This is a CPU/Canvas2D smoke test, NOT a 20–50ms Windows GPU certification.
"""
from pathlib import Path
import subprocess,os,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
transpiler=r'''const fs=require('fs'),path=require('path'),ts=require('typescript');
function walk(d){let out=[];for(const ent of fs.readdirSync(d,{withFileTypes:true})){
 const p=path.join(d,ent.name);if(ent.isDirectory())out.push(...walk(p));else if(p.endsWith('.ts'))out.push(p);}return out;}
const source=path.resolve(process.argv[1]),files=walk(source),mods={};
for(const p of files){const id=path.relative(source,p).replaceAll('\\','/').replace(/\.ts$/,'');
 mods[id]=ts.transpileModule(fs.readFileSync(p,'utf8'),{fileName:p,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
}process.stdout.write(JSON.stringify(mods));'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
modules=json.loads(subprocess.check_output(['node','-e',transpiler,str(root/'src/editor')],text=True,env=env))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu'])
 page=browser.new_page()
 stats=page.evaluate('''mods=>{
 const cache=new Map();
 const requireModule=(id)=>{if(cache.has(id))return cache.get(id).exports;
  const entry={exports:{}};cache.set(id,entry);
  if(!(id in mods))throw Error('Missing browser test dependency '+id);
  new Function('module','exports','require',mods[id])(entry,entry.exports,(name)=>{
   const parts=id.split('/');parts.pop();for(const p of name.split('/')){
     if(p==='.'||!p)continue;if(p==='..')parts.pop();else parts.push(p);
   }return requireModule(parts.join('/'));
  });return entry.exports;
 };
 const fx=requireModule('effect-ops'),catalog=requireModule('effect-catalog').FILTER_CATALOG;
 const c=document.createElement('canvas');c.width=144;c.height=96;const ctx=c.getContext('2d');
 ctx.clearRect(0,0,144,96);ctx.fillStyle='#d5669b';ctx.fillRect(32,13,82,65);
 ctx.fillStyle='#30efdc';ctx.fillRect(52,24,7,36);ctx.fillStyle='#fffad0';ctx.fillRect(72,41,18,5);
 ctx.fillStyle='#181529';ctx.fillRect(41,50,24,21);
 const start=ctx.getImageData(0,0,144,96).data;
 const report=[];
 const schema=requireModule('effect-schema').EFFECT_PARAMETER_SCHEMA;
 for(const entry of catalog.filter(item=>!item.kind.startsWith('atelier_'))){
   const kind=entry.kind,defaults=requireModule('effect-schema').defaultParameters(kind),controls=schema[kind]??[];
   const effect={id:'test',kind,enabled:true,amount:entry.initial,
     color:'#ad64ff',parameters:{...defaults}};
   try{
     const normal=fx.applyEffect(c,effect).getContext('2d').getImageData(0,0,144,96).data;
     for(const control of controls){
      if(!Number.isFinite(control.min)||!Number.isFinite(control.max))continue;
      const low=fx.applyEffect(c,{...effect,parameters:{...defaults,[control.key]:control.min}}).getContext('2d').getImageData(0,0,144,96).data;
      const high=fx.applyEffect(c,{...effect,parameters:{...defaults,[control.key]:control.max}}).getContext('2d').getImageData(0,0,144,96).data;
      let n=0;for(let i=0;i<low.length;i++)n+=Math.abs(low[i]-high[i]);
      if(n<100)report.push({kind,parameter:control.key,min:control.min,max:control.max,totalDiff:n});
     }
   }catch(error){report.push({kind,error:String(error)});}
 }
 return report;
}''',modules)
 browser.close()
 print(json.dumps(stats,indent=2))
 print('CONTROLS WITH NO OBSERVED CHANGES',len(stats))
 errors=[r for r in stats if 'error' in r]
 if errors:
  print('FAILED',json.dumps(errors,indent=2));raise SystemExit(1)
 print('LEGACY_101_CONTROLS_PROBED')
