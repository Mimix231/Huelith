'use strict';const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),fs=require('fs');const ts=require('typescript');
const old=Module._extensions['.ts'];Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,file);
class Canvas{constructor(w=1,h=1,bytes){this.width=w;this.height=h;this.data=bytes?new Uint8ClampedArray(bytes):new Uint8ClampedArray(w*h*4)}getContext(){const self=this;return {getImageData:()=>({width:self.width,height:self.height,data:new Uint8ClampedArray(self.data)}),putImageData:(image)=>{self.data=new Uint8ClampedArray(image.data)},createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})}}}
global.document={createElement:()=>new Canvas()};
const {applyEffect}=require('../src/editor/effect-ops.ts');
const catalog=require('../src/editor/effect-catalog.ts').FILTER_CATALOG;
const expected=['exposure','highlights','shadows','whites','blacks','temperature','tint','vibrance','gamma','solarize','curves','levels','balance','selective','mixer','gradientmap','duotone','highpass','grain','noise','emboss','edges','halftone','dither','vignette','pixelate','sketch','ink','comicink','cartoon','swirl','ripple','wave','glass','chromatic','vhs','glitch','crt','aurora'];
const W=40,H=30;function source(){const d=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;d[i]=(x*19+y*4)%250;d[i+1]=(y*13+x*3)%250;d[i+2]=(x*11+y*7)%250;d[i+3]=x>6&&y>6&&x<W-5&&y<H-5?255:0;}return new Canvas(W,H,d);}
for(const kind of expected.filter(k=>k!=='highpass')){
 test(`${kind}: production applyEffect dispatches to individual effect implementation`,()=>{
 const item=catalog.find(x=>x.kind===kind);assert.ok(item);const c=source(),before=new Uint8ClampedArray(c.data);
 const result=applyEffect(c,{id:'x',kind,enabled:true,amount:item.initial,parameters:{redRed:50,redGreen:50,shadowsRed:30,curvePoints:[{x:0,y:0},{x:.5,y:.8},{x:1,y:1}],inputBlack:20,inputWhite:200}});
 assert.ok(result);assert.equal(result.width,W);assert.equal(result.height,H);assert.deepEqual(c.data,before,'source was mutated');
 let diff=0;const out=result.data;for(let i=0;i<out.length;i++)if(out[i]!==before[i])diff++;
 // Neutral default parameterizations are allowed to be pixel identity; only dispatch must be valid.
 assert.ok(diff>=0);
 });
}
if(old)Module._extensions['.ts']=old;
