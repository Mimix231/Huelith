const test=require('node:test');
const assert=require('node:assert/strict');
const {createCanvas}=require('../scripts/video-canvas-runtime.cjs');
const {TimelineCompositor}=require('../src/editor/video/compositor.ts');
const {defaultTimeline,addMediaClip,makeAsset,isVideoTimeline}=require('../src/editor/video/timeline.ts');
const {precisionEdit,placeSourceEdit,assembleSelects}=require('../src/editor/video/precision-edit.ts');
const {linkClips,moveSelectedClips,splitLinkedClips,rippleTrim}=require('../src/editor/video/timeline-edits.ts');
const {librarySampleTime}=require('../src/editor/video/library-drop.ts');
const {retimeClipCurve,sourceTimeAt,pitchTiming}=require('../src/editor/video/clip-timing.ts');
const {timelineAudioSources,audioGainAt,audioPositionAt}=require('../src/editor/video/audio-plan.ts');
const {buildMulticam,cutMulticam,correlateAngles}=require('../src/editor/video/multicam.ts');
const {readOtio,writeOtio}=require('../src/editor/video/otio.ts');
const {VIDEO_SHAPES}=require('../src/editor/video/graphics.ts');
const {createLibraryVideoEffect}=require('../src/editor/video/effect-previews.ts');
const {processVideoEffects}=require('../src/editor/video/process-effects.ts');
const {removeReviewedRange,assembleHighlights}=require('../src/editor/video/editorial-review.ts');

function fixture(){
  const asset=makeAsset('Gameplay sample.mp4','C:/Clips/Gameplay sample.mp4','video',20,1920,1080);
  const marked=(start,end)=>({...asset,sourceRange:{in:start,out:end}});
  const left=addMediaClip(defaultTimeline(),marked(2,6),'video1',0);
  const right=addMediaClip(left.timeline,marked(8,12),'video1',4);
  return {...right,asset,marked,left:left.clip};
}

test('library sampling lands inside a clip that starts between frame boundaries',()=>{
  const clip={...fixture().clip,start:1.015,duration:1};
  assert.equal(librarySampleTime({kind:'effect',id:'sig_11'},clip,0,30),31/30);
  assert.ok(librarySampleTime({kind:'filter',id:'look'},clip,4,30)<2.015);
});

test('electric edge follows opaque image detail and uses the thumbnail colors',async()=>{
  const source=createCanvas(160,100),ctx=source.getContext('2d');
  ctx.fillStyle='#191919';ctx.fillRect(0,0,160,100);
  ctx.fillStyle='#d7d7d7';ctx.fillRect(70,18,42,64);
  const effect=createLibraryVideoEffect('sig_11');
  const output=await processVideoEffects(source,[effect],{timestamp:0,sourceTime:0,frameIndex:0,fps:30});
  const data=output.getContext('2d').getImageData(66,40,8,12).data;
  assert.ok([...data].some((value,index)=>index%4===2&&value>data[index-2]+9));
  assert.ok(data.filter((_,index)=>index%4===3).every(alpha=>alpha===255));
});

test('precision and source edits keep cuts and hidden source handles coherent',()=>{
  const {timeline,left,clip,marked}=fixture();
  const rolled=precisionEdit(timeline,clip.id,'roll',.5,1/30);
  assert.equal(rolled.clips.find(item=>item.id===left.id).duration,4.5);
  assert.equal(rolled.clips.find(item=>item.id===clip.id).sourceIn,8.5);
  const slipped=precisionEdit(rolled,clip.id,'slip',-1,1/30);
  assert.equal(slipped.clips.find(item=>item.id===clip.id).sourceIn,7.5);
  const edited=placeSourceEdit(timeline,marked(15,17),2,'video1','insert');
  assert.deepEqual(edited.timeline.clips.map(item=>item.start).sort((a,b)=>a-b),[0,2,4,6]);
  assert.ok(isVideoTimeline(edited.timeline));
  const overwritten=placeSourceEdit(timeline,marked(15,17),3,'video1','overwrite');
  assert.deepEqual(overwritten.timeline.clips.map(item=>item.start).sort((a,b)=>a-b),[0,3,5]);
  const named=assembleSelects(timeline,{...marked(0,1),selects:[{id:'a',name:'Boss fight',in:2,out:3},{id:'b',name:'Outro',in:11,out:13}]},8,'video1');
  assert.deepEqual(named.timeline.clips.filter(item=>named.ids.includes(item.id)).map(item=>[item.title,item.start,item.sourceIn]),[['Boss fight',8,2],['Outro',9,11]]);
});

test('linked cuts and ripple trims keep companion audio and sync-locked lanes aligned',()=>{
  const {timeline,left,clip,asset}=fixture();
  const audioAsset=makeAsset('Mic.wav','C:/Clips/Mic.wav','audio',20);
  const audio=addMediaClip(timeline,{...audioAsset,sourceRange:{in:2,out:6}},'audio1',0);
  const nextAudio=addMediaClip(audio.timeline,{...audioAsset,sourceRange:{in:8,out:12}},'audio1',4);
  const linked=linkClips(nextAudio.timeline,[left.id,audio.clip.id]);
  const moved=moveSelectedClips(linked,[left.id],left.id,1,'video2');
  assert.equal(moved.clips.find(item=>item.id===audio.clip.id).start,1);
  assert.equal(moved.clips.find(item=>item.id===left.id).trackId,'video2');
  const split=splitLinkedClips(linked,[left.id],2,1/30);
  assert.equal(split.ids.length,2);
  const right=split.timeline.clips.filter(item=>split.ids.includes(item.id));
  assert.equal(right[0].linkId,right[1].linkId);
  assert.notEqual(right[0].linkId,linked.clips.find(item=>item.id===left.id).linkId);
  const sync={...linked,tracks:linked.tracks.map(track=>track.id==='audio1'?{...track,syncLock:true}:track)};
  const rippled=rippleTrim(sync,left.id,'right',-1,1/30);
  assert.equal(rippled.clips.find(item=>item.id===clip.id).start,3);
  assert.equal(rippled.clips.find(item=>item.id===nextAudio.clip.id).start,3);
  assert.ok(isVideoTimeline(rippled));
  assert.equal(asset.kind,'video');
});

test('ranged audio retains source time, fades and mixer gain after time rebasing',()=>{
  const {timeline,left}=fixture();
  const mixed={...timeline,tracks:timeline.tracks.map(track=>track.id==='video1'?{...track,gain:.5}:track),
    clips:timeline.clips.map(item=>item.id===left.id?{...item,fadeIn:2}:item)};
  const source=timelineAudioSources(mixed,{start:1,end:3})[0];
  assert.equal(source.start,0);
  assert.equal(audioPositionAt(source,0).sourceTime,3);
  assert.equal(audioGainAt(source,0),.25);
  assert.equal(audioGainAt(source,1),.5);
});

test('multi-point speed curves retain source boundaries and produce pitch timing',()=>{
  const {clip}=fixture(),curve=[{at:0,rate:1},{at:.4,rate:3},{at:1,rate:.5}];
  const edited={...clip,...retimeClipCurve(clip,curve)};
  assert.equal(sourceTimeAt(edited,edited.duration),12);
  assert.ok(edited.duration<clip.duration);
  const timing=pitchTiming(edited);
  assert.equal(timing.start,8);assert.equal(timing.end,12);
  assert.ok(timing.rates.length>2&&timing.rates.every(key=>key.rate>=.5&&key.rate<=3));
});

test('multicam makes editable program cuts and keeps the camera media and reference audio',()=>{
  const {timeline,left,clip}=fixture();
  const aligned=buildMulticam(timeline,[left.id,clip.id],[0,0]);
  const target=aligned.tracks.filter(track=>track.purpose==='camera-angle')[1];
  const switched=cutMulticam(aligned,target.id,1,30);
  const program=switched.tracks.find(track=>track.purpose==='camera-program');
  assert.deepEqual(switched.clips.filter(item=>item.trackId===program.id).map(item=>[item.start,item.sourceIn]),[[0,2],[1,9]]);
  assert.equal(timelineAudioSources(switched).length,1);
  assert.ok(isVideoTimeline(switched));
  const envelope=Array.from({length:400},(_,index)=>Math.sin(index**1.23)*.3+.4);
  const delayed=[...Array(20).fill(.05),...envelope.slice(0,-20)];
  assert.ok(Math.abs(correlateAngles(envelope,delayed,8,8,50)+.4)<.03);
});

test('reviewed edits and highlight extraction preserve editable source timing',()=>{
  const {timeline}=fixture();
  const cut=removeReviewedRange(timeline,{start:2,end:5});
  assert.deepEqual(cut.clips.map(item=>[item.start,item.sourceIn,item.duration]),[[0,2,2],[2,9,3]]);
  const highlights=assembleHighlights(timeline,[{id:'a',name:'Clip',start:5,end:7}]);
  assert.deepEqual(highlights.clips.map(item=>[item.start,item.sourceIn,item.duration]),[[0,9,2]]);
  assert.ok(isVideoTimeline(highlights));
});

test('OTIO round trip retains reference URIs, cuts, gaps and source In',()=>{
  const {timeline,clip}=fixture();
  const scene={...timeline,clips:timeline.clips.map(item=>item.id===clip.id?{...item,start:5,effects:[createLibraryVideoEffect('sig_11')]}:item)};
  const serialized=writeOtio(scene,'Highlights',60);
  assert.ok(serialized.warnings.some(warning=>warning.includes('Effects')));
  const loaded=readOtio(serialized.document,'C:/Projects');
  assert.equal(loaded.fps,60);
  assert.equal(loaded.timeline.assets[0].path,'C:/Clips/Gameplay sample.mp4');
  assert.deepEqual(loaded.timeline.clips.map(item=>[item.start,item.sourceIn,item.duration]),[[0,2,4],[5,8,4]]);
});

test('real composited frames reuse cache after unrelated edits and preserve transparent graphics',async()=>{
  const scene=defaultTimeline(),graphic={id:'badge',trackId:'title',title:'Badge',start:0,sourceIn:0,duration:2,
    volume:0,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0,shape:VIDEO_SHAPES[2].shape};
  const timeline={...scene,clips:[graphic]};
  const renderer=new TimelineCompositor(320,180,30,320,true);
  try{
    const first=await renderer.render(timeline,0,undefined,true);
    const pixels=first.getContext('2d').getImageData(0,0,320,180).data;
    assert.equal(pixels[3],0);assert.equal(pixels[(90*320+160)*4+3],255);
    const unrelated={...timeline,clips:[graphic,{...graphic,id:'later',start:3}]};
    assert.equal(await renderer.render(unrelated,0,undefined,true),first);
    const changed={...timeline,clips:[{...graphic,x:.2}]};
    assert.notEqual(await renderer.render(changed,0,undefined,true),first);
  }finally{renderer.dispose();}
});
