const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function loadNativePng(overrides={}){
  const saved=[],written=[],frames=[],bytes=Uint8Array.from([137,80,78,71,13,10,26,10]);
  const source=read('src/editor/video/frame-png.ts');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',compiled)((id)=>{
    if(id==='./native-frame-renderer')return {
      nativePreviewPlan:async(timeline,width,height,fps)=>({timeline,width,height,fps}),
      renderNativeTimelinePng:async(plan,time)=>{frames.push([plan,time]);if(overrides.fail)throw Error('Native reader failed');return bytes;},
    };
    if(id==='@tauri-apps/plugin-dialog')return {save:async options=>{saved.push(options);return overrides.cancel?null:'/test/frame.png';}};
    if(id==='@tauri-apps/plugin-fs')return {writeFile:async (path,bytes)=>written.push([path,bytes])};
    throw Error('Unexpected module '+id);
  },module,module.exports);
  return {api:module.exports,saved,written,frames,bytes};
}
const request=()=>({timeline:{tracks:[],assets:[],clips:[]},time:3.27,width:1920,height:1080,fps:30,projectName:'My Clip'});

test('PNG export invokes the native compositor at the exact output resolution and time',async()=>{
  const ctx=loadNativePng();const bytes=await ctx.api.renderTimelinePng(request());
  assert.deepEqual(bytes,ctx.bytes);
  assert.equal(ctx.frames[0][0].width,1920);assert.equal(ctx.frames[0][0].height,1080);
  assert.equal(ctx.frames[0][1],3.2666666666666666);
});
test('saving a frame writes native PNG bytes once',async()=>{
  const ctx=loadNativePng();assert.equal(await ctx.api.saveTimelineFramePng(request(),true),'/test/frame.png');
  assert.equal(ctx.written.length,1);assert.deepEqual(ctx.written[0][1],ctx.bytes);
});
test('cancelling the native PNG save does not render',async()=>{
  const ctx=loadNativePng({cancel:true});assert.equal(await ctx.api.saveTimelineFramePng(request(),true),null);
  assert.equal(ctx.frames.length,0);
});
test('native PNG decoder failure is not disguised by a browser fallback',async()=>{
  const ctx=loadNativePng({fail:true});await assert.rejects(ctx.api.renderTimelinePng(request()),/Native reader failed/);
});
test('PNG naming sanitizes Windows path characters and validates bounds',async()=>{
  const ctx=loadNativePng();assert.equal(ctx.api.framePngFilename('Huelith: A/B?',3.27,30),'Huelith_ A_B_-frame-00-00-03-267.png');
  await assert.rejects(ctx.api.renderTimelinePng({...request(),width:0}),/must be positive/);
});

test('Video Editor uses the selected Huelith theme instead of forcing Studio dark', () => {
  const app = read('src/App.tsx');
  assert.doesNotMatch(app,/is-video-studio theme-studio tone-dark/);
  assert.match(app,/is-video-studio .*theme-\$\{state\.workspace\} tone-\$\{state\.appearanceMode\}/);
  assert.match(app,/<ThemeProvider theme=\{theme\}>/);
  const workspace = read('src/components/VideoWorkspace.tsx');
  assert.match(workspace, /<VideoMonitorActions/);
  assert.match(read('src/components/VideoMonitorActions.tsx'), /className="hv-velocity-icon-button hv-save-frame"/);
  assert.match(workspace, /saveTimelineFramePng\(/);
  const css = read('src/components/VideoElegance.css');
  assert.match(css,/--hv-e-selected: color-mix\(in srgb, var\(--accent\)/);
  assert.doesNotMatch(css,/\.theme-(?:peach|strawberry|melon|sakura|shadow)\b/);
});

test('side-panel keyboard resizing uses visible width, not an outdated stored default', () => {
  const source = read('src/components/VideoPaneSplitter.tsx');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS
  }}).outputText;
  const mod = { exports: {} };
  new Function('module','exports','require',compiled)(mod,mod.exports,id => {
    if(id==='react')return {useRef: value=>({current:value})};
    if(id==='react/jsx-runtime')return {jsx:(component, props)=>({component,props})};
    throw Error('Unexpected dependency '+id);
  });
  const calls=[];
  const library={getBoundingClientRect:()=>({width:680})};
  const inspector={getBoundingClientRect:()=>({width:480})};
  const workspace={current:{
    getBoundingClientRect:()=>({width:1600}),
    querySelector: selector => selector === '.hv-library' ? library : inspector,
  }};
  const pane=mod.exports.default({side:'library',swapped:false,workspace,
    layout:{library:230,inspector:240,timeline:292,swap:false},
    onCommit:(side,width)=>calls.push([side,width])});
  pane.props.onKeyDown({key:'ArrowRight',preventDefault(){},stopPropagation(){}});
  assert.deepEqual(calls,[['library',696]]);
  assert.equal(pane.props['aria-valuenow'],680);
});

test('side-panel resizing respects swapped placement and expanded inspector width limits', () => {
  const splitter=read('src/components/VideoPaneSplitter.tsx');
  const prefs=read('src/editor/video/workspace-preferences.ts');
  const settings=read('src/components/VideoWorkspacePreferences.tsx');
  assert.match(splitter,/side === 'library'\) !== swapped/);
  assert.match(splitter,/inspector:\[180,600\]/);
  assert.match(prefs,/inspector:bounded\(value\?\.inspector,240,180,600\)/);
  assert.match(settings,/'Inspector width',180,600/);
});
