const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('throttled progress is based on acknowledged frames and shows real measurements',()=>{
  const {createExportProgressTracker}=loadTypeScript(path.join(root,'src/editor/video/export-progress.ts'));
  let elapsed=0;const events=[];
  const report=createExportProgressTracker(value=>events.push(value),{now:()=>elapsed,intervalMs:200});
  report(0,100,{phase:'initializing'});
  for(let frame=1;frame<=100;frame++){
    elapsed+=10;
    report(frame,100,{phase:'rendering',renderMs:7,encodeMs:3});
  }
  assert.ok(events.length<15,`Expected throttled progress, received ${events.length} React-facing events`);
  assert.match(events.at(-1).message,/100 \/ 100 frames/);
  assert.equal(events.at(-1).fraction,.995); // Container not yet finalized or verified.
  elapsed+=8;report(100,100,{phase:'verifying'});
  assert.match(events.at(-1).message,/Verifying/);
  elapsed+=8;report(100,100,{phase:'verified'});
  assert.equal(events.at(-1).fraction,1);
});

test('verification rejects a missing frame, wrong size, wrong fps, and truncated MP4',()=>{
  const {verifyEncodedVideo}=loadTypeScript(path.join(root,'src/editor/video/export-verification.ts'));
  const expected={width:1920,height:1080,fps:60,frameCount:600};
  const report={framesWritten:600,width:1920,height:1080,outputPath:'output.mp4'};
  const info={width:1920,height:1080,frameRateNumerator:60,frameRateDenominator:1,duration100ns:100_000_000};
  assert.doesNotThrow(()=>verifyEncodedVideo(expected,report,info));
  assert.throws(()=>verifyEncodedVideo(expected,{...report,framesWritten:598},info),/Incomplete/);
  assert.throws(()=>verifyEncodedVideo(expected,report,{...info,width:1280}),/dimensions/);
  assert.throws(()=>verifyEncodedVideo(expected,report,{...info,frameRateNumerator:24}),/frame rate/);
  assert.throws(()=>verifyEncodedVideo(expected,report,{...info,duration100ns:20_000_000}),/duration/);
});

test('preview has accessible icon buttons, below-button tooltips, theme-aware CSS and jobs',()=>{
  const component=read('src/components/VideoMonitorActions.tsx');
  const dialog=read('src/components/VideoEditorExportOverlay.tsx');
  const workspace=read('src/components/VideoWorkspace.tsx');
  const css=read('src/components/VideoVelocity.css');
  for(const label of ['Monitor settings','Save playhead frame as PNG','Toggle fullscreen preview'])assert.ok(component.includes(label));
  assert.match(component,/data-hint=/);
  assert.match(read('src/components/VideoStudioHints.tsx'),/rect.bottom\+7/);
  assert.match(workspace,/<VideoMonitorActions/);
  assert.match(workspace,/<VideoEditorExportOverlay open=\{exportOpen\}/);
  assert.match(dialog,/role="progressbar"/);
  assert.match(css,/var\(--accent-line\)/);
  assert.match(css,/\.hv-player-display\.hv-velocity-monitor-actions/);
});

test('live WebView preview reuses authored effects while final MP4 remains Rust-encoded',()=>{
  const preview=read('src/components/VideoPreviewCanvas.tsx');
  const exporter=read('src/editor/video/export-timeline.ts');
  assert.match(preview,/renderBrowserPreviewFrame/);
  assert.match(read('src/editor/video/preview-media-sources.ts'),/readNativeTimelineFrame/);
  assert.match(read('src/editor/video/hybrid-timeline-export.ts'),/streamNativeVideo/);
  assert.doesNotMatch(preview,/TimelineCompositor|VideoDecoderPool|document.createElement\(['"]video/);
  assert.match(exporter,/exportNativeTimeline/);
});
