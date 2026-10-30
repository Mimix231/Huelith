'use strict';
/* Source-level and pixel-output checks for independently authored Signalworks
   and Optica effects. No assertion equates pixels-changed with visual fidelity. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const original=Module._extensions['.ts'];
Module._extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {DEDICATED_EFFECTS}=require('../src/editor/effects/index.ts');
const {EFFECT_PARAMETER_SCHEMA,defaultParameters}=require('../src/editor/effect-schema.ts');
if(original)Module._extensions['.ts']=original;
const w=187,h=129,source=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4;
 // Explicit translucent edges, black negative space, color and true highlights.
 if(x<12||y<9||x>=w-12||y>=h-9)continue;
 source[i]=(x*3+y*7)%245;source[i+1]=(y*9+x)%235;source[i+2]=(x*13+y*4)%239;
 source[i+3]=x>18&&x<45?128:255;
 if((x-83)**2+(y-42)**2<80){source[i]=255;source[i+1]=245;source[i+2]=238;}
}
const cases={
 'atelier_6_0':'Databent Stripes','atelier_6_1':'Bitplane Crush','atelier_6_2':'Chromatic Ghost',
 'atelier_6_3':'Damaged Data Blocks','atelier_6_4':'Tracking Roll','atelier_6_5':'Codec Mosaic',
 'atelier_6_6':'Pixel Rearrangement','atelier_6_7':'Broken LCD','atelier_6_8':'Signal Static',
 'atelier_6_9':'Green Phosphor','atelier_6_10':'RGB Subpixel Mask','atelier_6_11':'Color Data Tears',
 'atelier_6_12':'Corrupted Sectors','atelier_6_13':'Dot Matrix Display',
 'atelier_7_3':'Edge Focus Vignette','atelier_7_4':'Prismatic Lens','atelier_7_5':'Star Filter',
 'atelier_7_6':'Cinematic Contrast Curve','atelier_7_7':'Film Negative','atelier_7_8':'Silver Retention',
 'atelier_7_9':'Lens Curvature','atelier_7_12':'Optical Color Fringe','atelier_7_13':'Golden Lens Flare',
};
function render(id,params={},strength=.78,frame=source){
 const factory=DEDICATED_EFFECTS.get(id);assert.ok(factory,`not registered ${id}`);
 const out=new Uint8ClampedArray(frame.length);
 const kernel=factory({source:frame,width:w,height:h,amount:strength,parameters:{...defaultParameters(id),...params}});
 for(let y=0;y<h;y+=5)kernel.renderRows(y,Math.min(h,y+5),out);
 return out;
}
function delta(a,b){let pixels=0,sum=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])+Math.abs(a[i+3]-b[i+3]);if(d>2)pixels++;sum+=d;}return {pixels,sum};}
for(const [id,name] of Object.entries(cases)){
 test(`${name}: registered, active, zero-amount is exact identity`,()=>{
   const full=render(id),v=delta(source,full);
   assert.ok(v.pixels>6,`${name}: no visible difference ${JSON.stringify(v)}`);
   const zero=render(id,{},0);assert.equal(Buffer.compare(Buffer.from(zero),Buffer.from(source)),0,`${name}: zero amount not identity`);
 });
 test(`${name}: controls have a measurable, non-placebo influence`,()=>{
   const base=render(id);
   for(const control of EFFECT_PARAMETER_SCHEMA[id]??[]){
    const limit=control.initial===control.min?control.max:control.min;
    const changed=render(id,{[control.key]:limit});
    assert.ok(delta(base,changed).sum>5,`${name}: ${control.key} inactive`);
   }
 });
}
test('All 23 independently authored outputs differ from one another',()=>{
  const seen=new Map();for(const [id,name] of Object.entries(cases)){
    const checksum=Buffer.from(render(id)).toString('base64');assert.ok(!seen.has(checksum),`${id} duplicates ${seen.get(checksum)}`);
    seen.set(checksum,name);
  }
});
test('Non-geometric color and signal effects leave transparent padding transparent',()=>{
 for(const id of Object.keys(cases).filter(id=>!['atelier_7_5','atelier_7_13','atelier_6_3','atelier_6_4','atelier_6_6','atelier_6_12'].includes(id))){
   const result=render(id);for(let i=0;i<result.length;i+=4)if(source[i+3]===0){
     assert.equal(result[i+3],0,`${id} opaque artifact in empty margin`);
   }
 }
});
test('Bitplane Crush actually removes low-order bits at full strength',()=>{
 const result=render('atelier_6_1',{},1);
 for(let i=0;i<result.length;i+=4)if(result[i+3])for(let c=0;c<3;c++)assert.equal(result[i+c]&7,0);
});
test('The film negative changes density order and remains separate from contrast grading',()=>{
 const result=render('atelier_7_7',{},1);
 const a=(18*w+19)*4,b=(18*w+20)*4;
 assert.ok(source[a]<source[b] ? result[a]>result[b] : result[a]<result[b]);
});
