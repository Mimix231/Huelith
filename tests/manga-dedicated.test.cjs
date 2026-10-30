'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),M=require('node:module'),ts=require('typescript');
const old=M._extensions['.ts'];M._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,f);
const {DEDICATED_EFFECTS}=require('../src/editor/effects/index.ts');
const {defaultParameters,EFFECT_PARAMETER_SCHEMA}=require('../src/editor/effect-schema.ts');if(old)M._extensions['.ts']=old;
const w=133,h=91,s=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4;if(x<8||y<8||x>=w-8||y>=h-8)continue;
 s[i]=(x*13+y*3)%256;s[i+1]=(x*2+y*11)%256;s[i+2]=(x*17+y*7)%256;s[i+3]=(x<25||y<20)?135:255;
}
function render(id,p={},amount=.84){const out=new Uint8ClampedArray(s.length);
 DEDICATED_EFFECTS.get(id)({source:s,width:w,height:h,amount,parameters:{...defaultParameters(id),...p}}).renderRows(0,h,out);return out;}
function compare(a,b){let sum=0,pixels=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])+Math.abs(a[i+3]-b[i+3]);sum+=d;if(d>3)pixels++;}return {sum,pixels};}
for(let j=1;j<16;j++){
 const id=`atelier_4_${j}`;
 test(`${id} has independent artwork and zero-strength identity`,()=>{
  assert.ok(DEDICATED_EFFECTS.has(id));
  const d=compare(s,render(id));assert.ok(d.pixels>10,`${id}: invisible, ${JSON.stringify(d)}`);
  const zero=render(id,{},0);assert.equal(Buffer.compare(Buffer.from(s),Buffer.from(zero)),0,`${id} doesn't preserve zero strength`);
 });
 test(`${id} has no placebo visible settings`,()=>{
  const baseline=render(id);
  for(const control of EFFECT_PARAMETER_SCHEMA[id]){
   const diff=compare(baseline,render(id,{[control.key]:control.min===control.initial?control.max:control.min}));
   assert.ok(diff.sum>4,`${id}: ${control.key} is inert`);
  }
 });
}
test('Targeted eye energy is focused near specified location, not an entire-canvas tint',()=>{
 const effected=render('atelier_4_7',{centerX:50,centerY:50});
 const center=(Math.floor(h*.5)*w+Math.floor(w*.5))*4;
 const corner=(15*w+15)*4;
 const c=compare(s.subarray(center,center+4),effected.subarray(center,center+4));
 const a=compare(s.subarray(corner,corner+4),effected.subarray(corner,corner+4));
 assert.ok(c.sum>a.sum,'focal energy should be near the manual center');
});
