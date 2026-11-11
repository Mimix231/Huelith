const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
class PixelCanvas{
  constructor(w=1,h=1){this._w=w;this._h=h;this.bytes=new Uint8ClampedArray(w*h*4);}
  get width(){return this._w;}set width(v){this._w=v;this.bytes=new Uint8ClampedArray(this._w*this._h*4);}
  get height(){return this._h;}set height(v){this._h=v;this.bytes=new Uint8ClampedArray(this._w*this._h*4);}
  getContext(){return {getImageData:()=>({width:this.width,height:this.height,data:new Uint8ClampedArray(this.bytes)}),putImageData:im=>this.bytes.set(im.data)};}
}
const previous=global.OffscreenCanvas;global.OffscreenCanvas=PixelCanvas;
const root=path.resolve(__dirname,'../src/editor');
const {renderEmboss}=loadTypeScript(path.join(root,'effects/emboss.ts')),{renderEdgeDetection}=loadTypeScript(path.join(root,'effects/edge-detection.ts'));
const {renderSigRetroVision}=loadTypeScript(path.join(root,'effects/sig-retro-vision.ts'));
for(const [name,render] of [['Emboss',renderEmboss],['Edge Detection',renderEdgeDetection],['Retro Vision',renderSigRetroVision]])test(`${name}: 1% stays near the source; zero is identity and alpha is preserved`,()=>{
  global.OffscreenCanvas=PixelCanvas;const canvas=new PixelCanvas(20,16);
  for(let i=0;i<canvas.bytes.length;i+=4){canvas.bytes[i]=(i*3)%256;canvas.bytes[i+1]=(i*11)%256;canvas.bytes[i+2]=(i*17)%256;canvas.bytes[i+3]=i%24===0?100:255;}
  const before=new Uint8ClampedArray(canvas.bytes),effect={id:'test',kind:name==='Emboss'?'emboss':name==='Edge Detection'?'edges':'sig_13',enabled:true,parameters:{}};
  const zero=render(canvas,{...effect,amount:0}),one=render(canvas,{...effect,amount:1}),full=render(canvas,{...effect,amount:100});
  const delta=b=>b.reduce((sum,n,i)=>sum+(i%4===3?0:Math.abs(n-before[i])),0);
  assert.deepEqual(zero.bytes,before);assert.ok(delta(one.bytes)<delta(full.bytes)*.05,`${name} jumps at 1%`);
  assert.deepEqual(canvas.bytes,before);for(let i=3;i<before.length;i+=4)assert.equal(full.bytes[i],before[i]);
  global.OffscreenCanvas=previous;
});
test('palette size is a discrete count and spatial/tolerance controls have explicit labels',()=>{
  const {EFFECT_PARAMETER_SCHEMA}=loadTypeScript(path.join(root,'effect-schema.ts'));
  const {FILTER_CONTROL_MAP}=loadTypeScript(path.join(root,'effect-catalog.ts'));
  const palette=EFFECT_PARAMETER_SCHEMA.atelier_0_14[0];assert.equal(palette.key,'paletteSize');assert.equal(palette.step,1);assert.equal(palette.unit,'colors');
  assert.equal(FILTER_CONTROL_MAP.boxblur.label,'Horizontal radius');assert.equal(FILTER_CONTROL_MAP.cutout.unit,'RGB distance');
});
