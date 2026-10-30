'use strict';
/** Regression for user-reported effects invisible on dark artwork and for the
 * new individually authored Color Science processors. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const original=Module._extensions['.ts'];
Module._extensions['.ts']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {DEDICATED_EFFECTS}=require('../src/editor/effects/index.ts');
const {defaultParameters,EFFECT_PARAMETER_SCHEMA}=require('../src/editor/effect-schema.ts');
if(original)Module._extensions['.ts']=original;
const w=160,h=110;
const source=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  // Dark, largely monochromatic artwork with an isolated 110-level reflection.
  // Earlier absolute >172 thresholds resulted in an identity transform.
  if(x<13||x>=w-13||y<10||y>=h-10)continue;
  const r=12+((x*3+y*7)%47),g=15+((x*5+y*11)%37),b=19+((x*7+y*3)%48);
  source[i]=r;source[i+1]=g;source[i+2]=b;source[i+3]=255;
  if((x>42&&x<47&&y>45&&y<50)||(x>113&&x<117&&y>25&&y<30)){
    source[i]=source[i+1]=source[i+2]=112;
  }
}
const brightScene=new Uint8ClampedArray(source);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if(!source[i+3])continue;
  brightScene[i]=Math.min(255,source[i]*2+(x/w)*100);
  brightScene[i+1]=Math.min(255,source[i+1]*2+(y/h)*100);
  brightScene[i+2]=Math.min(255,source[i+2]*2+((x+y)/(w+h))*120);
}
function run(id,settings={},amount=1,frame=source){
  const out=new Uint8ClampedArray(frame.length),fn=DEDICATED_EFFECTS.get(id);
  assert.ok(fn,`missing dedicated ${id}`);
  fn({source:frame,width:w,height:h,amount,parameters:{...defaultParameters(id),...settings}}).renderRows(0,h,out);
  return out;
}
function changed(a,b){let px=0,distance=0;for(let i=0;i<a.length;i+=4){
  const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])+Math.abs(a[i+3]-b[i+3]);
  if(d>3)px++;distance+=d;
}return {px,distance};}
for(const [id,label] of [
  ['atelier_3_12','Pixel Sorting'],['atelier_7_0','Film Halation'],
  ['atelier_7_1','Anamorphic Streak'],['atelier_7_2','Lens Ghost'],
  ['atelier_7_11','Split Diopter'],
]){
  test(`${label} visibly changes DARK source with no white pixels`,()=>{
    const result=run(id);const d=changed(source,result);
    assert.ok(d.px>25,`visible changed pixels ${d.px}, total distance ${d.distance}`);
    assert.ok(d.distance>250,`too faint: ${d.distance}`);
  });
}
for(let idx=0;idx<16;idx++){
  const id=`atelier_0_${idx}`;
  test(`Color Science ${idx}: registered, visible and zero-strength identity`,()=>{
    const frame=brightScene;const full=run(id,{},1,frame),d=changed(frame,full);
    assert.ok(d.px>20,`not visible: ${JSON.stringify(d)}`);
    assert.deepEqual(run(id,{},0,frame),frame,'zero strength identity');
    for(let i=0;i<frame.length;i+=4){
      assert.equal(full[i+3],frame[i+3],`alpha not preserved at ${i}`);
      if(!frame[i+3])assert.deepEqual(full.subarray(i,i+3),frame.subarray(i,i+3));
    }
  });
  test(`Color Science ${idx}: actual exposed controls affect pixels`,()=>{
    for(const control of EFFECT_PARAMETER_SCHEMA[id]){
      const base=run(id,{},1,brightScene),changedResult=run(id,{[control.key]:control.min},1,brightScene);
      const d=changed(base,changedResult);
      assert.ok(d.distance>3,`${control.key} ineffective ${JSON.stringify(d)}`);
    }
  });
}
for(const [id,label] of [
  ['atelier_1_0','Directional Light Shafts'],['atelier_1_1','Specular Glints'],
  ['atelier_1_2','Light Scattering'],['atelier_1_3','Silhouette Rimlight'],
  ['atelier_1_7','Underwater Caustics'],['atelier_1_10','Sparkling Highlights'],
  ['atelier_1_4','Sunburst Rays'],['atelier_1_5','Atmospheric Fog'],
  ['atelier_1_6','Cinematic Haze'],['atelier_1_8','Lightning Flash'],
  ['atelier_1_9','Ambient Wrap Lighting'],['atelier_1_11','Sunrise Illumination'],
  ['atelier_1_12','Moonlight Casting'],['atelier_1_13','Shadowed Mist'],
]){
  test(`${label}: changes pixels under its intended scene conditions`,()=>{
    const d=changed(brightScene,run(id,{},1,brightScene));
    assert.ok(d.distance>100,`${label} invisible: ${JSON.stringify(d)}`);
  });
  test(`${label}: every visible control changes the result`,()=>{
    for(const control of EFFECT_PARAMETER_SCHEMA[id]){
      const base=run(id,{},1,brightScene);
      const target=control.min===control.initial?control.max:control.min;
      const changedScene=run(id,{[control.key]:target},1,brightScene);
      assert.ok(changed(base,changedScene).distance>2,`${label}: ${control.key} does nothing`);
    }
  });
}
for(const [id,label] of [
  ['atelier_3_0','Polar Warp'],['atelier_3_1','Pinch Lens'],
  ['atelier_3_2','Barrel Distortion'],['atelier_3_3','Pincushion Distortion'],
  ['atelier_3_4','Oblique Shear'],['atelier_3_5','Noise Displacement'],
  ['atelier_3_6','Sine Fold'],['atelier_3_7','Quadrant Kaleidoscope'],
  ['atelier_3_8','Warped Waves'],['atelier_3_9','Spiral Vortex'],
  ['atelier_3_10','Crystal Shatter'],['atelier_3_11','Mirror Slices'],
  ['atelier_3_13','Curved Glass'],
]){
  test(`${label}: moves visible image pixels`,()=>{
    const d=changed(brightScene,run(id,{},1,brightScene));
    assert.ok(d.distance>80,`${label} is an identity: ${JSON.stringify(d)}`);
  });
  test(`${label}: every exposed spatial setting changes the sample map`,()=>{
    for(const control of EFFECT_PARAMETER_SCHEMA[id]){
      const base=run(id,{},1,brightScene);
      const target=control.min===control.initial?control.max:control.min;
      const changedScene=run(id,{[control.key]:target},1,brightScene);
      assert.ok(changed(base,changedScene).distance>2,`${label}: ${control.key} is ineffective`);
    }
  });
}
test('All dedicated expansion IDs are independent, no accidental identical outputs',()=>{
  const seen=new Set();
  for(const id of DEDICATED_EFFECTS.keys()){
    const result=run(id,{},1,brightScene);const key=Buffer.from(result).toString('base64');
    assert.ok(!seen.has(key),`${id} is identical to another registered processor`);
    seen.add(key);
  }
});

// The worker's exact job and Apply/export must consume the same dedicated
// processor. Merely importing a new file into the catalog is not sufficient.
class IntegrationCanvas {
  constructor(pixels=source){this.width=w;this.height=h;this.pixels=new Uint8ClampedArray(pixels);}
  getContext(){return {
    getImageData:()=>({data:new Uint8ClampedArray(this.pixels)}),
    createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),
    putImageData:(image)=>{this.pixels=new Uint8ClampedArray(image.data);},
  };}
}
global.document={createElement:()=>new IntegrationCanvas(new Uint8ClampedArray(w*h*4))};
const {createExpansion120Job,renderExpansion120}=require('../src/editor/expansion-120.ts');
test('All registered dedicated effects share the exact same cooperative and export path',()=>{
  for(const id of DEDICATED_EFFECTS.keys()){
    const input=new IntegrationCanvas(brightScene);
    const effect={kind:id,id:'authoritative',enabled:true,amount:79,parameters:defaultParameters(id)};
    const complete=renderExpansion120(input,effect).pixels;
    const job=createExpansion120Job(input,effect);
    let loops=0;while(!job.runRows(7))if(++loops>h)assert.fail(`${id} never finished`);
    assert.deepEqual(job.output().pixels,complete,`${id} preview/export divergence`);
  }
});

test('Spatial effects sample premultiplied alpha: hidden magenta never bleeds into white edges',()=>{
  const s=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<s.length;i+=4){s[i]=255;s[i+1]=0;s[i+2]=255;}
  for(let y=28;y<84;y++)for(let x=35;x<132;x++){
    const i=(y*w+x)*4;s[i]=s[i+1]=s[i+2]=255;s[i+3]=255;
  }
  for(const id of ['atelier_3_1','atelier_3_2','atelier_3_9','atelier_3_13']){
    const out=new Uint8ClampedArray(s.length);
    DEDICATED_EFFECTS.get(id)({source:s,width:w,height:h,amount:1,parameters:defaultParameters(id)}).renderRows(0,h,out);
    for(let i=0;i<s.length;i+=4){
      if(out[i+3]<5)continue;
      assert.ok(out[i+1]>=out[i]-2 && out[i+1]>=out[i+2]-2,`${id}: hidden magenta RGB leaked at pixel ${i/4}`);
    }
  }
});

test('Optimized premultiplied RGBA blur matches four-channel reference box convolution',()=>{
  const {blurRgba,blurScalar}=require('../src/editor/effects/common.ts');
  const image=new Uint8ClampedArray(brightScene);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if((x*y)%7===0)image[(y*w+x)*4+3]=Math.round(((x+y)%31)/30*255);
  }
  const channels=Array.from({length:4},()=>new Float32Array(w*h));
  for(let k=0;k<w*h;k++){
    const i=k*4,a=image[i+3]/255;
    channels[0][k]=image[i]*a;channels[1][k]=image[i+1]*a;
    channels[2][k]=image[i+2]*a;channels[3][k]=a;
  }
  for(const radius of [1,3,7]){
    const [r,g,b,a]=channels.map(c=>blurScalar(c,w,h,radius));
    const optimized=blurRgba(image,w,h,radius);
    for(let k=0;k<w*h;k++){
      const i=k*4,alpha=a[k];if(alpha<1e-5)continue;
      assert.ok(Math.abs(optimized[i]-Math.round(r[k]/alpha))<=1,'red channel');
      assert.ok(Math.abs(optimized[i+1]-Math.round(g[k]/alpha))<=1,'green channel');
      assert.ok(Math.abs(optimized[i+2]-Math.round(b[k]/alpha))<=1,'blue channel');
      assert.ok(Math.abs(optimized[i+3]-Math.round(alpha*255))<=1,'alpha channel');
    }
  }
});
