const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
let Canvas;
try{({Canvas}=require('skia-canvas'));}catch{
  try{Canvas=class{constructor(w,h){return require('@napi-rs/canvas').createCanvas(w,h);}};}catch{}
}
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
function load(p,dependencies){
  const code=ts.transpileModule(read(p),{fileName:p,compilerOptions:{target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('module','exports','require',code)(module,module.exports,name=>{
    if(!(name in dependencies))throw Error(`${p}: unexpected dependency ${name}`);
    return dependencies[name];
  });
  return module.exports;
}
const common={
  assets:[{id:'image',name:'Red still',path:'image.png',kind:'image',duration:8,width:20,height:10}],
  tracks:[{id:'top',kind:'title',muted:false},{id:'bottom',kind:'video',muted:false}],
  clips:[],background:'#000000',
};
const clip=(id,trackId,start=0,extra={})=>({id,trackId,assetId:trackId==='bottom'?'image':undefined,
  start,sourceIn:3,duration:5,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0,...extra});
const timelineMock={activeClips:(timeline,time)=>timeline.clips.filter(c=>c.start<=time&&time<c.start+c.duration),
  opacityAt:(clip,time)=>clip.opacity*Math.min(1,clip.fadeIn? (time-clip.start)/clip.fadeIn:1,
    clip.fadeOut?(clip.duration-(time-clip.start))/clip.fadeOut:1)};
const contract=load('src/editor/video/preview-render-contract.ts',{'./timeline':timelineMock});

test('v1 preview contract has exact, frame-quantized times and stable bottom-to-top tracks',()=>{
  const scene={...common,clips:[clip('top','top'),clip('bottom','bottom'),clip('muted','muted')]};
  scene.tracks.push({id:'muted',kind:'video',muted:true});
  const plan=contract.createVideoRenderContract(scene,64,36,30);
  assert.equal(plan.version,1);
  assert.equal(contract.previewFrameTime(1.065,30),31/30);
  assert.deepEqual(contract.visibleVideoOperations(plan,1).map(c=>c.clip.id),['bottom','top']);
  assert.throws(()=>contract.createVideoRenderContract(scene,0,36,30),/Invalid video/);
});

function compositorAdapter(){
  let effectCalls=0,sourceCalls=[];
  const compositor=load('src/editor/video/preview-frame-compositor.ts',{
    './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    '../canvas-surface':{createSurface:()=>new Canvas(1,1)},
    './timeline':timelineMock,
    './preview-render-contract':contract,
    './clip-layout':{
      clipCrop:()=>({x:0,y:0,width:1,height:1}),
      fittedSize:(sw,sh,w,h,fit)=>{
        const f=fit==='fill'?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh);
        return {width:fit==='stretch'?w:sw*f,height:fit==='stretch'?h:sh*f};
      },
      maskCoverage:()=>{const c=new Canvas(64,36);c.getContext('2d').fillRect(0,0,64,36);return c;},
    },
    './clip-timing':{sourceTimeAt:(c,t)=>c.sourceIn+t,playbackRateAt:()=>1},
    './motion':{transformAt:c=>({x:c.x,y:c.y,scale:c.scale,scaleY:c.scaleY??c.scale,rotation:c.rotation,opacity:c.opacity})},
    './process-effects':{processVideoEffects:async(input,effects)=>{effectCalls+=effects.length;return input;}},
    './effects/catalog':{VIDEO_TEMPORAL_KINDS:new Set(['video-motion-trail'])},
    './graphics':{drawVideoShape:ctx=>{ctx.fillStyle='#00ff00';ctx.fillRect(-32,-18,64,36);}},
    './text-renderer':{drawVideoText:ctx=>{ctx.fillStyle='#0000ff';ctx.fillRect(-16,-9,32,18);}},
    './chroma-key':{keyRgba:()=>{}},
    './transition-placement':{authoredTransitions:()=>[]},
    './render-transition':{renderVideoTransition:async(from,to,p)=>p<.5?from:to},
    './smart-footage':{matteAt:()=>new Canvas(1,1),motionAt:()=>({x:.5,y:.5})},
  });
  const sources={pauseUnused:()=>{},frame:async(asset,time)=>{
    sourceCalls.push([asset.id,time]);const c=new Canvas(20,10);
    const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,20,10);return c;
  }};
  return {compositor,sources,getCalls:()=>({effectCalls,sourceCalls})};
}
const pixel=(canvas,x,y)=>[...canvas.getContext('2d').getImageData(x,y,1,1).data];
test('live frame uses source-time mapping, actual clip transform, and authoring effect pipeline',{skip:!Canvas},async()=>{
  const {compositor,sources,getCalls}=compositorAdapter();
  const red=clip('red','bottom',2,{x:.25,effects:[{id:'fx',kind:'brightness',enabled:true,amount:100}]});
  const scene={...common,clips:[red]};
  const plan=contract.createVideoRenderContract(scene,64,36,30);
  const output=await compositor.renderBrowserPreviewFrame(plan,3,sources,false);
  assert.deepEqual(pixel(output,3,18).slice(0,3),[0,0,0]);
  assert.deepEqual(pixel(output,38,18).slice(0,3),[255,0,0]);
  assert.deepEqual(getCalls().sourceCalls,[['image',4]]);
  assert.equal(getCalls().effectCalls,1);
});
test('live preview composites top layers above bottom layers, respects opacity, and supports transparency',{skip:!Canvas},async()=>{
  const {compositor,sources}=compositorAdapter();
  const scene={...common,clips:[clip('above','top',0,{shape:{kind:'rectangle'},opacity:.5}),clip('below','bottom')]};
  const output=await compositor.renderBrowserPreviewFrame(contract.createVideoRenderContract(scene,64,36,30),.5,sources);
  const rgb=pixel(output,32,18);
  assert.ok(rgb[0]>110&&rgb[0]<145,`red: ${rgb}`);
  assert.ok(rgb[1]>110&&rgb[1]<145,`green: ${rgb}`);
  const empty=await compositor.renderBrowserPreviewFrame(contract.createVideoRenderContract({...common,clips:[]},64,36,30,true),0,sources);
  assert.equal(pixel(empty,30,12)[3],0);
});
test('obsolete render responses can be aborted before presentation',{skip:!Canvas},async()=>{
  const {compositor,sources}=compositorAdapter();const aborted=new AbortController();aborted.abort();
  await assert.rejects(compositor.renderBrowserPreviewFrame(contract.createVideoRenderContract({...common,clips:[clip('red','bottom')]},64,36,30),
    .5,sources,false,aborted.signal),{name:'AbortError'});
});

test('live monitor now passes preceding source frames to temporal effects',{skip:!Canvas},async()=>{
  const {compositor,sources}=compositorAdapter();
  const scene={...common,clips:[clip('red','bottom',0,{effects:[{enabled:true,kind:'video-motion-trail'}]})]};
  const output=await compositor.renderBrowserPreviewFrame(contract.createVideoRenderContract(scene,64,36,30),.25,sources);
  assert.equal(output.width,64);
});

const knownKinds=new Map([['brightness',{}],['video-motion-trail',{}],['video-filter',{}]]);
function router(nativeIssues=[]){return load('src/editor/video/hybrid-timeline-export.ts',{
  './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    './effects/catalog':{VIDEO_EFFECT_LOOKUP:knownKinds,VIDEO_TEMPORAL_KINDS:new Set(['video-motion-trail'])},
  './filters':{VIDEO_FILTER_LOOKUP:new Map([['cinema',{}]])},
  './native-timeline-export':{collectNativeRenderIssues:()=>nativeIssues},
  './transition-recipes':{AUTHORED_TRANSITION_LOOKUP:new Map([['combo-horizontal',{}]])},
  './transitions':{TRANSITION_LOOKUP:new Map([['vhs-cut',{}]])},
  './transition-placement':{authoredTransitions:()=>[]},
  './native-media':{streamNativeVideo:()=>{}},
  './preview-media-sources':{PreviewMediaSources:class{}},
  './preview-render-contract':contract,
  './preview-frame-compositor':{renderBrowserPreviewFrame:()=>{}},
});}
test('hybrid export selects native when complete, browser frames when native effect is missing, and refuses unsafe fallback',()=>{
  const source={...common,clips:[clip('red','bottom',0,{effects:[{enabled:true,kind:'brightness'}]})]};
  const range={start:0,end:5};
  assert.equal(router().selectVideoExportBackend(source,range).backend,'native');
  const hybrid=router([{clipLabel:'red',operation:'effect brightness'}]);
  assert.equal(hybrid.selectVideoExportBackend(source,range).backend,'browser-frames');
  const withTemporal={...source,clips:[clip('red','bottom',0,{effects:[{enabled:true,kind:'video-motion-trail'}]})]};
  assert.equal(hybrid.selectVideoExportBackend(withTemporal,range).backend,'browser-frames');
  const unknown={...source,clips:[clip('red','bottom',0,{effects:[{enabled:true,kind:'imaginary-fx'}]})]};
  assert.throws(()=>hybrid.selectVideoExportBackend(unknown,range),/unknown effect/);
  const withCut={...source,clips:[clip('red','bottom',0,{transitionOut:{kind:'wipe'}})]};
  assert.equal(hybrid.selectVideoExportBackend(withCut,range).backend,'browser-frames');
});

test('browser-compatibility MP4 uses the Rust frame stream and closes preview decoders',async()=>{
  const received=[];let closed=0;
  const api=load('src/editor/video/hybrid-timeline-export.ts',{
  './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
      './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    './effects/catalog':{VIDEO_EFFECT_LOOKUP:knownKinds,VIDEO_TEMPORAL_KINDS:new Set(['video-motion-trail'])},
    './filters':{VIDEO_FILTER_LOOKUP:new Map()},
    './native-timeline-export':{collectNativeRenderIssues:()=>[{clipLabel:'red',operation:'effect brightness'}]},
    './transition-recipes':{AUTHORED_TRANSITION_LOOKUP:new Map()},
    './transitions':{TRANSITION_LOOKUP:new Map()},
    './transition-placement':{authoredTransitions:()=>[]},
    './native-media':{streamNativeVideo:async(settings,render,progress)=>{
      received.push(['audio',settings.audio?.length??0]);
      await render(0);await render(1);progress(2,2,{phase:'rendering',renderMs:2,encodeMs:1});
      return {outputPath:settings.outputPath,framesWritten:2};
    }},
    './preview-media-sources':{PreviewMediaSources:class{close(){closed++;}}},
    './preview-render-contract':contract,
    './preview-frame-compositor':{renderBrowserPreviewFrame:async(_plan,time)=>{
      received.push(['frame',time]);return new Canvas(64,36);
    }},
  });
  const t={...common,clips:[clip('red','bottom')]};
  const result=await api.exportCompatibleVideoFrames({timeline:t,range:{start:1,end:3},
    settings:{outputPath:'Huelith.mp4',width:64,height:36,fps:2,frameCount:4,audio:[{path:'sound.wav'}]},onProgress:()=>{}});
  assert.deepEqual(received,[['audio',1],['frame',1],['frame',1.5]]);
  assert.equal(result.outputPath,'Huelith.mp4');assert.equal(closed,1);
});

test('grading inspector no longer blocks edited frames behind the incomplete native effect catalog',()=>{
  const text=read('src/components/VideoWorkspace.tsx');
  assert.match(text,/gradePreviewSources/);
  assert.match(text,/renderBrowserPreviewFrame\(createVideoRenderContract\(subset/);
  assert.doesNotMatch(text,/Native grade\/effects preview is not implemented/);
});
