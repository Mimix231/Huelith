const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function file(p){return fs.readFileSync(path.join(root,p),'utf8');}
function pureTimeline(){return require('./helpers/load-typescript.cjs').loadTypeScript(path.join(root,'src/editor/video/timeline.ts'));}
test('Stage C timeline retains non-destructive source references and supports editing',()=>{
  const v=pureTimeline();let t=v.defaultTimeline();
  const asset=v.makeAsset('Scene.mp4','C:/Movies/Scene.mp4','video',15,1920,1080);
  let made=v.addMediaClip(t,asset);t=made.timeline;const clip=made.clip;
  assert.equal(t.assets[0].path,'C:/Movies/Scene.mp4');
  assert.equal(t.clips.length,1);assert.equal(v.durationOf(t),15);
  t=v.moveClip(t,clip.id,3);
  assert.equal(t.clips[0].start,3);
  assert.equal(v.durationOf(t),18);
  let split=v.splitClip(t,clip.id,9);t=split.timeline;
  assert.equal(t.clips.length,2);
  assert.deepEqual([...t.clips.map(c=>c.duration)].sort((a,b)=>a-b),[6,9]);
  assert.equal(t.clips.find(c=>c.id===split.rightId).sourceIn,6);
  t=v.trimClip(t,split.rightId,'right',-3);
  assert.equal(t.clips.find(c=>c.id===split.rightId).duration,6);
  assert.ok(v.isVideoTimeline(t));
  t=v.removeClip(t,split.rightId);
  assert.equal(t.clips.length,1);
});
test('trimming respects media duration, duration limits and locked tracks',()=>{
  const v=pureTimeline();let t=v.defaultTimeline();
  const asset=v.makeAsset('Camera.mp4','clip.mp4','video',6);
  const result=v.addMediaClip(t,asset);t=result.timeline;
  const clip=result.clip;
  t=v.trimClip(t,clip.id,'right',100);
  assert.equal(t.clips[0].duration,6);
  t=v.trimClip(t,clip.id,'left',4);
  assert.equal(t.clips[0].sourceIn,4);
  assert.equal(t.clips[0].duration,2);
  const id=clip.trackId;
  t={...t,tracks:t.tracks.map(track=>track.id===id?{...track,locked:true}:track)};
  const ignored=v.removeClip(t,clip.id);
  assert.equal(ignored,t);
  assert.equal(v.moveClip(t,clip.id,12),t);
  assert.ok(v.isVideoTimeline(t));
});
test('titles and audio tracks are independent and frame opacity interpolates',()=>{
  const v=pureTimeline();let t=v.defaultTimeline();
  const title=v.addTitle(t,2,'A title');t=title.timeline;
  const sound=v.makeAsset('beat.mp3','C:/beat.mp3','audio',4);
  t=v.addMediaClip(t,sound).timeline;
  assert.equal(t.clips.length,2);
  assert.equal(v.activeClips(t,2.5).length,2);
  const updated={...title.clip,fadeIn:1,fadeOut:1};
  assert.equal(v.opacityAt(updated,2),0);
  assert.equal(v.opacityAt(updated,2.5),.5);
  assert.equal(v.opacityAt(updated,3.5),1);
  assert.equal(v.opacityAt(updated,4.75),.25);
  assert.equal(v.opacityAt(updated,5),0);
  t=v.newTrack(t,'audio');assert.equal(t.tracks.filter(x=>x.kind==='audio').length,2);
  assert.ok(v.isVideoTimeline(t));
});
test('video file validation rejects broken nested timelines but remains Stage A/B compatible',()=>{
  const v=pureTimeline();const t=v.defaultTimeline();
  assert.ok(v.isVideoTimeline(t));
  assert.equal(v.isVideoTimeline({...t,clips:[{id:'bad'}]}),false);
  assert.equal(v.isVideoTimeline({...t,assets:[{id:'a',name:'bad',path:'bad',kind:'video',duration:Infinity}]}),false);
  const code=file('src/editor/project-hub.ts');
  assert.match(code,/timeline\?: VideoTimeline/);
  assert.match(code,/v.timeline === undefined \|\| isVideoTimeline/);
  assert.match(code,/format: 'huelith-video'/);
  assert.match(file('src/App.tsx'),/onChange=\{next => \{ setVideoProject\(next\); setVideoSaved\(false\); \}\}/);
});
test('Video Editor operates on the project and uses native encoded edited frames, not test-pattern exports',()=>{
  const component=file('src/components/VideoWorkspace.tsx');
  const exporter=file('src/editor/video/export-timeline.ts');
  for(const feature of ['placeLibraryMedia','splitLinkedClips','trimLinkedClips','moveSelectedClips','deleteClips','addTitle','mediaUrl','enqueueDelivery','setPlaying'])
    assert.ok(component.includes(feature),`${feature} not connected`);
  assert.ok(exporter.includes('streamNativeVideo'));
  assert.match(file('src/editor/video/delivery.ts'),/await exportEditedVideo/);
  assert.ok(exporter.includes('compositor.render'));
  assert.ok(file('src/editor/video/compositor.ts').includes('await seekVideo'));
  assert.ok(file('src/editor/video/compositor.ts').includes('this.effects.process'));
  assert.ok(file('src/editor/video/effects-worker.ts').includes('processVideoEffects'));
  assert.doesNotMatch(exporter,/(?:from .*ffmpeg|exec\(|exportNativeTestPattern)/i);
  assert.match(component,/mixes audible tracks/);
  assert.match(file('src/components/CreativeHub.tsx'),/Cut, arrange, tell your story/);
});
test('video playback advances from both endpoints even when the first animation frame has an earlier timestamp',()=>{
  const filename='src/components/VideoWorkspace.tsx';
  const source=ts.createSourceFile(filename,file(filename),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  function findPlaybackEffect(node){
    if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'
      &&node.arguments[1]?.getText(source).replace(/\s/g,'')==='[playing,total,direction]')return node.arguments[0];
    return ts.forEachChild(node,findPlaybackEffect);
  }
  const effect=findPlaybackEffect(source);
  assert.ok(effect,'VideoWorkspace should start a clock when playback begins');
  const clock=new vm.Script(ts.transpileModule(`(${effect.getText(source)})()`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022},
  }).outputText);

  const total=2;
  for(const direction of [1,-1]){
    for(const firstFrame of [995,1000]){
      const start=direction===1?0:total;
      let head=start,playing=true,nextFrame=0;
      const frames=new Map();
      const stop=clock.runInNewContext({head,playing,total,direction,looping:{current:undefined},performance:{now:()=>1000},
        cap:(value,min,max)=>Math.max(min,Math.min(max,value)),
        requestAnimationFrame:callback=>{frames.set(++nextFrame,callback);return nextFrame;},
        cancelAnimationFrame:id=>frames.delete(id),
        setHead:value=>{head=value;},setPlaying:value=>{playing=value;},
      });
      function frame(time){
        assert.equal(frames.size,1,'Playback should have one frame scheduled');
        const [[id,callback]]=frames;
        frames.delete(id);
        callback(time);
      }
      frame(firstFrame);
      assert.equal(playing,true,'The first frame at the starting endpoint must not stop playback');
      assert.equal(head,start);
      frame(firstFrame+100);
      assert.equal(head,start+direction*.1);
      frame(firstFrame+2100);
      assert.equal(head,direction===1?total:0);
      assert.equal(playing,false);
      assert.equal(frames.size,0);
      stop();
    }
  }
});
test('all Stage C modified TypeScript/TSX files parse without syntax errors',()=>{
  for(const p of ['src/editor/video/timeline.ts','src/editor/video/media-assets.ts','src/editor/video/export-timeline.ts',
     'src/editor/project-hub.ts','src/components/VideoWorkspace.tsx','src/components/CreativeHub.tsx','src/App.tsx']){
     const output=ts.transpileModule(file(p),{fileName:p,reportDiagnostics:true,
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
     assert.equal(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0,p);
  }
});
