"""Chromium pixel-level behavior checks for transparent layers, cutout and emission."""
import json,subprocess,os
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
node=r'''const fs=require('fs'),path=require('path'),ts=require('typescript');function walk(d){let out=[];for(const item of fs.readdirSync(d,{withFileTypes:true})){
 let p=path.join(d,item.name);if(item.isDirectory())out.push(...walk(p));else if(p.endsWith('.ts'))out.push(p);}return out;}
const base=path.resolve(process.argv[1]),out={};for(const f of walk(base)){
 const k=path.relative(base,f).replaceAll('\\','/').replace(/\.ts$/,'');
 out[k]=ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}
process.stdout.write(JSON.stringify(out));'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
mods=json.loads(subprocess.check_output(['node','-e',node,str(root/'src/editor')],text=True,env=env))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu'])
 page=browser.new_page()
 values=page.evaluate('''mods=>{
 const cache={};function load(id){if(cache[id])return cache[id].exports;
 const m={exports:{}};cache[id]=m;new Function('module','exports','require',mods[id])(m,m.exports,name=>{
 let parts=id.split('/');parts.pop();for(const item of name.split('/')){if(item==='..')parts.pop();else if(item!=='.')parts.push(item);}return load(parts.join('/'));});return m.exports;}
 const apply=load('effect-ops').applyEffect;
 const src=document.createElement('canvas');src.width=120;src.height=96;let ctx=src.getContext('2d');
 ctx.fillStyle='#009900';ctx.fillRect(0,0,120,96);ctx.fillStyle='#2222ff';ctx.fillRect(33,23,60,52);
 const before=ctx.getImageData(0,0,120,96).data;
 let cut=apply(src,{id:'cutout',kind:'cutout',enabled:true,amount:85,parameters:{segmentationMode:'color',backgroundAuto:1,backgroundGlobal:0,backgroundSampleColor:'#009900',backgroundEdgeGuard:0,maskStrokes:[],decontaminate:0,feather:0}}).getContext('2d').getImageData(0,0,120,96).data;
 const at=(d,x,y,c)=>(d[(y*120+x)*4+c]);
 const result={cutoutBackgroundAlpha:at(cut,5,5,3),cutoutSubjectAlpha:at(cut,60,40,3),cutoutSourceUnmodified:before.every((v,i)=>v===src.getContext('2d').getImageData(0,0,120,96).data[i])};
 const transparent=document.createElement('canvas');transparent.width=120;transparent.height=96;
 const t=transparent.getContext('2d');t.fillStyle='#ff0000';t.fillRect(44,30,32,34);
 const old=t.getImageData(0,0,120,96).data;
 const glow=apply(transparent,{kind:'glow',id:'glow',enabled:true,amount:26,color:'#44d6ff',parameters:{glowMode:'outer',opacity:85,softness:10,spread:0}}).getContext('2d').getImageData(0,0,120,96).data;
 result.glowNearAlpha=at(glow,40,46,3);result.glowFarAlpha=at(glow,1,1,3);result.glowSourceCenter=at(glow,60,46,0);
 result.glowSourceUnmodified=old.every((v,i)=>v===transparent.getContext('2d').getImageData(0,0,120,96).data[i]);
 const atmos=apply(transparent,{kind:'miasma',id:'miasma',enabled:true,amount:80,color:'#662288',parameters:{radius:35,density:80,turbulence:70,opacity:90}}).getContext('2d').getImageData(0,0,120,96).data;
 result.miasmaNearAlpha=at(atmos,40,46,3);result.miasmaFarAlpha=at(atmos,1,1,3);
 return result;
}''',mods)
 print(json.dumps(values,indent=2))
 browser.close()
 assert values['cutoutBackgroundAlpha']<20,values
 assert values['cutoutSubjectAlpha']>220,values
 assert values['cutoutSourceUnmodified'],values
 assert values['glowNearAlpha']>0 and values['glowNearAlpha']>=values['glowFarAlpha'],values
 assert values['glowSourceUnmodified'],values
 assert values['miasmaNearAlpha']>=values['miasmaFarAlpha'],values
 print('LAYER_ALPHA_BEHAVIOR_PASSED')
