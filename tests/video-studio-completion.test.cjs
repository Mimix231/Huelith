const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../scripts/video-canvas-runtime.cjs');
const {
  defaultTimeline, addMediaClip, splitClip, trimClip, isVideoTimeline, activeClips, addTitle,
} = require('../src/editor/video/timeline.ts');
const { deleteClips, pasteClips, moveSelectedClips, rippleTrim } = require('../src/editor/video/timeline-edits.ts');
const { retimeClip, sourceTimeAt } = require('../src/editor/video/clip-timing.ts');
const { transformAt } = require('../src/editor/video/motion.ts');
const { makeCompound, sceneAt, replaceScene, addSequence, switchSequence } = require('../src/editor/video/sequences.ts');
const { newVideoProject, isVideoProject } = require('../src/editor/project-hub.ts');
const { audioGainAt, audioPositionAt, timelineAudioSources } = require('../src/editor/video/audio-plan.ts');
const { parseCube, gradePixel, applyVideoGrade } = require('../src/editor/video/color-tools.ts');
const { encodeMatte, decodeMatte, estimateTranslation, stabilizePath, motionAt } = require('../src/editor/video/smart-footage.ts');
const { createPreset, applyLayout, encodePresetPack, decodePresetPack } = require('../src/editor/video/user-presets.ts');
const { TimelineCompositor, videoSurface } = require('../src/editor/video/compositor.ts');
const { createLibraryVideoEffect } = require('../src/editor/video/effect-previews.ts');

function asset(id, kind, duration) {
  return { id, kind, duration, name: id, path: `C:/source/${id}`, width: 8, height: 8 };
}
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);

test('ripple trims and deletion preserve other tracks and clipboard offsets', () => {
  let timeline = defaultTimeline();
  const media = asset('gameplay.mp4', 'video', 3);
  const a = addMediaClip(timeline, media, 'video1', 0);
  const b = addMediaClip(a.timeline, media, 'video1', 3);
  const audio = addMediaClip(b.timeline, asset('narration.wav', 'audio', 20), 'audio1', 0);
  timeline = audio.timeline;
  const changed = rippleTrim(timeline, a.clip.id, 'right', -1, 1/30);
  assert.equal(changed.clips.find(clip => clip.id === b.clip.id).start, 2);
  assert.equal(changed.clips.find(clip => clip.id === audio.clip.id), audio.clip);
  const deleted = deleteClips(timeline, [a.clip.id], true);
  assert.equal(deleted.clips.find(clip => clip.id === b.clip.id).start, 0);
  const copied = pasteClips(timeline, { clips: [a.clip,b.clip], tracks: timeline.tracks }, 9);
  assert.deepEqual(copied.timeline.clips.filter(clip => copied.ids.includes(clip.id)).map(clip => clip.start), [9,12]);
  const moved = moveSelectedClips(timeline, [a.clip.id,b.clip.id], b.clip.id, 2, 'video2');
  assert.deepEqual(moved.clips.filter(clip => clip.trackId==='video2').map(clip=>clip.start), [2,5]);
  assert.equal(moveSelectedClips(timeline, [a.clip.id], a.clip.id, 2, 'audio1'), timeline);
  assert.ok(isVideoTimeline(moved));
});

test('reverse, ramps, source ranges and eased keys survive a split and trim', () => {
  const media = { ...asset('take.mp4', 'video', 20), sourceRange: { in: 4, out: 12 } };
  const added = addMediaClip(defaultTimeline(), media, 'video1', 4);
  assert.equal(added.clip.sourceIn, 4);
  const clip = {
    ...added.clip, ...retimeClip(added.clip, .5, 1.5, true),
    keyframes: [{ parameter: 'x', time: 0, value: 0, easing: 'ease-in' }, { parameter: 'x', time: 8, value: .7 }],
  };
  const timeline = { ...added.timeline, clips: [clip] };
  assert.ok(isVideoTimeline(timeline));
  close(sourceTimeAt(clip,0),12);
  close(sourceTimeAt(clip,8),4);
  const split = splitClip(timeline, clip.id, 7, 1/60);
  const right = split.timeline.clips.find(item => item.id === split.rightId);
  for (const time of [0, .42, 1.1, 3.4, 4.9]) {
    close(sourceTimeAt(right,time),sourceTimeAt(clip,3+time));
    close(transformAt(right,time).x,transformAt(clip,3+time).x);
  }
  const extended = trimClip(split.timeline, right.id, 'right', 99, 1/60);
  assert.ok(isVideoTimeline(extended));
  close(sourceTimeAt(extended.clips.find(item=>item.id===right.id),extended.clips.find(item=>item.id===right.id).duration),0);
});

test('sequences share assets and keep their canvas and compound edits after JSON roundtrip', () => {
  const a = addMediaClip(defaultTimeline(), asset('scene.mp4', 'video', 6), 'video1', 1);
  const b = addTitle(a.timeline, 1, 'Title');
  const grouped = makeCompound(b.timeline, [a.clip.id,b.clip.id]);
  assert.ok(isVideoTimeline(grouped.timeline));
  const nested = sceneAt(grouped.timeline, [grouped.clip.id]);
  const edited = replaceScene(grouped.timeline, [grouped.clip.id], {
    ...nested, clips: nested.clips.map(clip => clip.title ? { ...clip, title: 'Edited title' } : clip),
  });
  const project = { ...newVideoProject('Episode', 1920, 1080, 60), timeline: edited };
  const vertical = { ...addSequence(project, 'Shorts', true), width: 1080, height: 1920, fps: 30 };
  const restored = JSON.parse(JSON.stringify(vertical));
  assert.ok(isVideoProject(restored));
  const original = switchSequence(restored,'main');
  assert.deepEqual([original.width,original.height,original.fps],[1920,1080,60]);
  assert.equal(sceneAt(original.timeline,[grouped.clip.id]).clips.find(clip=>clip.title).title,'Edited title');
  assert.equal(original.timeline.assets.length,1);
  assert.equal(switchSequence(original,vertical.sequence.id).height,1920);
});

test('compound audio is trimmed at the parent boundaries and preserves speed and volume', () => {
  const added = addMediaClip(defaultTimeline(), asset('music.wav','audio',10),'audio1',0);
  const narration = addMediaClip(added.timeline, asset('voice.wav','audio',1),'audio1',1);
  const clips = narration.timeline.clips.map(clip=>clip.id===added.clip.id ? {
    ...clip, ...retimeClip(clip,2), volumeKeys:[{time:0,value:.2},{time:5,value:1}],
  } : clip);
  const grouped = makeCompound({...narration.timeline,clips},clips.map(clip=>clip.id));
  const compound = {...grouped.clip,sourceIn:1,start:3,duration:3,volume:.5};
  const scene={...grouped.timeline,clips:[compound]};
  const [music, voice] = timelineAudioSources(scene);
  assert.equal(music.start,3);
  assert.equal(music.duration,3);
  assert.equal(music.sourceIn,2);
  assert.equal(voice.start,3);
  close(audioPositionAt(music,4).sourceTime,4);
  close(audioGainAt(music,4),(.2+.8*2/5)*.5);
  assert.equal(audioGainAt(music,6),0);
});

test('the mix ducks under marked dialogue with attack and release and skips muted footage', () => {
  const a = addMediaClip(defaultTimeline(),asset('music.wav','audio',6),'audio1',0);
  const b = addMediaClip(a.timeline,asset('camera.mp4','video',2),'video1',2);
  const timeline = { ...b.timeline,
    tracks:b.timeline.tracks.map(track=>track.id==='video1'?{...track,purpose:'dialogue'}:track),
    clips:b.timeline.clips.map(clip=>clip.id===a.clip.id?{...clip,ducking:{amount:.75,attack:.5,release:.5}}:clip),
  };
  const [music] = timelineAudioSources(timeline);
  close(audioGainAt(music,1.75),.625);
  close(audioGainAt(music,2.1),.25);
  close(audioGainAt(music,4.25),.625);
  close(audioGainAt(music,4.6),1);
  const muted={...timeline,clips:timeline.clips.map(clip=>clip.id===b.clip.id?{...clip,audioMuted:true}:clip)};
  const planned=timelineAudioSources(muted);
  assert.equal(planned.length,1);
  assert.equal(audioGainAt(planned[0],2.1),1);
});

test('real .cube interpolation preserves alpha and uses red-fast channel order', () => {
  const rows=[];
  for(let b=0;b<=1;b++)for(let g=0;g<=1;g++)for(let r=0;r<=1;r++)rows.push(`${b} ${g} ${r}`);
  const lut=parseCube(`TITLE "Swap"\nLUT_3D_SIZE 2\n${rows.join('\n')}`,'swap.cube');
  const [r,g,b]=gradePixel([.18,.42,.87],{lut});
  close(r,.87);close(g,.42);close(b,.18);
  const canvas=videoSurface(2,1),ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(220,40,20,.5)';ctx.fillRect(0,0,1,1);
  const out=applyVideoGrade(canvas,{lut}).getContext('2d').getImageData(0,0,2,1).data;
  assert.ok(out[0]<25&&out[2]>210);
  assert.equal(out[3],ctx.getImageData(0,0,1,1).data[3]);
  assert.equal(out[7],0);
  assert.throws(()=>parseCube('LUT_3D_SIZE 2\n0 0 0','broken.cube'),/incomplete/);
});

test('motion measurement finds a real translation and stabilizes oscillating camera movement', () => {
  const width=112,height=74;
  function frame(dx,dy) {
    const pixels=new Uint8Array(width*height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const u=x-dx,v=y-dy;
      pixels[y*width+x]=(Math.imul(u+67,29423)^Math.imul(v+89,40121)^Math.imul(u+v,7229))&255;
    }
    return {width,height,pixels};
  }
  const shift=estimateTranslation(frame(0,0),frame(5,-3));
  assert.deepEqual([shift.dx,shift.dy],[5,-3]);
  assert.ok(shift.confidence>.75);
  const path=Array.from({length:24},(_,i)=>({time:i/12,x:i%2?.03:-.03,y:0,confidence:1}));
  const solved=stabilizePath(path);
  assert.ok(solved.zoom>1);
  assert.ok(Math.abs(path[9].x+motionAt(solved.points,.75).x)<.01);
  const mask=Uint8ClampedArray.from([0,0,255,255,119,119,0]);
  assert.deepEqual([...decodeMatte(encodeMatte(mask),mask.length)],[...mask]);
  assert.throws(()=>decodeMatte(encodeMatte(mask),8),/Incomplete/);
});

test('a preset layout can replace a late source cut with a short local asset', () => {
  const media={...asset('two-hour-gameplay.mp4','video',7200),sourceRange:{in:3600,out:3604}};
  const added=addMediaClip(defaultTimeline(),media,'video1',8);
  const title=addTitle(added.timeline,8,'Highlight');
  const preset=createPreset('layout','Highlight overlay',title.timeline,[added.clip.id,title.clip.id]);
  assert.equal(preset.slots[0].minimumDuration,4);
  const [restored]=decodePresetPack(encodePresetPack([preset]));
  const replacement=asset('replacement.mp4','video',5);
  const target={...defaultTimeline(),assets:[replacement]};
  const result=applyLayout(target,restored,{[preset.slots[0].id]:replacement.id},15);
  assert.ok(isVideoTimeline(result.timeline));
  const video=result.timeline.clips.find(clip=>clip.assetId===replacement.id);
  assert.equal(video.start,15);assert.equal(video.duration,4);assert.equal(video.sourceIn,0);
  assert.ok(result.timeline.clips.some(clip=>clip.title==='Highlight'));
  assert.equal(activeClips(result.timeline,15.5).length,2);
});

test('compound transparency, adjustment layers and a timed matte reach the production canvas', async () => {
  const originalFetch=global.fetch;
  const tga=Buffer.alloc(18+8*8*4);
  tga[2]=2;tga.writeUInt16LE(8,12);tga.writeUInt16LE(8,14);tga[16]=32;tga[17]=0x28;
  for(let i=18;i<tga.length;i+=4){tga[i]=20;tga[i+1]=55;tga[i+2]=200;tga[i+3]=255;}
  global.fetch=async()=>new Response(tga);
  const renderer=new TimelineCompositor(64,64,30);
  try{
    const a=addMediaClip(defaultTimeline(),{...asset('fixture.tga','image',5),libraryId:'testing/fixture.tga'},'video1',0);
    const pixels=(canvas,x,y)=>[...canvas.getContext('2d').getImageData(x,y,1,1).data];
    const background={...a.timeline,background:'#102030'};
    const alpha=Uint8ClampedArray.from({length:64},(_,index)=>index%8<4?255:0);
    const masked={...a.clip,smart:{revision:0,matte:{width:8,height:8,frames:[{time:0,x:.25,y:.5,alpha:encodeMatte(alpha)}]}}};
    const matteTimeline={...background,clips:[masked]};
    const frame=await renderer.render(matteTimeline,0);
    assert.deepEqual(pixels(frame,8,32),[200,55,20,255]);
    assert.deepEqual(pixels(frame,56,32),[16,32,48,255]);
    const compound={...masked,id:'compound',assetId:undefined,smart:undefined,title:'Nested',compound:{tracks:a.timeline.tracks,clips:[masked]}};
    const nested=await renderer.render({...background,clips:[compound]},0);
    assert.deepEqual(pixels(nested,56,32),[16,32,48,255]);
    const track={id:'adjust',kind:'video',name:'Adjust',muted:false,locked:false,purpose:'adjustment'};
    const adjustment={...compound,id:'adjustment',trackId:track.id,compound:undefined,adjustment:true,volume:0,
      effects:[{...createLibraryVideoEffect('grayscale'),amount:100}]};
    const graded=await renderer.render({...background,tracks:[track,...background.tracks],clips:[compound,adjustment]},0);
    const [r,g,b]=pixels(graded,8,32);
    assert.equal(r,g);assert.equal(g,b);assert.notEqual(r,200);
  }finally{renderer.dispose();global.fetch=originalFetch;}
});
