const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {createCanvas}=require('../scripts/video-canvas-runtime.cjs');
const {VIDEO_FILTERS}=require('../src/editor/video/filters/index.ts');
const {filterLut,renderVideoFilter,sampleFilter}=require('../src/editor/video/filters/render.ts');
const {markImmutableEffectSource}=require('../src/editor/immutable-effect-sources.ts');
const {VIDEO_EFFECT_CATALOG,createVideoEffect,createFilterEffect}=require('../src/editor/video/effects/catalog.ts');
const {processVideoEffects}=require('../src/editor/video/process-effects.ts');
const {decodeTga,GifSource}=require('../src/editor/video/raster-media.ts');
const {TEXT_TEMPLATES}=require('../src/editor/video/text-templates.ts');
const {drawVideoText}=require('../src/editor/video/text-renderer.ts');
const {TRANSITION_PRESETS,transitionStack}=require('../src/editor/video/transitions.ts');
const {AUTHORED_TRANSITIONS,TRANSITION_GROUPS}=require('../src/editor/video/transition-recipes.ts');
const {CLIP_ANIMATIONS}=require('../src/editor/video/clip-animation.ts');
const {defaultTimeline,addTitle,makeAsset,addMediaClip,isVideoTimeline,splitClip,trimClip}=require('../src/editor/video/timeline.ts');
const {MOTION_PRESETS,transformAt,motionKeys}=require('../src/editor/video/motion.ts');
const {parseCaptions,serializeCaptions,addCaptions,captionCues}=require('../src/editor/video/captions.ts');
const {VIDEO_COMPOSITIONS,applyVideoComposition}=require('../src/editor/video/compositions.ts');
const {AUDIO_LIBRARY}=require('../src/editor/video/audio-library.ts');
const {STICKERS}=require('../src/editor/video/library.ts');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const pixels=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
function spectrum(){const c=createCanvas(48,24),ctx=c.getContext('2d'),image=ctx.createImageData(48,24);for(let i=0;i<image.data.length;i+=4){image.data.set([(i*17)%256,(i*31+35)%256,(i*7+82)%256,(i/4)%256],i);}ctx.putImageData(image,0,0);return c;}
test('270 individual LUT recipes have unique sampled transforms and real alpha-preserving output',()=>{
 assert.equal(VIDEO_FILTERS.length,270);assert.equal(new Set(VIDEO_FILTERS.map(f=>f.id)).size,270);const transforms=new Set(),outputs=new Set(),source=spectrum(),raw=pixels(source);
 for(const look of VIDEO_FILTERS){assert.ok(fs.existsSync(path.join(__dirname,'../src/editor/video/filters',look.id+'.ts')));transforms.add(digest(Buffer.from(filterLut(look.id).buffer)));
  assert.equal(renderVideoFilter(source,look.id,0),source);const out=pixels(renderVideoFilter(source,look.id,100));outputs.add(digest(out));for(let i=3;i<out.length;i+=4)assert.equal(out[i],raw[i]);
 }assert.equal(transforms.size,270);assert.equal(outputs.size,270);
});
test('new filters participate in mixed production effect stacks without mutating source pixels',async()=>{
 const source=spectrum(),before=Buffer.from(pixels(source)),stack=[createVideoEffect('exposure'),createFilterEffect(VIDEO_FILTERS[40].id),createVideoEffect('contrast')];
 const context={timestamp:0,sourceTime:0,frameIndex:0,fps:30},first=await processVideoEffects(source,stack,context),second=await processVideoEffects(source,stack,context);
 assert.notEqual(digest(pixels(first)),digest(before));assert.equal(digest(pixels(first)),digest(pixels(second)));assert.deepEqual(Buffer.from(pixels(source)),before);
});
test('every filter continuous-strength canvas path matches the pixel reference on opaque and masked pixels',()=>{
 const source=spectrum(),ctx=source.getContext('2d'),image=ctx.getImageData(0,0,source.width,source.height);
 for(let i=3;i<image.data.length;i+=4)image.data[i]=image.data[i]<128?0:255;ctx.putImageData(image,0,0);markImmutableEffectSource(source);
 const raw=pixels(source),sample=[0,0,0],graded=new Uint8ClampedArray(3);let max=0;
 for(const look of VIDEO_FILTERS){const lut=filterLut(look.id);for(const amount of [1,25,55.5,100]){
  const out=pixels(renderVideoFilter(source,look.id,amount));for(let i=0;i<out.length;i+=4){assert.equal(out[i+3],raw[i+3]);if(!raw[i+3])continue;
   sampleFilter(lut,raw[i],raw[i+1],raw[i+2],sample);graded.set(sample);for(let ch=0;ch<3;ch++)max=Math.max(max,Math.abs(out[i+ch]-Math.round(raw[i+ch]+(graded[ch]-raw[i+ch])*amount/100)));
  }
 }}assert.ok(max<=2,`Canvas strength blend differs by ${max}`);
});
function tga({type=2,depth=24,flags=32,width=2,height=2,payload,palette}={}){
 const header=Buffer.alloc(18);header[1]=palette?1:0;header[2]=type;header.writeUInt16LE(width,12);header.writeUInt16LE(height,14);header[16]=depth;header[17]=flags;
 if(palette){header.writeUInt16LE(palette.length/3,5);header[7]=24;}return Buffer.concat([header,palette??Buffer.alloc(0),Buffer.from(payload??[0,0,255,0,255,0,255,0,0,255,255,255])]);
}
const arrayBuffer=buffer=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.length);
test('TGA raw/RLE/gray/palette decode and all four origins preserve exact pixels',()=>{
 for(const flags of [0,16,32,48]){const decoded=decodeTga(arrayBuffer(tga({flags})));assert.equal(decoded.rgba.length,16);
  const firstIndex=((flags&32?0:1)*2+(flags&16?1:0))*4;assert.deepEqual([...decoded.rgba.slice(firstIndex,firstIndex+4)],[255,0,0,255]);}
 const rle=decodeTga(arrayBuffer(tga({type:10,payload:[0x83,9,18,27]})));assert.deepEqual([...rle.rgba.slice(0,4)],[27,18,9,255]);
 const gray=decodeTga(arrayBuffer(tga({type:3,depth:16,flags:40,payload:[33,90,44,100,55,110,66,120]})));assert.deepEqual([...gray.rgba.slice(0,4)],[33,33,33,90]);
 const indexed=decodeTga(arrayBuffer(tga({type:1,depth:8,palette:Buffer.from([0,0,255,255,0,0]),payload:[0,1,1,0]})));assert.deepEqual([...indexed.rgba.slice(4,8)],[0,0,255,255]);
 assert.throws(()=>decodeTga(arrayBuffer(tga({type:10,payload:[0xff,0,0,0]}))),/exceeds/);assert.throws(()=>decodeTga(new ArrayBuffer(6)),/incomplete/);
});
function gifFixture(transparent=false){
 const head=Buffer.from([71,73,70,56,57,97,3,0,2,0,0x81,transparent?3:0,0,255,0,0,0,0,255,0,255,0,0,0,0]);
 const frame=(left,top,width,height,color,delay,disposal)=>{
  const gce=Buffer.from([0x21,0xf9,4,disposal<<2|(transparent?1:0),delay,0,transparent?3:0,0]);const image=Buffer.from([0x2c,left,0,top,0,width,0,height,0,0]);
  const codes=[];for(let i=0;i<width*height;i++)codes.push(4,color);codes.push(5);const data=Buffer.alloc(Math.ceil(codes.length*3/8));codes.forEach((n,i)=>{const bit=i*3;data[bit>>3]|=n<<(bit%8);if(bit%8>5)data[(bit>>3)+1]|=n>>(8-bit%8);});
  return Buffer.concat([gce,image,Buffer.from([2,data.length]),data,Buffer.from([0])]);
 };return Buffer.concat([head,frame(0,0,3,2,0,10,1),frame(1,0,1,1,1,20,2),frame(0,1,1,1,2,10,3),frame(2,1,1,1,1,10,1),Buffer.from([0x3b])]);
}
test('GIF source clock handles variable holds, disposal clear/restore, rewind and looping',()=>{
 const gif=new GifSource(arrayBuffer(gifFixture()));assert.ok(Math.abs(gif.duration-.5)<1e-8);const at=(time,x,y)=>[...pixels(gif.frame(time)).slice((y*3+x)*4,(y*3+x)*4+4)];
 assert.deepEqual(at(.05,1,0),[255,0,0,255]);assert.deepEqual(at(.15,1,0),[0,0,255,255]);assert.deepEqual(at(.29,1,0),[0,0,255,255]);
 assert.deepEqual(at(.35,1,0),[255,0,0,255]);assert.deepEqual(at(.35,0,1),[0,255,0,255]);assert.deepEqual(at(.45,0,1),[255,0,0,255]);
 assert.deepEqual(at(.45,2,1),[0,0,255,255]);assert.deepEqual(at(.05,0,1),[255,0,0,255]);assert.deepEqual(at(.55,1,0),[255,0,0,255]);
 const sticker=new GifSource(arrayBuffer(gifFixture(true)));assert.deepEqual([...pixels(sticker.frame(.35)).slice(4,8)],[0,0,0,0]);
});
test('all 96 text templates produce distinct editable Canvas frames',()=>{
 const hashes=new Set();for(const template of TEXT_TEMPLATES){const canvas=createCanvas(640,360),ctx=canvas.getContext('2d');ctx.translate(640*(.5+template.x),360*(.5+template.y));drawVideoText(ctx,{title:template.text,scale:1,textStyle:template.style},640,360,1280);const data=pixels(canvas);assert.ok(data.some((n,i)=>i%4===3&&n));hashes.add(digest(data));}
 assert.equal(TEXT_TEMPLATES.length,96);assert.equal(hashes.size,96);
});
test('word highlighting follows the active repeated word instead of the first matching substring',()=>{
 const c=createCanvas(640,150),ctx=c.getContext('2d');ctx.translate(320,75);
 drawVideoText(ctx,{title:'one one',scale:1,textStyle:{fontSize:50,color:'#ffffff'},caption:{source:'speech',highlight:'#ff0000',words:[{text:'one',start:0,end:.5},{text:'one',start:.5,end:1}]}},640,150,640,.75);
 const data=pixels(c);let left=0,right=0;for(let i=0;i<data.length;i+=4)if(data[i]>200&&data[i+1]<50&&data[i+2]<50&&data[i+3]>150){if(i/4%640<320)left++;else right++;}
 assert.equal(left,0);assert.ok(right>50);
});
test('motion interpolation remains continuous through split and left trim',()=>{
 const added=addMediaClip(defaultTimeline(),makeAsset('Still','test.png','image',5));let clip={...added.clip,duration:5,keyframes:motionKeys({...added.clip,duration:5},'slow-zoom')};
 const timeline={...added.timeline,clips:[clip]},at=transformAt(clip,2);const split=splitClip(timeline,clip.id,clip.start+2);const right=split.timeline.clips.find(c=>c.id===split.rightId);
 assert.ok(Math.abs(transformAt(right,0).scale-at.scale)<1e-10);const trimmed=trimClip(timeline,clip.id,'left',2).clips[0];assert.ok(Math.abs(transformAt(trimmed,0).scale-at.scale)<1e-10);assert.ok(isVideoTimeline(split.timeline));
});
test('text insertions stay separate from captions and overlapping titles get editable tracks',()=>{
 let timeline=addCaptions(defaultTimeline(),[{id:'cue',start:0,end:2,text:'Caption'}],'manual');
 const a=addTitle(timeline,0,'First title');timeline=a.timeline;const b=addTitle(timeline,0,'Second title');
 assert.notEqual(a.clip.trackId,b.clip.trackId);assert.notEqual(timeline.tracks.find(t=>t.purpose==='captions').id,a.clip.trackId);assert.ok(isVideoTimeline(b.timeline));
});
test('SRT/VTT round trips, fractional timing, styling and caption project serialization',()=>{
 const parsed=parseCaptions('1\n00:00:00,100 --> 00:00:01,400\nHello <b>world</b>\n\n2\n00:00:02,000 --> 00:00:02,050\nQuick cue\n');assert.equal(parsed.cues[0].text,'Hello world');
 const vtt=serializeCaptions(parsed.cues,'vtt');assert.equal(parseCaptions(vtt).cues[1].end,2.05);const timeline=addCaptions(defaultTimeline(),parsed.cues,'srt');assert.ok(isVideoTimeline(timeline));assert.equal(captionCues(JSON.parse(JSON.stringify(timeline))).length,2);
 assert.throws(()=>parseCaptions('1\n00:00:02,000 --> 00:00:01,000\nNo\n'),/invalid/);
});
test('all effect transitions use valid real processors and a zero envelope at either end',async()=>{
 const source=spectrum();for(const preset of TRANSITION_PRESETS){const stack=transitionStack(preset.id,.5);for(const effect of stack)assert.ok(VIDEO_EFFECT_CATALOG.some(d=>d.kind===effect.kind));
  const out=await processVideoEffects(source,stack,{timestamp:.5,sourceTime:.5,frameIndex:15,fps:30});assert.equal(out.width,source.width);assert.equal(out.height,source.height);
 }assert.equal(TRANSITION_PRESETS.length,24);
});
test('eight compositions expand into valid editable clips and retain user assets',()=>{
 const base=addMediaClip(defaultTimeline(),makeAsset('My image','my.png','image',5)).timeline;for(const composition of VIDEO_COMPOSITIONS){const next=applyVideoComposition(base,composition.id,7);assert.ok(isVideoTimeline(next),composition.id);assert.equal(next.assets[0],base.assets[0]);assert.equal(next.clips.length,3);assert.ok(next.clips.some(c=>c.textStyle&&c.keyframes?.length));}
});
test('production compositor honors crop, GIF source timing, title motion and project background',async()=>{
 const {TimelineCompositor}=require('../src/editor/video/compositor.ts'),fetchBefore=global.fetch;
 global.fetch=async url=>new Response(String(url).endsWith('.gif')?gifFixture(true):tga(),{status:200});
 let renderer;
 try{
  const base=defaultTimeline();base.background='#102030';
  const asset={...makeAsset('crop.tga','virtual.tga','image',5),libraryId:'testing/crop.tga',crop:{x:0,y:0,width:.5,height:.5}};
  const added=addMediaClip(base,asset),timeline=added.timeline;renderer=new TimelineCompositor(192,108,30,192);
  const first=await renderer.render(timeline,0),sample=(c,x,y)=>[...pixels(c).slice((y*c.width+x)*4,(y*c.width+x)*4+4)];
  assert.deepEqual(sample(first,96,54),[255,0,0,255]);assert.deepEqual(sample(first,0,0),[16,32,48,255]);
  const changed={...timeline,assets:[{...asset,crop:{x:0,y:.5,width:.5,height:.5}}]};assert.deepEqual(sample(await renderer.render(changed,0),96,54),[0,0,255,255]);
  const animated={...asset,id:'gif',name:'clock.gif',libraryId:'testing/clock.gif',crop:undefined,animated:true};
  const gifTimeline={...timeline,assets:[animated],clips:[{...added.clip,id:'gif-clip',assetId:'gif'}]};
  assert.notEqual(digest(pixels(await renderer.render(gifTimeline,.05))),digest(pixels(await renderer.render(gifTimeline,.15))));
  assert.equal(digest(pixels(await renderer.render(gifTimeline,.05))),digest(pixels(await renderer.render(gifTimeline,.55))));
  const title=addTitle(timeline,0,'Motion').clip;title.textStyle={fontSize:20,color:'#ffffff'};title.keyframes=motionKeys(title,'slide-left');
  const withText={...timeline,clips:[...timeline.clips,title]};assert.notEqual(digest(pixels(await renderer.render(withText,0))),digest(pixels(await renderer.render(withText,1))));
 }finally{renderer?.dispose();global.fetch=fetchBefore;}
});
test('bundled catalogs contain real assets and complete one-image card coverage',()=>{
 const root=path.resolve(__dirname,'../public/video-library'),manifest=JSON.parse(fs.readFileSync(path.join(root,'thumbnails/manifest.json'),'utf8'));
 assert.equal(manifest.artwork,'Night Run');
 assert.equal(manifest.entries.length,VIDEO_EFFECT_CATALOG.length+VIDEO_FILTERS.length+TEXT_TEMPLATES.length
  +MOTION_PRESETS.length+CLIP_ANIMATIONS.length+TRANSITION_PRESETS.length+AUTHORED_TRANSITIONS.length+3);
 for(const entry of manifest.entries){
  const bytes=fs.readFileSync(path.join(root,entry.file));assert.equal(digest(bytes),entry.sha256);assert.ok(bytes.length>200);
  if(entry.motionFile){
   const motion=fs.readFileSync(path.join(root,entry.motionFile));
   assert.equal(digest(motion),entry.motionSha256);
   assert.ok(motion.includes(Buffer.from('ANIM'))&&motion.indexOf('ANMF')<motion.lastIndexOf('ANMF'),entry.id);
  }
  if(entry.kind==='effects'||entry.kind==='filters'){
   assert.deepEqual(Object.keys(entry.audit),manifest.auditFixtures);
   assert.ok(Object.values(entry.audit).some(fixture=>fixture.rgb+fixture.alpha>=.5),entry.id);
  }
 }
 for(const group of TRANSITION_GROUPS){
  const authored=manifest.entries.filter(entry=>entry.kind==='transitions'&&entry.group===group);
  assert.equal(authored.length,54);
  assert.equal(new Set(authored.map(entry=>entry.motionSha256)).size,54);
 }
 assert.equal(new Set(manifest.entries.filter(e=>e.kind==='filters').map(e=>e.sha256)).size,270);assert.equal(AUDIO_LIBRARY.length,40);for(const item of AUDIO_LIBRARY){assert.ok(fs.statSync(path.join(root,item.file)).size>1000);assert.equal(item.waveform.length,96);assert.ok(item.waveform.some(n=>n>.1));}
 assert.equal(STICKERS.length,16);for(const s of STICKERS){assert.ok(s.crop.x+s.crop.width<=1);assert.ok(s.crop.y+s.crop.height<=1);}
});
