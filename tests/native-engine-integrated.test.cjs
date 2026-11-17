const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.resolve(root,rel),'utf8');
test('capability inventory matches Rust and is not stale',()=>{
  const result=cp.spawnSync(process.execPath,['scripts/audit-native-renderer.mjs','--check'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(read('docs/native-video-effect-coverage.json'));
  assert.equal(report.catalogCount,report.supportedCount+report.missingCount);
  assert.ok(report.missing.includes('video-temporal-echo'));
  assert.ok(report.implemented.includes('outline'));
  assert.equal(report.gpuResident,false);
});
test('preview and export have the same versioned native graph contract',()=>{
  const source=read('src/editor/video/native-timeline-export.ts');
  const wrapper=read('src/editor/video/native-frame-renderer.ts');
  const backend=read('src-tauri/src/media/native_timeline.rs');
  assert.match(source,/NATIVE_GRAPH_VERSION=2/);
  assert.match(source,/graphVersion:NATIVE_GRAPH_VERSION/g);
  assert.match(wrapper,/graphVersion:NATIVE_GRAPH_VERSION/);
  assert.match(backend,/graph_version!=2/g);
  assert.doesNotMatch(wrapper,/new\s+HTMLVideoElement|TimelineCompositor|document\.createElement\([\'\"]video/);
});
test('native outline uses true-distance alpha field and validates style',()=>{
  const renderer=read('src-tauri/src/media/native_timeline.rs');
  const silhouette=read('src-tauri/src/media/native_timeline/silhouette_outline.rs');
  assert.match(renderer,/silhouette_outline::apply/);
  assert.match(silhouette,/fn squared_distance/);
  assert.match(silhouette,/fn edt_line/);
  assert.match(silhouette,/style!="classic"/);
  assert.match(silhouette,/outline_uses_alpha_not_full_frame/);
  assert.match(renderer,/if let \(Some\(original\),Some\(mask\)\)/);
});
test('updated source files parse as TypeScript without syntax errors',()=>{
  for(const file of ['src/editor/video/native-timeline-export.ts','src/editor/video/native-frame-renderer.ts','src/editor/video/native-capabilities.generated.ts']){
    const source=read(file);
    const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,strict:true}});
    const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.equal(errors.length,0,`${file}: ${errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; ')}`);
  }
});

test('native effects process decoded source dimensions, not output resolution',()=>{
  const rust=read('src-tauri/src/media/native_timeline.rs');
  assert.match(rust,/frame\.to_vec\(\);color_effects\(&mut pixels,width,height,clip,time-clip\.start\)/);
  assert.match(rust,/frame\.to_vec\(\);color_effects\(&mut rgba,width,height,clip,local_time\)/);
});
