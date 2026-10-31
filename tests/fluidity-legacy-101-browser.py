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
 for(const entry of catalog.filter(item=>!item.kind.startsWith('atelier_'))){
  const kind=entry.kind;
  const defaults=requireModule('effect-schema').defaultParameters(kind);
  const source={id:'test',kind,enabled:true,amount:entry.initial,
    color:['#fff2aa','#37e5ff','#592ba8','#fad2fc'][Math.abs(kind.length)%4],
    parameters:{...defaults,seed:31,frequency:60}};
  try{
   const t=performance.now(),rendered=fx.applyEffect(c,source),ms=performance.now()-t;
   const data=rendered.getContext('2d',{willReadFrequently:true}).getImageData(0,0,144,96).data;
   let rgbDiff=0,alphaDiff=0,visible=0;
   for(let i=0;i<data.length;i+=4){rgbDiff+=Math.abs(data[i]-start[i])+Math.abs(data[i+1]-start[i+1])+Math.abs(data[i+2]-start[i+2]);
    alphaDiff+=Math.abs(data[i+3]-start[i+3]);if(data[i+3])visible++;}
   const zero=fx.applyEffect(c,{...source,amount:0});const zd=zero.getContext('2d',{willReadFrequently:true}).getImageData(0,0,144,96).data;
   let zeroDiff=0;for(let i=0;i<zd.length;i++)zeroDiff+=Math.abs(zd[i]-start[i]);
   report.push({kind,ms:Math.round(ms*10)/10,rgbDiff,alphaDiff,visible,zeroDiff});
  }catch(error){report.push({kind,error:String(error)});}
 }
 return report;
}''',modules)
 browser.close()
 print(json.dumps(stats,indent=2))
 print('TOTAL',len(stats),'NONZERO',sum((r.get('rgbDiff',0)+r.get('alphaDiff',0))>100 for r in stats),'MAXMS',max(r.get('ms',0) for r in stats))
 errors=[r for r in stats if 'error' in r]
 if errors:
  print('FAILED',json.dumps(errors,indent=2));raise SystemExit(1)
 print('LEGACY_101_BROWSER_PASSED')
