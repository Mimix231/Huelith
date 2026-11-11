const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const root=path.resolve(__dirname,'../src/editor');
const types=loadTypeScript(path.join(root,'video/effects/types.ts'));
const video=loadTypeScript(path.join(root,'video/timeline.ts'));
const {VIDEO_EFFECT_CATALOG,createVideoEffect}=loadTypeScript(path.join(root,'video/effects/catalog.ts'));
const {FILTER_CATALOG}=loadTypeScript(path.join(root,'effect-catalog.ts'));
test('video catalog offers all 220 current image effects plus eight video processors',()=>{
  assert.equal(FILTER_CATALOG.length,220);assert.equal(VIDEO_EFFECT_CATALOG.length,228);
  for(const item of FILTER_CATALOG)assert.ok(VIDEO_EFFECT_CATALOG.some(e=>e.kind===item.kind&&e.label===item.label));
  assert.equal(new Set(VIDEO_EFFECT_CATALOG.map(e=>e.kind)).size,228);
  assert.ok(!VIDEO_EFFECT_CATALOG.some(e=>e.kind==='cutout'));
  assert.throws(()=>createVideoEffect('cutout'),/Footage tools/);
  for(const descriptor of VIDEO_EFFECT_CATALOG)assert.ok(types.validVideoEffects([createVideoEffect(descriptor.kind)]));
  const completeStack=VIDEO_EFFECT_CATALOG.map(e=>createVideoEffect(e.kind));
  assert.ok(types.validVideoEffects(JSON.parse(JSON.stringify(completeStack))),
    'A clip containing the complete catalog must remain saveable and recoverable');
});
test('video effect stacks, keyframes and transitions survive project serialization',()=>{
  const asset=video.makeAsset('Scene.mp4','C:/Scene.mp4','video',10,1280,720);
  const result=video.addMediaClip(video.defaultTimeline(),asset),effect=createVideoEffect('video-color-grade');
  effect.keyframes=[{parameter:'amount',time:0,value:0},{parameter:'amount',time:2,value:100}];
  result.clip.effects=[effect];result.clip.transitionIn={version:1,kind:'wipe',duration:.5,direction:'left'};
  assert.ok(video.isVideoTimeline(JSON.parse(JSON.stringify(result.timeline))));
  assert.equal(types.evaluateVideoEffect(effect,1).amount,50);
  assert.equal(types.evaluateVideoEffect(effect,3).amount,100);
  assert.equal(types.evaluateVideoEffect(effect,0).amount,0);
  const broken=structuredClone(result.timeline);broken.clips[0].effects[0].amount=NaN;assert.equal(video.isVideoTimeline(broken),false);
  broken.clips[0].effects[0].amount=20;broken.clips[0].transitionIn.duration=Infinity;assert.equal(video.isVideoTimeline(broken),false);
});
test('splits and trims preserve interpolated parameter values and source paths',()=>{
  const asset=video.makeAsset('Scene.mp4','C:/immutable.mp4','video',10);
  const {timeline,clip}=video.addMediaClip(video.defaultTimeline(),asset);
  const effect=createVideoEffect('video-color-grade');effect.keyframes=[{parameter:'amount',time:0,value:0},{parameter:'amount',time:4,value:100}];clip.effects=[effect];
  const {timeline:split,rightId}=video.splitClip(timeline,clip.id,2),right=split.clips.find(c=>c.id===rightId);
  assert.equal(types.evaluateVideoEffect(right.effects[0],0).amount,50);
  assert.equal(types.evaluateVideoEffect(right.effects[0],1).amount,75);
  const trimmed=video.trimClip(timeline,clip.id,'left',1);
  assert.equal(types.evaluateVideoEffect(trimmed.clips[0].effects[0],0).amount,25);
  assert.equal(timeline.assets[0].path,'C:/immutable.mp4');assert.equal(timeline.clips[0].sourceIn,0);
});
