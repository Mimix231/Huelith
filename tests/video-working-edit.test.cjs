const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const video=path.resolve(__dirname,'../src/editor/video');
const load=file=>loadTypeScript(path.join(video,file));
const {makeAsset,addMediaClip,defaultTimeline,isVideoTimeline}=load('timeline.ts');
const {makeFirstCut,closeGap,cutRange,fitSoundtrack,pasteAttributes,replacementPatch}=load('working-edit.ts');

test('starter edits keep footage at zero and match dimensions and frame rate',()=>{
  const footage=makeAsset('Match.mp4','C:/Match.mp4','video',25,2560,1440);
  footage.frameRate=59.94;
  const first=makeFirstCut(defaultTimeline(),footage,'gameplay',30);
  assert.deepEqual([first.width,first.height,first.fps,first.clip.start,first.clip.duration],[2560,1440,60,0,25]);
  assert.ok(first.timeline.tracks.some(track=>track.name==='Facecam'));
  assert.ok(first.timeline.tracks.some(track=>track.name==='Voiceover'));
  assert.ok(isVideoTimeline(first.timeline));
  const short=makeFirstCut(defaultTimeline(),footage,'short',30);
  assert.deepEqual([short.width,short.height],[1080,1920]);
  assert.throws(()=>makeFirstCut(first.timeline,footage,'footage',30),/empty timeline/);
});

test('range cuts keep linked clips in sync and close-gap honors locks',()=>{
  const video=makeAsset('Clip.mp4','C:/Clip.mp4','video',8);
  const audio=makeAsset('Mic.wav','C:/Mic.wav','audio',8);
  const first=addMediaClip(defaultTimeline(),video,'video1',4);
  const second=addMediaClip(first.timeline,audio,'audio1',4);
  first.clip.linkId=second.clip.linkId='together';
  const cut=cutRange(second.timeline,[first.clip.id],{start:6,end:10},30);
  assert.equal(cut.timeline.clips.length,6);
  assert.equal(cut.clips.length,2);
  assert.equal(cut.clips[0].linkId,cut.clips[1].linkId);
  assert.ok(cut.clips.every(clip=>clip.start===6&&clip.duration===4&&clip.sourceIn===2));
  assert.ok(isVideoTimeline(cut.timeline));
  assert.ok(closeGap(second.timeline,'video1',1).clips.every(clip=>clip.start===0));
  const locked={...second.timeline,tracks:second.timeline.tracks.map(track=>track.id==='audio1'?{...track,locked:true}:track)};
  assert.throws(()=>closeGap(locked,'video1',1),/Unlock/);
});

test('attributes leave timing in place and short replacements preserve the cut',()=>{
  const footage=makeAsset('Clip.mp4','C:/Clip.mp4','video',12);
  const a=addMediaClip(defaultTimeline(),footage,'video1',0);
  const b=addMediaClip(a.timeline,footage,'video1',12);
  a.clip.scale=1.4;
  a.clip.volume=.4;
  const result=pasteAttributes(b.timeline,a.clip,[b.clip.id],['motion']);
  const target=result.clips.find(clip=>clip.id===b.clip.id);
  assert.deepEqual([target.start,target.duration,target.scale,target.volume],[12,12,1.4,1]);
  const shorter=makeAsset('Short.mp4','C:/Short.mp4','video',4);
  const replacement=replacementPatch(target,shorter);
  assert.equal(replacement.rate,1/3);
  assert.equal(replacement.patch.sourceMap.at(-1).source,4);
  assert.ok(isVideoTimeline({...result,assets:[...result.assets,shorter],clips:[a.clip,{...target,...replacement.patch}]}));
});

test('fitted soundtrack lands on the range end even with a subframe remainder',()=>{
  const audio=makeAsset('Score.wav','C:/Score.wav','audio',2);
  const {timeline,clip}=addMediaClip(defaultTimeline(),audio,'audio1',0);
  const parts=fitSoundtrack(clip,audio,{start:4,end:10.014},[0,1,2],30);
  assert.equal(parts[0].start,4);
  assert.ok(Math.abs(parts.at(-1).start+parts.at(-1).duration-10.014)<1e-8);
  assert.ok(parts.every(part=>part.duration>=1/30&&part.sourceIn+part.duration<=audio.duration));
  assert.ok(isVideoTimeline({...timeline,clips:parts}));
});
