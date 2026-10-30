'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const originalTs=Module._extensions['.ts'];
Module._extensions['.ts']=(mod,filename)=>{
  const text=fs.readFileSync(filename,'utf8');
  const compiled=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
  mod._compile(compiled.outputText,filename);
};
const base=path.resolve(__dirname,'../src/editor');
const {DEDICATED_EFFECTS}=require(path.join(base,'effects/index.ts'));
const {createExpansion120Job,renderExpansion120}=require(path.join(base,'expansion-120.ts'));
const {EFFECT_PARAMETER_SCHEMA,defaultParameters}=require(path.join(base,'effect-schema.ts'));
if(originalTs)Module._extensions['.ts']=originalTs;

const kinds=[
 ['atelier_4_0','Manga Screentones'],['atelier_3_12','Pixel Sorting'],
 ['atelier_7_0','Film Halation'],['atelier_7_1','Anamorphic Streak'],
 ['atelier_7_10','Rolling Shutter'],['atelier_7_2','Lens Ghost'],
 ['atelier_2_15','Stained Glass'],['atelier_7_11','Split Diopter'],
];
const w=96,h=64;
function image(){
  const src=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    // Hard transparent margins with non-black hidden RGB: tests accidental bleeding.
    src[i]=100+(x%5)*9;src[i+1]=90+(y%7)*13;src[i+2]=40+(x*y%13)*9;
    if(x<8||x>=w-8||y<8||y>=h-8)continue;
    src[i+3]=255;src[i]=((x*11+y*2)%190)+25;
    src[i+1]=((y*7+x*3)%185)+30;
    src[i+2]=((x*4+y*13)%205)+20;
  }
  for(const [x,y] of [[27,22],[70,43],[38,44]]){
    const i=(y*w+x)*4;src[i]=src[i+1]=src[i+2]=255;src[i+3]=255;
  }
  return src;
}
function run(kind,amount=1,settings={}){
  const src=image();const effect=DEDICATED_EFFECTS.get(kind);
  assert.ok(effect,`registered ${kind}`);
  const dst=new Uint8ClampedArray(src.length);
  const p={...defaultParameters(kind),...settings};
  const job=effect({source:src,width:w,height:h,amount,parameters:p});
  for(let y=0;y<h;y+=7)job.renderRows(y,Math.min(h,y+7),dst);
  return {src,dst};
}
const diff=(a,b)=>a.reduce((n,v,i)=>n+(v===b[i]?0:1),0);

// Canvas shim strictly models the ImageData APIs used by the real dispatcher.
class TestCanvas{
  constructor(src){this.width=w;this.height=h;this.pixels=src?new Uint8ClampedArray(src):new Uint8ClampedArray(w*h*4);}
  getContext(){const self=this;return {
    getImageData:()=>({data:new Uint8ClampedArray(self.pixels)}),
    createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),
    putImageData:(data)=>{self.pixels=new Uint8ClampedArray(data.data);},
  };}
}
const oldDocument=global.document;
global.document={createElement:()=>new TestCanvas()};

for(const [kind,label] of kinds){
  test(`${label}: integrated renderer changes artwork and preserves exact zero-strength identity`,()=>{
    const src=image();const input=new TestCanvas(src);
    const parameters=defaultParameters(kind);
    const effect={kind,id:'test',enabled:true,amount:100,parameters};
    const changed=renderExpansion120(input,effect);
    assert.ok(diff(src,changed.pixels)>20,`${label} made no meaningful pixel changes`);
    const zero=renderExpansion120(input,{...effect,amount:0});
    assert.deepEqual(zero.pixels,src,'zero strength must preserve hidden RGB and alpha as well');
    assert.deepEqual(input.pixels,src,'source must remain immutable');
  });
  test(`${label}: cooperative slices equal complete authoritative processing`,()=>{
    const input=new TestCanvas(image()),effect={kind,id:'test',enabled:true,amount:85,parameters:defaultParameters(kind)};
    const full=renderExpansion120(input,effect).pixels;
    const job=createExpansion120Job(input,effect);
    let count=0;
    while(!job.runRows(5)){if(++count>h)assert.fail('scanline job never completed');}
    assert.deepEqual(job.output().pixels,full,'preview/export divergence');
  });
  test(`${label}: every exposed control has a code path and changes output`,()=>{
    const controls=EFFECT_PARAMETER_SCHEMA[kind];
    assert.ok(controls.length>0);
    const src=image(),base=run(kind).dst;
    for(const control of controls){
      const v=control.initial;
      const target=v===control.min?control.max:control.min;
      const other=run(kind,1,{[control.key]:target}).dst;
      assert.ok(diff(base,other)>0,`${label}: ${control.key} didn't change any tested pixels`);
    }
  });
}

test('Pixel Sorting sorts real pixels, with alpha and original color multiset intact at full intensity',()=>{
  const {src,dst}=run('atelier_3_12',1,{threshold:0,angle:0});
  for(let y=8;y<h-8;y++){
    const sorted=[],original=[];
    for(let x=8;x<w-8;x++){
      const i=(y*w+x)*4;
      original.push([...src.subarray(i,i+4)].join(','));
      sorted.push([...dst.subarray(i,i+4)].join(','));
    }
    assert.deepEqual(sorted.sort(),original.sort(),`row ${y} lost source pixels`);
  }
});

test('Manga ink and stained glass do not paint transparent regions or change alpha',()=>{
  for(const kind of ['atelier_4_0','atelier_2_15']){
    const {src,dst}=run(kind);
    for(let i=0;i<src.length;i+=4){
      assert.equal(dst[i+3],src[i+3]);
      if(src[i+3]===0)assert.equal(dst[i+3],0);
    }
  }
});

test('Anamorphic Streak creates a horizontal falloff from a point highlight, rather than solid bands',()=>{
  const src=new Uint8ClampedArray(w*h*4);const y=29,x=29;
  const i=(y*w+x)*4;src[i]=src[i+1]=src[i+2]=255;src[i+3]=255;
  const out=new Uint8ClampedArray(src.length);
  DEDICATED_EFFECTS.get('atelier_7_1')({source:src,width:w,height:h,amount:1,parameters:{threshold:140,frequency:100}}).renderRows(0,h,out);
  const a=out[(y*w+x+4)*4+3],b=out[(y*w+x+20)*4+3];
  assert.ok(a>b && a>0,`expected distance falloff, got ${a} ${b}`);
  assert.equal(out[((y+10)*w+x+4)*4+3],0,'stray horizontal band outside emitter row');
});

test('Lens Ghost reflects bright features along optical axis with no full-canvas tint',()=>{
  const src=new Uint8ClampedArray(w*h*4),i=(30*w+21)*4;
  src[i]=src[i+1]=src[i+2]=255;src[i+3]=255;
  const out=new Uint8ClampedArray(src.length);
  DEDICATED_EFFECTS.get('atelier_7_2')({source:src,width:w,height:h,amount:1,parameters:{centerX:50,centerY:50,threshold:100,frequency:100}}).renderRows(0,h,out);
  let alpha=0;for(let p=0;p<w*h;p++)if(out[p*4+3]>0)alpha++;
  assert.ok(alpha>1,'no ghost emitted');
  assert.equal(out[0*4+3],0,'top-left corner should remain transparent');
});

test('Lighting effects preserve empty transparent images, including hidden RGB',()=>{
  for(const kind of ['atelier_7_0','atelier_7_1','atelier_7_2']){
    const source=new Uint8ClampedArray(w*h*4);
    for(let i=0;i<source.length;i+=4){source[i]=200;source[i+1]=41;source[i+2]=90;}
    const out=new Uint8ClampedArray(source.length);
    DEDICATED_EFFECTS.get(kind)({source,width:w,height:h,amount:1,parameters:defaultParameters(kind)}).renderRows(0,h,out);
    assert.deepEqual(out,source,`${kind} must not illuminate an empty source`);
  }
});
