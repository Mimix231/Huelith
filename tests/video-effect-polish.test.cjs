const test=require('node:test');
const assert=require('node:assert/strict');
const {createCanvas}=require('../scripts/video-canvas-runtime.cjs');
const {processVideoEffects}=require('../src/editor/video/process-effects.ts');
const {createLibraryVideoEffect}=require('../src/editor/video/effect-previews.ts');
const {createVideoEffect,createFilterEffect}=require('../src/editor/video/effects/catalog.ts');
const {VIDEO_FILTERS}=require('../src/editor/video/filters/index.ts');
const context={timestamp:.5,sourceTime:.5,frameIndex:15,fps:30};
const bytes=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;

test('subpixel effects still change pixels in a small video preview',async()=>{
  const c=createCanvas(240,180),ctx=c.getContext('2d');
  ctx.fillStyle='#fce9cd';ctx.fillRect(0,0,120,180);
  ctx.fillStyle='#08091c';ctx.fillRect(120,0,120,180);
  const original=bytes(c);
  for(const id of ['chromatic','unsharp','denoise','whites','atelier_0_7']){
    const rendered=await processVideoEffects(c,[createLibraryVideoEffect(id)],context);
    assert.notDeepEqual(bytes(rendered),original,id);
    assert.ok(bytes(rendered).every((value,index)=>index%4!==3||value===255),id+' preserves alpha');
  }
});

test('ghosting keeps opaque current pixels opaque and extends transparent coverage',async()=>{
  const now=createCanvas(12,12),before=createCanvas(12,12);
  const current=now.getContext('2d'),historical=before.getContext('2d');
  current.fillStyle='red';current.fillRect(0,0,6,12);
  historical.fillStyle='blue';historical.fillRect(6,0,6,12);
  for(const id of ['video-temporal-echo','video-motion-trail']){
    const rendered=await processVideoEffects(now,[createVideoEffect(id)],{...context,previousFrame:async()=>before});
    const pixels=bytes(rendered);
    assert.deepEqual([...pixels.slice(0,4)],[255,0,0,255],id);
    const ghost=6*4;
    assert.ok(pixels[ghost+2]>=245&&pixels[ghost+3]>0&&pixels[ghost+3]<255,id);
  }
});

test('every catalog filter preserves partially transparent pixels and has a live strength control',async()=>{
  const canvas=createCanvas(24,16),ctx=canvas.getContext('2d');
  const g=ctx.createLinearGradient(0,0,24,16);
  g.addColorStop(0,'rgba(20,36,110,.4)');
  g.addColorStop(.45,'rgba(110,180,72,.65)');
  g.addColorStop(1,'rgba(245,128,165,.95)');
  ctx.fillStyle=g;ctx.fillRect(0,0,24,16);
  const input=bytes(canvas);
  for(const look of VIDEO_FILTERS){
    const effect=createFilterEffect(look.id);
    const rendered=bytes(await processVideoEffects(canvas,[effect],context));
    const half=bytes(await processVideoEffects(canvas,[{...effect,amount:50}],context));
    assert.notDeepEqual(rendered,input,look.id);
    assert.notDeepEqual(half,rendered,look.id);
    assert.ok(rendered.every((value,index)=>index%4!==3||value===input[index]),look.id);
    assert.equal(await processVideoEffects(canvas,[{...effect,amount:0}],context),canvas,look.id);
  }
});
