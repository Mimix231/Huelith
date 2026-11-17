const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadTypeScript}=require('./helpers/load-typescript.cjs');
const root=path.resolve(__dirname,'..');
const {canReuseStaticProcessedClip}=loadTypeScript(path.join(root,'src/editor/video/export-static-scene.ts'));
const base={id:'clip',trackId:'video',assetId:'still',start:0,sourceIn:0,duration:10,
  volume:1,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0};
const timeline={assets:[{id:'still',kind:'image',path:'a.png',duration:10}],
  tracks:[{id:'video',kind:'video',name:'Video',muted:false,locked:false},
    {id:'titles',kind:'title',name:'Titles',muted:false,locked:false}],clips:[base]};
const reusable=(clip,changes={})=>canReuseStaticProcessedClip({...timeline,...changes},clip);

test('allow static still-image processing beneath moving video layers',()=>{
  assert.equal(reusable(base),true);
  assert.equal(reusable({...base,trackId:'titles',assetId:undefined,title:'Static heading'}),true);
});
test('never reuse processed source-video frames or animated images',()=>{
  assert.equal(reusable(base,{assets:[{...timeline.assets[0],kind:'video'}]}),false);
  assert.equal(reusable(base,{assets:[{...timeline.assets[0],animated:true}]}),false);
  assert.equal(reusable({...base,assetId:'missing'}),false);
  assert.equal(reusable({...base,trackId:'titles'},{assets:[{...timeline.assets[0],kind:'video'}]}),false);
});
test('protect dynamic transforms, captions, masks, grades and compound footage',()=>{
  for(const change of [
    {keyframes:[{time:0,x:0}]},{animation:{kind:'fade'}},
    {caption:{words:[{start:0,end:1,text:'x'}]}},
    {mask:{keys:{x:[{time:0,value:0}]}}},{mask:{featherKeys:[{time:0,value:0}]}},
    {grade:{keys:{exposure:[{time:0,value:0}]}}},{grade:{mask:{keys:{feather:[{time:0,value:0}]}}}},
    {grade:{basic:{grain:40}}},{sourceMap:[{time:0,source:0}]},
    {speedCurve:[{time:0,speed:1}]},{smart:{kind:'x'}},{compound:{clips:[]}},
    {adjustment:true},{textStyle:{reveal:'typewriter'}},
  ])assert.equal(reusable({...base,...change}),false,JSON.stringify(change));
});
test('protect temporal and time-varying video effects and parameter keyframes',()=>{
  for(const kind of ['video-temporal-echo','video-motion-trail','video-deflicker',
    'video-rolling-shutter','video-focus-rack','video-film-gate-weave',
    'video-whip-pan-smear','grain','noise','vhs','glitch']){
    assert.equal(reusable({...base,effects:[{kind,enabled:true,amount:100}]}),false,kind);
  }
  assert.equal(reusable({...base,effects:[{kind:'glow',enabled:true,amount:100,keyframes:[{time:0,amount:80}]}]}),false);
  assert.equal(reusable({...base,effects:[{kind:'glow',enabled:true,amount:100,mask:{keys:{feather:[{time:0,value:0}]}}}]}),false);
  assert.equal(reusable({...base,effects:[{kind:'glow',enabled:false,amount:100}]}),true);
  assert.equal(reusable({...base,mask:{keys:{x:[]}}}),true);
  assert.equal(reusable({...base,grade:{keys:{exposure:[]}}}),true);
  assert.equal(reusable({...base,effects:[{kind:'glow',enabled:true,amount:100,mask:{keys:{feather:[]}}}]}),true);
});
test('image data is copied onto a safe ArrayBuffer backed view before constructing ImageData',()=>{
  const text=fs.readFileSync(path.join(root,'src/components/CutoutWorkspace.tsx'),'utf8');
  assert.match(text,/new ImageData\(new Uint8ClampedArray\(matteToRgba\(alpha\)\),w,h\)/);
});
test('BiRefNet runtime config uses optional WASM backend and forbids remote model fallback',()=>{
  const text=fs.readFileSync(path.join(root,'src/editor/effects/birefnet-cutout.ts'),'utf8');
  assert.match(text,/const wasmBackend=env\.backends\.onnx\.wasm/);
  assert.match(text,/if\(wasmBackend\)/);
  assert.match(text,/allowRemoteModels=false/);
});
test('full model is sourced locally for installer preparation, never Lite',()=>{
  const text=fs.readFileSync(path.join(root,'scripts/prepare-birefnet.mjs'),'utf8');
  assert.match(text,/src-tauri\/resources\/models\/birefnet\/model\.onnx/);
  assert.match(text,/resolve\(root,'LICENSE\.txt'\)/);
  assert.match(text,/MODEL_BYTES=972_666_916/);
  assert.match(text,/MODEL_SHA256=/);
  assert.doesNotMatch(text,/BiRefNet[_-]Lite/);
});
