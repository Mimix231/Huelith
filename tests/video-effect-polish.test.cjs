const test=require('node:test');
const assert=require('node:assert/strict');
const {createCanvas}=require('../scripts/video-canvas-runtime.cjs');
const {processVideoEffects}=require('../src/editor/video/process-effects.ts');
const {createLibraryVideoEffect}=require('../src/editor/video/effect-previews.ts');
const {createVideoEffect,createFilterEffect}=require('../src/editor/video/effects/catalog.ts');
const {VIDEO_FILTERS}=require('../src/editor/video/filters/index.ts');
const {markImmutableEffectSource}=require('../src/editor/immutable-effect-sources.ts');
const {hasSignatureSilhouette}=require('../src/editor/video/effects/signature-core.ts');
const context={timestamp:.5,sourceTime:.5,frameIndex:15,fps:30};
const bytes=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
const changedPixels=(input,output)=>{
  let count=0;
  for(let i=0;i<input.length;i+=4)if(input[i+3]&&
    Math.max(...[0,1,2].map(c=>Math.abs(input[i+c]-output[i+c])))>3)count++;
  return count;
};
function signatureFixture(mode='opaque'){
  const canvas=createCanvas(160,100),ctx=canvas.getContext('2d');
  if(mode==='cutout'){
    ctx.beginPath();ctx.ellipse(80,50,46,34,0,0,Math.PI*2);ctx.clip();
  }else if(mode==='padding'){
    ctx.beginPath();ctx.rect(12,16,136,68);ctx.clip();
  }
  ctx.fillStyle='#252234';ctx.fillRect(0,0,160,100);
  ctx.fillStyle='#c8b8a0';ctx.fillRect(52,26,58,50);
  ctx.fillStyle='#556382';ctx.fillRect(68,35,26,30);
  if(mode==='hole')ctx.clearRect(0,0,1,1);
  if(mode==='padding')ctx.clearRect(30,40,1,1);
  return canvas;
}
function signatureEffect(kind,parameters={}){
  const effect=createLibraryVideoEffect(kind);
  return {...effect,referenceWidth:undefined,amount:100,
    parameters:{...effect.parameters,radius:12,opacity:85,...parameters}};
}

test('signature classification ignores incidental holes and rectangular padding, not cutouts',()=>{
  for(const mode of ['opaque','hole','padding','cutout']){
    const c=signatureFixture(mode),image=c.getContext('2d').getImageData(0,0,c.width,c.height);
    assert.equal(hasSignatureSilhouette(image),mode==='cutout',mode);
  }
  const c=createCanvas(20,16),ctx=c.getContext('2d');
  ctx.fillStyle='rgba(40,80,120,.2)';ctx.fillRect(2,3,16,10);
  assert.equal(hasSignatureSilhouette(ctx.getImageData(0,0,20,16)),false,'uniform translucent footage');
});

test('signature detail treatment survives a cleared corner and transparent letterbox padding',async()=>{
  for(const kind of ['sig_11','sig_6','sig_7','sig_2']){
    const effect=signatureEffect(kind),opaque=signatureFixture();
    const base=changedPixels(bytes(opaque),bytes(await processVideoEffects(opaque,[effect],context)));
    assert.ok(base>400,kind+' has substantial scene detail treatment');
    for(const mode of ['hole','padding']){
      const source=signatureFixture(mode),input=bytes(source);
      const output=bytes(await processVideoEffects(source,[effect],context));
      assert.ok(changedPixels(input,output)>base*(mode==='hole'?.9:.4),kind+' '+mode+' retains detail');
      assert.ok(output.every((value,index)=>index%4!==3||value===input[index]),kind+' '+mode+' source alpha');
      assert.deepEqual(bytes(source),input,kind+' does not mutate source');
    }
  }
});

test('signature cutouts retain halos and respond to strength, radius, opacity and procedural controls',async()=>{
  for(const [kind,control] of [['sig_11','branching'],['sig_6','density'],['sig_7','sparks'],['sig_2','turbulence']]){
    const source=signatureFixture('cutout'),input=bytes(source),effect=signatureEffect(kind,{[control]:100});
    const output=bytes(await processVideoEffects(source,[effect],context));
    let halo=0;
    for(let i=3;i<input.length;i+=4)if(!input[i]&&output[i]>0)halo++;
    assert.ok(halo>100,kind+' keeps true silhouette halo');
    assert.equal(await processVideoEffects(source,[{...effect,amount:0}],context),source,kind+' amount zero');
    for(const modified of [{...effect,amount:25},
      {...effect,parameters:{...effect.parameters,radius:2}},
      {...effect,parameters:{...effect.parameters,opacity:25}},
      {...effect,parameters:{...effect.parameters,[control]:0}}]){
      const result=bytes(await processVideoEffects(source,[modified],context));
      assert.ok([...result].reduce((sum,value,index)=>sum+Math.abs(value-output[index]),0)>100,kind+' meaningful parameter response');
    }
  }
});

test('Electric Edge is a continuous luminous contour even without branches, and opacity gates its core',async()=>{
  const source=signatureFixture(),effect=signatureEffect('sig_11',{branching:0}),input=bytes(source);
  const output=bytes(await processVideoEffects(source,[effect],context));
  let luminous=0;
  for(let y=28;y<74;y++){
    const i=(y*source.width+51)*4;
    if(output[i+2]>input[i+2]+20)luminous++;
  }
  assert.ok(luminous>35,'cohesive blue-violet perimeter instead of isolated sparks');
  const branched=bytes(await processVideoEffects(source,[{...effect,parameters:{...effect.parameters,branching:100}}],context));
  assert.ok(changedPixels(output,branched)>30,'forked arcs add visible contour detail');
  assert.deepEqual(bytes(await processVideoEffects(source,[{...effect,parameters:{...effect.parameters,opacity:0}}],context)),input);
});

test('Comic Pop amount-dependent quantization is not reused from an immutable lower-strength target',async()=>{
  const source=signatureFixture(),fresh=signatureFixture(),effect=signatureEffect('sig_5');
  markImmutableEffectSource(source);markImmutableEffectSource(fresh);
  const low=bytes(await processVideoEffects(source,[{...effect,amount:25}],context));
  const high=bytes(await processVideoEffects(source,[effect],context));
  const freshHigh=bytes(await processVideoEffects(fresh,[effect],context));
  assert.notDeepEqual(low,high);
  assert.deepEqual(high,freshHigh,'immutable 25 -> 100 equals fresh 100');
});

function prismFixture(){
  const c=createCanvas(16,12),ctx=c.getContext('2d'),image=ctx.createImageData(16,12);
  for(let y=0;y<12;y++)for(let x=0;x<16;x++){
    const i=(y*16+x)*4;
    image.data.set([20+x*12+y*2,70,230-x*7-y*5,255],i);
  }
  ctx.putImageData(image,0,0);return c;
}

test('Prism Split refracts fractional channels in tiny reference-scaled previews',async()=>{
  const source=prismFixture(),input=bytes(source),effect=signatureEffect('sig_8',{radius:12,colorMix:100,angle:0,opacity:100});
  const preview={...context,referenceWidth:960},i=(5*16+8)*4;
  const output=bytes(await processVideoEffects(source,[effect],preview));
  assert.equal(output[i],input[i]+2,'0.2 pixel red shift is bilinear, not rounded to zero');
  assert.equal(output[i+2],input[i+2]+1,'the blue tap moves in the opposite direction');
  assert.equal(output[2],input[2],'outside blue tap falls back to the current channel');
  assert.ok(output.every((value,index)=>index%4!==3||value===input[index]));
  for(const parameters of [{colorMix:0},{colorMix:25},{radius:24},{angle:90}]){
    const result=bytes(await processVideoEffects(source,[{...effect,parameters:{...effect.parameters,...parameters}}],preview));
    assert.notDeepEqual(result,output,JSON.stringify(parameters));
  }
  assert.equal(await processVideoEffects(source,[{...effect,amount:0}],preview),source);
});

test('Prism Split weights alpha and falls back for transparent taps without changing source coverage',async()=>{
  const source=prismFixture(),ctx=source.getContext('2d'),image=ctx.getImageData(0,0,16,12),i=(5*16+8)*4;
  image.data[(5*16+9)*4+3]=128;
  image.data.set([255,0,255,0],(6*16+9)*4);
  image.data.set([255,0,255,0],(6*16+7)*4);
  image.data[(7*16+8)*4+3]=92;
  ctx.putImageData(image,0,0);
  const input=bytes(source),effect=signatureEffect('sig_8',{radius:12,colorMix:100,angle:0,opacity:100});
  const output=bytes(await processVideoEffects(source,[effect],{...context,referenceWidth:960}));
  assert.equal(output[i],input[i]+1,'partially transparent neighbor contributes by alpha coverage');
  const hole=(6*16+8)*4;
  assert.equal(output[hole],input[hole],'hidden red is ignored');
  assert.equal(output[hole+2],input[hole+2],'hidden blue is ignored');
  assert.ok(output.every((value,index)=>index%4!==3||value===input[index]));
  assert.deepEqual(bytes(source),input);
});

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
