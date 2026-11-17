const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const base=path.resolve(__dirname,'..');
const source=name=>fs.readFileSync(path.join(base,name),'utf8');

test('Video Editor uses native-only MP4 export, never the interactive WebView compositor',()=>{
  const dialog=source('src/components/VideoExportDialog.tsx');
  const exporter=source('src/editor/video/export-timeline.ts');
  const compiled=source('src/editor/video/native-timeline-export.ts');
  assert.doesNotMatch(dialog,/nativeDecode|native-experimental|WebView fallback/);
  assert.doesNotMatch(exporter,/TimelineCompositor|streamNativeVideo|native-experimental|decodeMode/);
  assert.match(exporter,/prepareNativeTimelinePlan/);
  assert.match(exporter,/return exportNativeTimeline/);
  assert.match(compiled,/media_export_native_timeline/);
  assert.match(compiled,/no WebView renderer or effect-dropping fallback is used/);
});

test('native timeline registration retains Media Foundation and explicit cancellation',()=>{
  const rust=source('src-tauri/src/media/native_timeline.rs');
  const win=source('src-tauri/src/media/windows_mf.rs');
  const registration=source('src-tauri/src/lib.rs');
  assert.match(registration,/media::native_timeline::media_export_native_timeline/);
  assert.match(registration,/media::native_timeline::media_cancel_native_timeline/);
  assert.match(rust,/NativeFrameReader::open/);
  assert.match(rust,/stream_export/);
  assert.match(rust,/sync_channel::<ExportPacket>\(3\)/);
  assert.match(win,/MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS/);
});

test('the Video Editor theme button opens Huelith existing global theme catalog',()=>{
  const app=source('src/App.tsx'),css=source('src/components/VideoElegance.css');
  assert.match(app,/aria-label="Choose Video Editor theme"/);
  assert.match(app,/setThemeAnchor\(themeAnchor\?null:event.currentTarget\)/);
  assert.match(app,/THEME_COLLECTIONS\.flatMap/);
  assert.match(app,/state\.setWorkspace\(id\)/);
  assert.match(css,/\.hv-studio-theme-button/);
});

test('video Focus Text animates entrance and exit, with reduced-motion and single-close protections',()=>{
  const modal=source('src/components/VideoFocusTextEditor.tsx');
  const styles=source('src/components/VideoFocusTextEditor.css');
  assert.match(modal,/requested\.current=true/);
  assert.match(modal,/setLeaving\(true\)/);
  assert.match(modal,/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(styles,/@keyframes hv-focus-enter/);
  assert.match(styles,/@keyframes hv-focus-card-enter/);
  assert.match(styles,/\.hv-focus-backdrop\.is-leaving/);
  assert.match(styles,/@media \(prefers-reduced-motion:reduce\)/);
});

test('actual export profiling retains verified render averages and p95, not fake FPS',()=>{
  const {createExportProgressTracker}=loadTypeScript(path.join(base,'src/editor/video/export-progress.ts'));
  let clock=0;const reports=[];
  const report=createExportProgressTracker(value=>reports.push(value),{now:()=>clock,intervalMs:80});
  report(0,100,{phase:'initializing'});
  for(let index=1;index<=100;index++){
    clock+=100;
    report(index,100,{phase:'rendering',sourceMs:130,compositeMs:40,renderMs:170,encodeMs:14,sourceBackend:'Native Windows Media Foundation'});
  }
  clock+=100;report(100,100,{phase:'verified'});
  assert.equal(reports.at(-1).fraction,1);
  assert.match(reports.at(-1).message,/render avg 170\.0 ms/);
  assert.match(reports.at(-1).message,/p95 170\.0 ms/);
  assert.match(reports.at(-1).message,/decode 130\.0 ms/);
});
