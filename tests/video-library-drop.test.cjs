const assert = require('node:assert/strict');
const {test} = require('node:test');
require('../scripts/video-canvas-runtime.cjs');
const {addMediaClip, addTitle, defaultTimeline, isVideoTimeline, makeAsset} = require('../src/editor/video/timeline.ts');
const {applyLibraryClipCard, placeLibraryMedia, resolveLibraryDrop} = require('../src/editor/video/library-drop.ts');
const {VIDEO_FILTERS} = require('../src/editor/video/filters/index.ts');
const {applyVideoComposition} = require('../src/editor/video/compositions.ts');

function footage() {
  const asset = makeAsset('Gameplay', 'gameplay.mp4', 'video', 4);
  const first = addMediaClip(defaultTimeline(), asset, 'video1', 0);
  const second = addMediaClip(first.timeline, asset, 'video1', 4);
  return { asset, first: first.clip, second: second.clip, timeline: second.timeline };
}
const hit = (trackId, clipId, time) => ({ trackId, clipId, time, edgeWindow: .15 });

test('effect, filter and motion cards use the hovered clip and retain unrelated edits', () => {
  const {timeline,first,second} = footage();
  const target = hit('video1',second.id,5);
  const effect = {kind:'effect',id:'grayscale'};
  const effectDrop = resolveLibraryDrop(timeline,effect,target);
  const applied = applyLibraryClipCard(timeline,effect,effectDrop.clipId);
  assert.equal(applied.clip.effects[0].kind,'grayscale');
  assert.equal(applied.timeline.clips.find(clip=>clip.id===first.id),first);

  const filter = {kind:'filter',id:VIDEO_FILTERS[0].id};
  const filtered = applyLibraryClipCard(applied.timeline,filter,second.id);
  const changed = applyLibraryClipCard(filtered.timeline,{...filter,id:VIDEO_FILTERS[1].id},second.id);
  assert.equal(changed.clip.effects[0],applied.clip.effects[0]);
  assert.equal(changed.clip.effects.length,2);
  assert.equal(changed.clip.effects[1].parameters.lookId,VIDEO_FILTERS[1].id);
  const animated = applyLibraryClipCard(changed.timeline,{kind:'motion',id:'rise-in'},second.id);
  assert.ok(animated.clip.keyframes.length > 0);
  assert.ok(isVideoTimeline(animated.timeline));
});

test('the outgoing side of a cut targets the incoming clip and swapping transitions keeps its timing', () => {
  const {timeline,first,second} = footage();
  const card = {kind:'transition',id:'cross-dissolve'};
  const target = resolveLibraryDrop(timeline,card,hit('video1',first.id,3.98));
  assert.equal(target.clipId,second.id);
  const applied = applyLibraryClipCard(timeline,card,target.clipId,target.transition);
  assert.equal(applied.clip.start,4);
  assert.equal(applied.clip.transitionIn.duration,.5);
  assert.equal(applied.clip.transitionIn.placement,'cut');
  assert.equal(applied.timeline.clips[0],first);
  const replaced = applyLibraryClipCard(applied.timeline,{kind:'transition',id:'wipe'},target.clipId);
  assert.equal(replaced.clip.start,4);
  assert.equal(replaced.clip.transitionIn.kind,'wipe');
  assert.equal(resolveLibraryDrop(timeline,card,hit('video1',undefined,3.7)),undefined);
  assert.ok(isVideoTimeline(replaced.timeline));
});

test('drop rules reject locked clips and incompatible cards but allow text and audio over footage', () => {
  const {timeline,first} = footage();
  const audio = addMediaClip(timeline,makeAsset('Voice','voice.wav','audio',2),'audio1',0);
  const effect = {kind:'effect',id:'grayscale'};
  const title = {kind:'text',id:'gold-headline'};
  const target = hit('video1',first.id,1.75);
  assert.equal(resolveLibraryDrop(audio.timeline,effect,hit('audio1',audio.clip.id,1)),undefined);
  assert.equal(resolveLibraryDrop(audio.timeline,title,hit('audio1',audio.clip.id,1)),undefined);
  assert.equal(resolveLibraryDrop(timeline,effect,hit('video2',undefined,1)),undefined);
  assert.equal(resolveLibraryDrop(audio.timeline,{kind:'asset',id:audio.clip.assetId},target).kind,'insert');
  assert.equal(resolveLibraryDrop(timeline,title,target).time,1.75);
  const locked={...timeline,tracks:timeline.tracks.map(track=>track.id==='video1'?{...track,locked:true}:track)};
  assert.equal(resolveLibraryDrop(locked,effect,target),undefined);
  assert.equal(applyLibraryClipCard(locked,effect,first.id),undefined);
});

test('placing a card on occupied footage uses an overlay, while an empty lane keeps the requested track', () => {
  const {timeline,asset,first} = footage();
  const image = makeAsset('Poster','poster.png','image',5);
  const at = 1.25;
  const overlay = placeLibraryMedia(timeline,image,at,'video1');
  assert.equal(overlay.clip.trackId,'video2');
  assert.equal(overlay.clip.start,at);
  assert.equal(overlay.timeline.clips.find(clip=>clip.id===first.id),first);
  const later = placeLibraryMedia(overlay.timeline,asset,10,'video1');
  assert.equal(later.clip.trackId,'video1');
  const textTrack = {...later.timeline.tracks[0],id:'extra-title'};
  const withText = addTitle({...later.timeline,tracks:[...later.timeline.tracks,textTrack]},at,'Placed title','extra-title');
  assert.equal(withText.clip.trackId,'extra-title');
  assert.equal(withText.clip.start,at);
  const layout = applyVideoComposition(timeline,'cinema',at,first.assetId,'video1');
  assert.equal(layout.clips.find(clip=>clip.id===first.id),first);
  assert.ok(layout.clips.some(clip=>clip.assetId===first.assetId&&clip.trackId==='video2'&&clip.start===at));
  assert.ok(isVideoTimeline(layout));
});
