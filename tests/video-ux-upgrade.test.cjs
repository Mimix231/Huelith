const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const load=name=>require('./helpers/load-typescript.cjs').loadTypeScript(path.join(root,name));

test('box selection intersects clip spans across visible tracks without including hidden tracks',()=>{
  const {clipsInBox}=load('src/editor/video/box-selection.ts');
  const scene={clips:[
    {id:'a',trackId:'top',start:0,duration:4},
    {id:'b',trackId:'middle',start:2,duration:2},
    {id:'c',trackId:'hidden',start:2,duration:2},
    {id:'d',trackId:'bottom',start:7,duration:3},
    {id:'e',trackId:'bottom',start:3,duration:4},
  ]};
  const rows=['top','middle','bottom'];
  assert.deepEqual(clipsInBox(scene,rows,'top','bottom',1,5),['a','b','e']);
  assert.deepEqual(clipsInBox(scene,rows,'bottom','top',5,1),['a','b','e']);
  assert.deepEqual(clipsInBox(scene,rows,'middle','middle',1,5),['b']);
  assert.deepEqual(clipsInBox(scene,rows,'top','bottom',6,6),[]);
  assert.deepEqual(clipsInBox(scene,rows,'hidden','bottom',0,6),[]);
});

test('video Focus Text drafts do not mutate existing styles before Apply',()=>{
  const {initialVideoTextDraft,prepareVideoTextDraft,hasVideoTextContent}=load('src/editor/video/video-text-draft.ts');
  const existing={fontSize:54,italic:false,color:'#bb00cc',decoration:'banner'};
  const draft=initialVideoTextDraft('Hello',existing);
  draft.style.italic=true;
  assert.equal(existing.italic,false);
  assert.equal(prepareVideoTextDraft({text:'Hello',style:{fontSize:900,width:0,letterSpacing:500,decoration:'banner'}}).style.fontSize,500);
  assert.equal(prepareVideoTextDraft({text:'Hello',style:{fontSize:900,width:0,letterSpacing:500,decoration:'banner'}}).style.width,.1);
  assert.equal(hasVideoTextContent('  '),false);
  assert.equal(hasVideoTextContent('New title'),true);
});

test('video transform fields are replaced by keyframe-aware X/Y sliders',()=>{
  const controls=read('src/components/VideoTransformControls.tsx');
  const slider=read('src/components/VideoPositionSliders.tsx');
  assert.match(controls,/VideoPositionSliders/);
  assert.match(slider,/type="range"/);
  assert.match(slider,/onPointerUp=\{onCommit\}/);
  assert.match(slider,/VideoKeyButtons/);
  assert.doesNotMatch(controls,/type="number"[^>]+aria-label=\{`Position/);
});

test('monitor double-click exposes existing clip transform overlay and opens video text editor',()=>{
  const workspace=read('src/components/VideoWorkspace.tsx');
  assert.match(workspace,/onDoubleClick=\{event=>\{/);
  assert.match(workspace,/setTransformClip\(candidate.id\)/);
  assert.match(workspace,/VideoFocusTextEditor/);
  assert.match(workspace,/onApply=\{applyTitle\}/);
  assert.match(workspace,/updateClip\(\{title:next,textStyle:style\}\)/);
  assert.doesNotMatch(workspace,/className="hv-canvas-text-edit"/);
});

test('box select is visible on the timeline toolbar and its rectangle uses direct DOM updates',()=>{
  const workspace=read('src/components/VideoWorkspace.tsx');
  assert.match(workspace,/aria-label="Box select clips"/);
  assert.match(workspace,/className="hv-selection-marquee"/);
  assert.match(workspace,/marquee\.style\.left=/);
  assert.match(workspace,/if\(complete\)setSelection\(ids\)/);
  assert.match(workspace,/clipsInBox\(/);
});

test('new TypeScript and TSX sources are syntax-valid',()=>{
  const files=['src/editor/video/box-selection.ts','src/editor/video/video-text-draft.ts',
    'src/components/VideoPositionSliders.tsx','src/components/VideoFocusTextEditor.tsx',
    'src/components/VideoTransformControls.tsx','src/components/VideoWorkspace.tsx'];
  for(const filename of files){
    const source=ts.createSourceFile(filename,read(filename),ts.ScriptTarget.ESNext,true,filename.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    assert.equal(source.parseDiagnostics.length,0,`${filename}: ${source.parseDiagnostics.map(d=>d.messageText).join(', ')}`);
  }
});

test('timeline visual header aligns with shared navigation coordinate system',()=>{
  const nav=read('src/components/useTimelineNavigation.ts');
  const css=read('src/components/VideoStudioDesign.css');
  assert.match(nav,/TRACK_HEADER_WIDTH\s*=\s*200/);
  assert.match(css,/\.app\.is-video-studio \.hv-track-name\s*\{[^}]*200px/);
});
