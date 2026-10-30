'use strict';
/** Whole library contract: no catalog item may fall back to the old placeholder
 * renderer and each implementation must produce unique nontrivial reference
 * output. Visual fidelity still requires human testing of the actual UI. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),M=require('node:module'),ts=require('typescript');
const original=M._extensions['.ts'];M._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,f);
const {DEDICATED_EFFECTS}=require('../src/editor/effects/index.ts');
const {EXPANSION_120}=require('../src/editor/expansion-120.ts');
const {defaultParameters}=require('../src/editor/effect-schema.ts');
if(original)M._extensions['.ts']=original;
const w=161,h=127,source=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4;if(x<6||y<5||x>=w-6||y>=h-5)continue;
 source[i]=(x*19+y*7)%255;source[i+1]=(x*3+y*23)%255;source[i+2]=(x*17+y*11)%255;
 source[i+3]=x<22?110:255;
 if((x-84)**2+(y-61)**2<105){source[i]=255;source[i+1]=244;source[i+2]=210;}
}
function run(kind){const out=new Uint8ClampedArray(source.length),factory=DEDICATED_EFFECTS.get(kind);
 factory({source,width:w,height:h,amount:.85,parameters:defaultParameters(kind)}).renderRows(0,h,out);return out;}
test('exactly 120 distinct dedicated modules are registered in the production dispatcher',()=>{
 assert.equal(EXPANSION_120.length,120);assert.equal(DEDICATED_EFFECTS.size,120);
 for(const effect of EXPANSION_120)assert.ok(DEDICATED_EFFECTS.has(effect.kind),`Missing ${effect.kind}`);
 const raw=fs.readFileSync(path.join(__dirname,'../src/editor/expansion-120.ts'),'utf8');
 assert.doesNotMatch(raw,/switch\s*\(\s*section\s*\)/,'obsolete placeholder switch still exists');
});
test('all 120 effects preserve the input immutable and produce nonidentical reference output',()=>{
 const seen=new Map(),backup=Buffer.from(source);
 for(const def of EXPANSION_120){
   const out=run(def.kind);let pixels=0;
   for(let i=0;i<source.length;i+=4){
    if(Math.abs(out[i]-source[i])+Math.abs(out[i+1]-source[i+1])+Math.abs(out[i+2]-source[i+2])+Math.abs(out[i+3]-source[i+3])>3)pixels++;
   }
   assert.ok(pixels>5,`${def.label}: ineffective on varied opaque/transparent reference`);
   const hash=Buffer.from(out).toString('base64');assert.ok(!seen.has(hash),`${def.label} duplicates ${seen.get(hash)}`);seen.set(hash,def.label);
 }
 assert.equal(Buffer.compare(backup,Buffer.from(source)),0,'Source mutated by an effect');
});
