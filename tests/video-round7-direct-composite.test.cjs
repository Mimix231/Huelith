const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {Canvas}=require('skia-canvas');
const root=path.resolve(__dirname,'..');
function load(file,deps){
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('module','exports','require',code)(module,module.exports,name=>{
    if(!(name in deps))throw Error(`Unexpected import ${name} in ${file}`);
    return deps[name];
  });return module.exports;
}
const w=64,h=36;
const surface=()=>new Canvas(w,h);
const pattern=()=>{
  const c=new Canvas(64,36),x=c.getContext('2d');
  x.fillStyle='#1234ab';x.fillRect(0,0,64,36);
  x.fillStyle='#ef9c24';x.fillRect(5,3,33,49);
  x.fillStyle='#47c1e4';x.fillRect(35,11,45,29);
  x.clearRect(39,16,9,12);
  return c;
};
const source=pattern();
const asset={id:'footage',kind:'video',path:'footage.mp4',name:'Footage',width:w,height:h};
const base={id:'clip',assetId:'footage',trackId:'video',start:0,duration:2,sourceIn:0,opacity:1,
  x:0,y:0,scale:1,rotation:0,fit:'fit',fadeIn:0,fadeOut:0};
const track={id:'video',kind:'video',muted:false};
const controls={
  './timeline':{activeClips:(scene,t)=>scene.clips.filter(c=>c.start<=t&&t<c.start+c.duration),opacityAt:c=>c.opacity??1},
  './preview-render-contract':{createVideoRenderContract:()=>({}),visibleVideoOperations:(c,t)=>c.timeline.clips.filter(x=>x.start<=t&&t<x.start+x.duration).map((clip)=>({clip,trackIndex:0}))},
  './clip-layout':{
    clipCrop:(_asset,c)=>c.crop??{x:0,y:0,width:1,height:1},
    fittedSize:(sw,sh,dw,dh,fit)=>{if(fit==='stretch')return {width:dw,height:dh};
      const scale=fit==='fill'?Math.max(dw/sw,dh/sh):Math.min(dw/sw,dh/sh);
      return {width:sw*scale,height:sh*scale};},maskCoverage:surface,
  },
  './clip-timing':{sourceTimeAt:(c,t)=>(c.sourceIn??0)+t,playbackRateAt:()=>1},
  './motion':{transformAt:c=>({x:c.x??0,y:c.y??0,scale:c.scale??1,scaleY:c.scaleY??c.scale??1,rotation:c.rotation??0})},
  './process-effects':{processVideoEffects:async c=>c},
  './graphics':{drawVideoShape:()=>{}},
  './text-renderer':{drawVideoText:()=>{}},
  './chroma-key':{keyRgba:()=>{}},
  './transition-placement':{authoredTransitions:()=>[]},
  './render-transition':{renderVideoTransition:async a=>a},
  './smart-footage':{matteAt:()=>surface(),motionAt:()=>({x:0,y:0})},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false},
  '../canvas-surface':{createSurface:surface},
};
const compositor=load('src/editor/video/preview-frame-compositor.ts',controls);
const sources={frame:async()=>source,pauseUnused:()=>{}};
const render=async c=>compositor.renderBrowserPreviewFrame({version:1,width:w,height:h,designWidth:1920,fps:30,
  transparent:false,timeline:{assets:[asset],tracks:[track],clips:[c],background:'#08111c'}},.5,sources);
function assertNearPixels(a,b,max=1){
  const pixelsA=a.getContext('2d').getImageData(0,0,w,h).data;
  const pixelsB=b.getContext('2d').getImageData(0,0,w,h).data;
  assert.equal(pixelsA.length,pixelsB.length);
  let errors=0,maxDelta=0;
  for(let i=0;i<pixelsA.length;i++){
    const delta=Math.abs(pixelsA[i]-pixelsB[i]);maxDelta=Math.max(maxDelta,delta);
    if(delta>max)errors++;
  }
  assert.equal(errors,0,`${errors} byte mismatches; max delta ${maxDelta}`);
}
test('direct path requires exact, opaque native resolution; complex edits retain the reference compositor',()=>{
  const can=(clip,assetArg=asset,kind='video')=>compositor.canDirectCompositeClip(clip,assetArg,kind,w,h,1);
  assert.equal(can(base),true);
  assert.equal(can(base,{...asset,kind:'image'}),true);
  assert.equal(can(base,{...asset,width:1280}),false);
  assert.equal(can(base,asset,'title'),false);
  for(const fragment of [{grade:{}},{effects:[{enabled:false,kind:'brightness'}]},{mask:{}},{smart:{}},
    {chromaKey:{}},{shape:{}},{compound:{}},{adjustment:true},{x:.01},{rotation:30},
    {scale:1.01},{opacity:.5},{crop:{x:.1,y:0,width:.8,height:1}},{fadeIn:.5}]){
    assert.equal(can({...base,...fragment}),false,JSON.stringify(fragment));
  }
});
test('native-sized untouched footage produces the same pixels as the two-canvas reference path',async()=>{
  const fast=await render(base);
  const original=await render({...base,effects:[{id:'disabled',kind:'brightness',enabled:false}]});
  assertNearPixels(fast,original,0);
});
test('transforms, crop and opacity use the accurate reference path with no changed image',async()=>{
  for(const fragment of [{scale:1.3,rotation:30},{opacity:.5},{fit:'fill',crop:{x:.1,y:.1,width:.75,height:.7}}]){
    const modified={...base,...fragment};
    assertNearPixels(await render(modified),await render({...modified,effects:[{id:'disabled',enabled:false}]}),0);
  }
});
