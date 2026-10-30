const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root,f),'utf8');
const instances = new Map();
function transpiled(file) {
  if (instances.has(file)) return instances.get(file);
  const src = read('src/editor/'+file+'.ts');
  const js = ts.transpileModule(src, {fileName:file+'.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{}};
  instances.set(file,mod.exports);
  new Function('require','module','exports',js)(dependency => transpiled(path.posix.normalize(path.posix.join(path.posix.dirname(file),dependency))),mod,mod.exports);
  instances.set(file,mod.exports);
  return mod.exports;
}
const clock = transpiled('playback-clock');
const creative = transpiled('creative');
const {createDocument, isDocument} = transpiled('types');
test('Time-based timeline respects unequal cel durations, boundaries, loops and large stalls', () => {
  const frames=[{durationMs:100},{durationMs:250},{durationMs:50}];
  assert.equal(clock.timelineDuration(frames),400);
  assert.equal(clock.timelineFrameAt(frames,0),0);
  assert.equal(clock.timelineFrameAt(frames,100),1);
  assert.equal(clock.timelineFrameAt(frames,349),1);
  assert.equal(clock.timelineFrameAt(frames,350),2);
  assert.equal(clock.timelineFrameAt(frames,400),0);
  assert.equal(clock.timelineFrameAt(frames,1201),0);
  assert.equal(clock.timelineFrameAt(frames,450),0);
  assert.equal(clock.timelineOffset(frames,2),350);
  assert.equal(clock.timelineFrameAt([],100),0);
});
test('Keyframe interpolation is linear by default, supports Hold and eased transitions', () => {
  const obj=creative.newCreative('particleGarden',300,150);
  obj.tracks={x:[{frame:0,value:0},{frame:10,value:100}]};
  assert.equal(creative.keyframeValue(obj,'x',2.5),25);
  obj.tracks.x[0].interpolation='hold';
  assert.equal(creative.keyframeValue(obj,'x',5),0);
  assert.equal(creative.keyframeValue(obj,'x',10),100);
  obj.tracks.x[0].interpolation='easeInOut';
  assert.equal(creative.keyframeValue(obj,'x',2.5),15.625);
  assert.equal(creative.keyframeValue(obj,'x',5),50);
  assert.equal(creative.keyframeValue(obj,'x',7.5),84.375);
  obj.tracks.color=[{frame:0,value:'#000000',interpolation:'hold'},{frame:10,value:'#ffffff'}];
  assert.equal(creative.keyframeValue(obj,'color',8),'#000000');
});
test('Creative keys preserve easing when their numerical value changes', () => {
  const o=creative.newCreative('lightSculptor',300,200);
  o.tracks={x:[{frame:2,value:12,interpolation:'easeInOut'}]};o.x=64;
  creative.setCreativeKeyframe(o,'x',2);
  assert.equal(o.tracks.x[0].interpolation,'easeInOut');
  assert.equal(o.tracks.x[0].value,64);
});
test('Saved new keyframe interpolation validates and legacy documents still load',()=> {
  const doc=createDocument('sample',320,180);
  doc.creative=[creative.newCreative('shockDesigner',320,180)];
  doc.creative[0].tracks={radius:[{frame:0,value:40,interpolation:'hold'},{frame:1,value:80}]};
  assert.equal(isDocument(JSON.parse(JSON.stringify(doc))),true);
  doc.creative[0].tracks.radius[0].interpolation='not-real';
  assert.equal(isDocument(doc),false);
  doc.creative[0].tracks.radius[0].interpolation='linear';
  doc.format='spectrum';
  assert.equal(isDocument(doc),true);
});
test('Workspace snapping is deterministic and bypassable by callers',()=>{
  const guides=transpiled('workspace-guides');
  assert.deepEqual({...guides.snapPoint({x:16,y:34})},{x:20,y:30});
  assert.deepEqual({...guides.snapPoint({x:-14,y:-34})},{x:-10,y:-30});
  assert.deepEqual({...guides.snapPoint({x:17,y:21},5)},{x:15,y:20});
});
test('Frame scheduler, worker budgets and overlay controls are actually wired',()=> {
  const worker=read('src/editor/effects-worker.ts'),client=read('src/editor/effects-worker-client.ts');
  assert.match(worker,/sourceBudgetBytes/);assert.match(worker,/evictSources/);
  for(const m of [64,128,256]) assert.ok(client.includes(`sourceMb: ${m}`));
  assert.match(read('src/components/AnimationTimeline.tsx'),/timelineRegionAt/);
  assert.match(read('src/components/AnimationTimeline.tsx'),/Playback speed/);
  assert.match(read('src/components/CreativeLab.tsx'),/Keyframe interpolation/);
  assert.match(read('src/components/Canvas.tsx'),/drawViewportRulers/);
  assert.match(read('src/App.tsx'),/<span className="badge">0\.2<\/span>/);
});
test('Packaging metadata all matches Huelith 0.2.0 and legacy effects are not renamed',()=> {
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const tauri=JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(pkg.version,'0.2.0');assert.equal(lock.version,pkg.version);
  assert.equal(tauri.version,pkg.version);
  assert.equal(tauri.productName,'Huelith');
  assert.match(read('src/editor/types.ts'),/glowPalette\?: 'single' \| 'spectrum'/);
  assert.match(read('src/editor/types.ts'),/format: 'huelith' \| 'spectrum'/);
});
