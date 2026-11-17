const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const p='src/editor/video/export-display.ts';
const compiled=ts.transpileModule(read(p),{fileName:p,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};new Function('module','exports','require',compiled)(m,m.exports,()=>{throw Error('unexpected import')});
const {readRenderInsights}=m.exports;
test('export diagnostics reads real acknowledged frame progress and ETA without assuming 60fps',()=>{
 const info=readRenderInsights('Rendering + encoding · 286 / 80,371 frames · 9.8 fps · raw 80.9 MB/s · render 87 ms / encode 95 ms · ~2h 16m left');
 assert.deepEqual(info,{stage:'rendering',label:'Rendering your video',fps:9.8,eta:'2h 16m',completed:286,total:80371,renderMs:87,encodeMs:95});
});
test('diagnostics show native job phases without inventing FPS',()=>{
 for(const [message,expected] of [['Loading source footage and composing first frame','preparing'],
  ['Starting Windows Media Foundation encoder','initializing'],['Finalizing MP4 container','finalizing'],
  ['Verifying exported video','verifying'],['Export verified','complete']]){
   const info=readRenderInsights(message);
   assert.equal(info.stage,expected);assert.equal(info.fps,null);
 }
 assert.equal(readRenderInsights('unknown','complete').stage,'complete');
});
test('export overlay uses Motion without touching the encoded-frame preview or starting a second decoder',()=>{
 const ui=read('src/components/VideoEditorExportOverlay.tsx');
 assert.match(ui,/from 'motion\/react'/);
 assert.match(ui,/reducedMotion/);
 assert.match(ui,/readRenderInsights/);
 assert.match(ui,/Technical diagnostics/);
 assert.match(ui,/OUTPUT SPEED/);
 assert.match(ui,/job\?\.previewDataUrl/);
 assert.match(ui,/duration\*insights\.completed\/insights\.total/);
 assert.doesNotMatch(ui,/<VideoPreviewCanvas|createElement\(['"]video/);
 const css=read('src/components/VideoRound7Polish.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.hv-export-insights/);
});
test('workspace inspector animates navigation but does not animate video canvas or clip pixels',()=>{
 const ui=read('src/components/VideoWorkspace.tsx');
 assert.match(ui,/useReducedMotion/);
 assert.match(ui,/motion\.div className="hv-inspector-scroll"/);
 assert.match(ui,/prefersReducedMotion\?0:\.2/);
 assert.match(ui,/<VideoPreviewCanvas/);
 const css=read('src/components/VideoRound7Workspace.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/var\(--accent\)/);
});
test('library tab changes animate only the scroll section and respect reduced motion',()=>{
 const ui=read('src/components/VideoLibraryPane.tsx');
 assert.match(ui,/const reducedMotion=useReducedMotion\(\)/);
 assert.match(ui,/<motion\.div key=\{tab\} className="hv-library-scroll"/);
 assert.match(ui,/transition=\{\{duration:reducedMotion\?0:\.2/);
});
test('Round 7 TSX and compositor parse as valid TypeScript',()=>{
 for(const p of ['src/components/VideoEditorExportOverlay.tsx','src/components/VideoWorkspace.tsx','src/components/VideoLibraryPane.tsx',
  'src/editor/video/preview-frame-compositor.ts','src/editor/video/export-display.ts']){
  const compiled=ts.transpileModule(read(p),{fileName:p,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}});
  const errors=(compiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.deepEqual(errors,[],p);
 }
});
