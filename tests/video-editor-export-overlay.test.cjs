const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Video Editor opens one native export overlay, not the old floating error/status popup',()=>{
 const workspace=read('src/components/VideoWorkspace.tsx');
 assert.match(workspace,/import VideoEditorExportOverlay/);
 assert.match(workspace,/<VideoEditorExportOverlay open=\{exportOpen\}/);
 assert.doesNotMatch(workspace,/VideoExportActivity/);
 assert.equal(fs.existsSync(path.join(root,'src/components/VideoExportActivity.tsx')),false);
 const manifest=JSON.parse(read('scripts/obsolete-migration-files.json'));
 assert.ok(manifest.obsolete.includes('src/components/VideoExportActivity.tsx'));
});

test('five-step native export flow validates BEFORE Save As and only queues AFTER user chooses destination',()=>{
 const ui=read('src/components/VideoEditorExportOverlay.tsx');
 const preflight=ui.indexOf('selectVideoExportBackend(props.timeline'),choose=ui.indexOf('const outputPath=await save('),queued=ui.indexOf('const id=props.onQueue([settings])');
 assert.ok(preflight>0&&choose>preflight&&queued>choose);
 assert.match(ui,/if\(!outputPath\)\{setStage\('settings'\);return;\}/);
 assert.match(ui,/onCancel\(jobId\)/);
 assert.match(ui,/setStage\('settings'\)/);
 assert.match(ui,/stage==='complete'/);
 assert.match(ui,/video_open_delivery/);
 assert.match(ui,/job\?\.previewDataUrl/);
 assert.match(ui,/job\?\.message/);
 assert.doesNotMatch(ui,/<VideoPreviewCanvas/);
 assert.doesNotMatch(ui,/HTMLVideoElement|document\.createElement\(['"]video/);
});

test('shadow-only SVG valley art is isolated per state, vector-based, and valid XML',()=>{
 const folder='src/themes/shadow/video-export/';
 const names=['settings','rendering','complete'];
 const files=names.map(n=>read(folder+n+'.svg'));
 for(const file of files){
  assert.match(file,/<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(file,/<title id="title">/);
  assert.match(file,/url\(#moon\)|id="moon"/);
  assert.match(file,/<path/);
  assert.doesNotMatch(file,/<image\b|data:image\/|<foreignObject/);
 }
 assert.equal(new Set(files).size,3);
 const css=read('src/components/VideoEditorExportOverlay.css');
 for(const name of names)assert.match(css,new RegExp('\\.hv-export-theme-shadow \\.hv-export-art-'+name+'.*'+name+'\\.svg'));
});

test('source types and native job pipeline include audio preference and real output acknowledgement',()=>{
 const ui=read('src/components/VideoEditorExportOverlay.tsx');
 assert.match(ui,/includeAudio\}\;/);
 const delivery=read('src/editor/video/delivery.ts');
 const exporter=read('src/editor/video/export-timeline.ts');
 const plan=read('src/editor/video/native-timeline-export.ts');
 for(const code of [delivery,exporter,plan])assert.match(code,/includeAudio/);
 assert.match(plan,/exportNativeTimeline/);
 assert.match(ui,/fraction\*100/);
});

test('new TSX and modified exporter sources parse without diagnostic errors',()=>{
 for(const f of ['src/components/VideoEditorExportOverlay.tsx','src/components/VideoWorkspace.tsx',
   'src/editor/video/delivery.ts','src/editor/video/export-timeline.ts','src/editor/video/native-timeline-export.ts']){
  const source=read(f),result=ts.transpileModule(source,{fileName:f,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}});
  const fatal=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.deepEqual(fatal.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[],f);
 }
});
