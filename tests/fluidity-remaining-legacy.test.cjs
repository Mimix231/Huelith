'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const old=Module._extensions['.ts'];Module._extensions['.ts']=(mod,filename)=>{
  const source=fs.readFileSync(filename,'utf8');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  mod._compile(js,filename);
};
const root=path.resolve(__dirname,'../src/editor/effects');
class FakeCanvas {constructor(w=1,h=1,bytes){this.width=w;this.height=h;this.pixels=bytes?new Uint8ClampedArray(bytes):new Uint8ClampedArray(w*h*4)}
 getContext(){const self=this;return {
 getImageData:(x,y,w,h)=>({width:w,height:h,data:new Uint8ClampedArray(self.pixels)}),
 putImageData:(image)=>{self.pixels=new Uint8ClampedArray(image.data);},
 createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
 };}
}
global.document={createElement:()=>new FakeCanvas()};
const colorNames=['exposure','highlights','shadows','whites','blacks','temperature','tint','vibrance','gamma','solarize','curves','levels','balance','selective','mixer','gradientmap','duotone'];
const detailNames=['film-grain','rgb-noise','emboss','edge-detection','halftone','dither','vignette','pixelate'];
const styleNames=['pencil-sketch','ink-drawing','comic-ink','cartoon'];
const warpNames=['swirl','ripple','wave','glass-refraction'];
const knownKinds={
 'film-grain':'grain','rgb-noise':'noise','edge-detection':'edges','pencil-sketch':'sketch','ink-drawing':'ink','comic-ink':'comicink','glass-refraction':'glass'
};
const effects={};for(const name of [...colorNames,...detailNames,...styleNames,...warpNames]){
 const mod=require(path.join(root,name+'.ts'));
 const fn='render'+name.split('-').map(k=>k[0].toUpperCase()+k.slice(1)).join('');
 assert.equal(typeof mod[fn],'function',name);effects[name]=mod[fn];
}
if(old)Module._extensions['.ts']=old;
const W=64,H=48;
const baseline=()=>{const d=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++) {const i=(y*W+x)*4;d[i]=(x*11+y*3)%256;d[i+1]=(x*5+y*9)%256;d[i+2]=(x*3+y*13)%256;
 d[i+3]=x>7&&x<W-8&&y>5&&y<H-6?255:0;}
 return new FakeCanvas(W,H,d);};
const run=(name,amount,parameters)=>{const source=baseline(),prior=new Uint8ClampedArray(source.pixels),effect={kind:knownKinds[name]||name,id:'test',enabled:true,amount,parameters};
 const result=effects[name](source,effect);return {result:result.pixels,source:source.pixels,prior};};
for(const name of [...colorNames,...detailNames,...styleNames,...warpNames]){
 test(`${name}: source immutability and valid alpha geometry`,()=>{
  const {result,source,prior}=run(name,name==='gamma'?120:name==='curves'||name==='levels'?100:60,{
   inputBlack:20,inputWhite:235,redRed:80,redBlue:20,redGreen:10,curvePoints:[{x:0,y:0},{x:.5,y:.7},{x:1,y:1}],
   shadowsRed:25,hueWidth:180,targetHue:0
  });
  assert.deepEqual(source,prior,'source mutated');assert.equal(result.length,prior.length);
  if(!warpNames.includes(name))for(let i=3;i<result.length;i+=4)assert.equal(result[i],prior[i],`alpha mutated at ${i>>2}`);
  for(let i=0;i<result.length;i++)assert.ok(Number.isFinite(result[i]));
 });
}
for(const [name,amount] of [['exposure',0],['highlights',0],['shadows',0],['whites',0],['blacks',0],['temperature',0],['tint',0],['vibrance',0],['gamma',100],['solarize',0],['curves',0],['levels',0],['balance',0],['selective',0],['mixer',0],['gradientmap',0],['duotone',0],...styleNames.map(n=>[n,0])]){
 test(`${name}: neutral settings preserve exact source bytes`,()=>{const {result,prior}=run(name,amount,{});assert.deepEqual(result,prior);});
}
test('Exposure differs from brightness offset and respects linear-light gamma',()=>{
 const {result,prior}=run('exposure',100,{});const dark=17*W+21,i=dark*4;
 assert.ok(result[i]>prior[i],`EV+1 should brighten ${result[i]} <= ${prior[i]}`);
 assert.ok(result[i]-prior[i]!==result[i+1]-prior[i+1]);
});
test('Levels black/white limits and tonal curve points affect tones',()=>{
 const a=run('levels',100,{inputBlack:0,inputWhite:255}).result;
 const b=run('levels',100,{inputBlack:60,inputWhite:220}).result;
 assert.notDeepEqual(a,b);
 const c=run('curves',100,{curvePoints:[{x:0,y:0},{x:.5,y:.8},{x:1,y:1}]}).result;
 const d=run('curves',100,{curvePoints:[{x:0,y:0},{x:.5,y:.2},{x:1,y:1}]}).result;
 assert.notDeepEqual(c,d);
});
test('Channel mixer channel matrix is independently editable',()=>{
 const a=run('mixer',100,{redRed:100,redGreen:0,redBlue:0}).result;
 const b=run('mixer',100,{redRed:0,redGreen:100,redBlue:0}).result;
 assert.notDeepEqual(a,b);
});
test('Transparent artwork is never painted by color, texture or style processors',()=>{
 for(const name of [...colorNames,...detailNames,...styleNames]){
 const {result,prior}=run(name,name==='gamma'?120:80,{});
 for(let i=3;i<result.length;i+=4)if(prior[i]===0)assert.equal(result[i],0,`${name} painted transparent pixel`);
 }
});
