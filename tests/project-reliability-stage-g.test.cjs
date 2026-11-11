const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const {isVideoProject,newVideoProject}=loadTypeScript(path.resolve(__dirname,'../src/editor/project-hub.ts'));
const timeline=loadTypeScript(path.resolve(__dirname,'../src/editor/video/timeline.ts'));
test('older video metadata opens; relink revisions and complete timelines validate',()=>{
  const project=newVideoProject('Old video',1280,720,30);assert.ok(isVideoProject(project));
  const asset=timeline.makeAsset('original.mp4','C:/original.mp4','video',10);asset.revision=1;
  const made=timeline.addMediaClip(timeline.defaultTimeline(),asset);project.timeline=made.timeline;assert.ok(isVideoProject(project));
  const changed=structuredClone(project);changed.timeline.assets[0].path='D:/Relinked/clip.mp4';changed.timeline.assets[0].revision=2;
  assert.ok(isVideoProject(changed));assert.equal(project.timeline.assets[0].path,'C:/original.mp4');
  changed.timeline.assets[0].revision=-1;assert.equal(isVideoProject(changed),false);
});
test('selecting and releasing a clip or trim handle makes no edit/undo entry',()=>{
  const made=timeline.addMediaClip(timeline.defaultTimeline(),timeline.makeAsset('clip.mp4','clip.mp4','video',2));
  assert.equal(timeline.moveClip(made.timeline,made.clip.id,made.clip.start),made.timeline);
  assert.equal(timeline.trimClip(made.timeline,made.clip.id,'right',0),made.timeline);
});
test('media preview streams authorized files rather than reading full source files',()=>{
  const code=fs.readFileSync(path.resolve(__dirname,'../src/editor/video/media-assets.ts'),'utf8');
  assert.ok(code.includes('media_authorize_source'));assert.ok(code.includes('convertFileSrc'));
  assert.doesNotMatch(code,/fs\.readFile|256 \* 1024 \* 1024/);
});
