'use strict';
/** Detects inert UI controls and accidental identical output among all 31
 * independent Paintoria/Materialia modules. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),M=require('node:module'),ts=require('typescript');
const prior=M._extensions['.ts'];M._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,f);
const {DEDICATED_EFFECTS}=require('../src/editor/effects/index.ts');
const {defaultParameters,EFFECT_PARAMETER_SCHEMA}=require('../src/editor/effect-schema.ts');if(prior)M._extensions['.ts']=prior;
const w=144,h=96,source=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4;
 // Smooth, textured and hard-edge regions together.
 if(x<5||y<5||x>w-6||y>h-6)continue;
 const d=((x*7+y*11)%77)+Math.round((x+y)/3);
 source[i]=Math.min(255,d+28);source[i+1]=Math.min(255,d+38+((x*13+y*7)%81));source[i+2]=Math.min(255,d+((x*3+y*5)%111));source[i+3]=x<19?128:255;
}
const ids=[...Array.from({length:18},(_,i)=>`atelier_2_${i}`),...Array.from({length:14},(_,i)=>`atelier_5_${i}`)];
function output(id,p={},amount=.8){const result=new Uint8ClampedArray(source.length);const factory=DEDICATED_EFFECTS.get(id);assert.ok(factory,`not registered ${id}`);
 factory({source,width:w,height:h,amount,parameters:{...defaultParameters(id),...p}}).renderRows(0,h,result);return result;}
function delta(a,b){let sum=0,px=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])+Math.abs(a[i+3]-b[i+3]);sum+=d;if(d>3)px++;}return {sum,px};}
for(const id of ids){
 test(`${id} produces visible stylistic output without affecting alpha or zero strength`,()=>{
  const out=output(id);assert.ok(delta(source,out).px>20,`${id} too weak`);
  const zero=output(id,{},0);assert.equal(Buffer.compare(Buffer.from(zero),Buffer.from(source)),0,`${id} zero not exact`);
  for(let i=0;i<source.length;i+=4)assert.equal(out[i+3],source[i+3],`${id} improperly changed alpha`);
 });
 test(`${id} controls affect processing`,()=>{
  const base=output(id);
  for(const control of EFFECT_PARAMETER_SCHEMA[id]??[]){
   const other=output(id,{[control.key]:control.initial===control.min?control.max:control.min});
   assert.ok(delta(base,other).sum>5,`${id}: ${control.key} does not change output`);
  }
 });
}
test('120/120 IDs have independent named processors; no fallback through expansion-120 switch',()=>{
 for(let f=0;f<8;f++)for(let v=0;v<[16,14,18,14,16,14,14,14][f];v++){
  assert.ok(DEDICATED_EFFECTS.has(`atelier_${f}_${v}`),`missing atelier_${f}_${v}`);
 }
 assert.equal(DEDICATED_EFFECTS.size,120);
});
test('All Paintoria + Materialia outcomes distinguishable on a mixed-source scene',()=>{
 const used=new Map();for(const id of ids){const k=Buffer.from(output(id)).toString('base64');assert.ok(!used.has(k),`${id} duplicates ${used.get(k)}`);used.set(k,id);}
});
