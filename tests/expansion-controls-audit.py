"""Audits the visible controls in each expansion effect against one deterministic reference.
No-change does not prove always inert; it identifies controls requiring review.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import os, subprocess, json
root=Path(__file__).resolve().parent.parent
script="""const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)"""
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
code=lambda path:subprocess.check_output(['node','-e',script,str(root/'src/editor'/path)],text=True,env=env)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page()
 findings=page.evaluate('''({code,schema})=>{const evaluate=(text,imports={})=>{const m={exports:{}};new Function('module','exports','require',text)(m,m.exports,id=>imports[id]||{});return m.exports};
 const lib=evaluate(code,{'./canvas-surface':{createSurface:()=>document.createElement('canvas')}}),params=evaluate(schema,{'./expansion-120':lib});
 const src=document.createElement('canvas');src.width=src.height=48;const c=src.getContext('2d');const gradient=c.createLinearGradient(0,0,48,48);gradient.addColorStop(0,'#302032');gradient.addColorStop(.5,'#bf3468');gradient.addColorStop(1,'#8ff3d1');c.fillStyle=gradient;c.fillRect(0,0,48,48);c.fillStyle='#ffffff';c.fillRect(7,16,24,7);c.fillStyle='#111112';c.fillRect(29,7,10,29);
 const digest=e=>Array.from(lib.renderExpansion120(src,e).getContext('2d').getImageData(0,0,48,48).data).join(',');
 const result=[];
 for(const def of lib.EXPANSION_120){const controls=params.EFFECT_PARAMETER_SCHEMA[def.kind]??[];
  const neutral=Object.fromEntries(controls.map(c=>[c.key,c.initial]));const base=digest({kind:def.kind,amount:75,parameters:neutral});
  const inert=[];for(const control of controls){const alternative=control.initial===control.min?control.max:control.min;
   if(base===digest({kind:def.kind,amount:75,parameters:{...neutral,[control.key]:alternative}}))inert.push(control.key);
  }
  result.push({id:def.kind,name:def.label,exposed:controls.length,inert});
 }
 return result;
}''',{'code':code('expansion-120.ts'),'schema':code('effect-schema.ts')})
 b.close()
 bad=[r for r in findings if r['inert']]
 print('With visible controls only:',len(bad),'of 120 have ≥1 inert control in this reference')
 print('All inert controls:',sum(len(r['inert']) for r in findings),'of',sum(r['exposed'] for r in findings),'exposed controls')
 print('\n'.join(f"{x['name']}: {x['inert']}" for x in bad))
 (root/'docs'/'Huelith-visible-controls-audit.json').write_text(json.dumps(findings,indent=2))
