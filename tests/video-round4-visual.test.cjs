const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {Canvas}=require('skia-canvas');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(p,deps){
  const code=ts.transpileModule(read(p),{fileName:p,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('module','exports','require',code)(module,module.exports,name=>{
    if(!(name in deps))throw Error(`${p}: unexpected dependency ${name}`);
    return deps[name];
  });
  return module.exports;
}
const canvas=(w=32,h=18,color)=>{const c=new Canvas(w,h);if(color){const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,w,h);}return c;};
const sample=(canvas,x=16,y=9)=>[...canvas.getContext('2d').getImageData(x,y,1,1).data];
const clip=(id,trackId,assetId,start=0,duration=2,props={})=>({id,trackId,assetId,start,duration,sourceIn:0,
  opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0,...props});
const tracks=[{id:'overlay',kind:'video',muted:false},{id:'lower',kind:'video',muted:false}];
const timeline=(clips,customTracks=tracks)=>({assets:[{id:'red',kind:'image',name:'red',path:'red.png',duration:10},
  {id:'blue',kind:'image',name:'blue',path:'blue.png',duration:10}],tracks:customTracks,clips,background:'#000000'});
const tl={activeClips:(scene,time)=>scene.clips.filter(c=>c.start<=time&&time<c.start+c.duration),
  opacityAt:(c,time)=>time>=c.start&&time<c.start+c.duration?(c.opacity??1):0};
const placement=load('src/editor/video/transition-placement.ts',{'./timeline-grid':{frameTime:(x,fps)=>Math.round(x*fps)/fps}});
const contract=load('src/editor/video/preview-render-contract.ts',{'./timeline':tl});
function setup(options={}){
  const calls={effects:[],sources:[],transitions:[],history:[]};
  const effects=async(src,list,context)=>{
    calls.effects.push({kind:list[0]?.kind,history:!!context.previousFrame,stamp:context.timestamp});
    if(list.some(e=>e.kind==='video-temporal-echo')){
      const prior=await context.previousFrame?.(.25);
      if(prior)calls.history.push(sample(prior));
    }
    if(list.some(e=>e.kind==='brightness')||context.grade){
      const out=canvas(),ctx=out.getContext('2d');ctx.fillStyle='#00ff00';ctx.fillRect(0,0,32,18);return out;
    }
    return src;
  };
  const tr=async(from,to,p,transition)=>{
    calls.transitions.push({p,kind:transition.kind,preset:transition.preset});
    const out=canvas(),ctx=out.getContext('2d');ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=1-p;ctx.drawImage(from,0,0);ctx.globalAlpha=p;ctx.drawImage(to,0,0);return out;
  };
  const compositor=load('src/editor/video/preview-frame-compositor.ts',{
    './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    '../canvas-surface':{createSurface:()=>canvas()},'./timeline':tl,
    './preview-render-contract':contract,
    './clip-layout':{clipCrop:()=>({x:0,y:0,width:1,height:1}),fittedSize:()=>({width:32,height:18}),
      maskCoverage:()=>canvas(32,18,'#ffffff')},
    './clip-timing':{sourceTimeAt:(c,t)=>c.sourceIn+t,playbackRateAt:()=>1},
    './motion':{transformAt:(c)=>({x:c.x,y:c.y,scale:c.scale,scaleY:c.scaleY??c.scale,rotation:c.rotation,opacity:c.opacity})},
    './process-effects':{processVideoEffects:effects},
    './graphics':{drawVideoShape:ctx=>{ctx.fillStyle='#ffff00';ctx.fillRect(-16,-9,32,18);}},
    './text-renderer':{drawVideoText:ctx=>{ctx.fillStyle='#ffff00';ctx.fillRect(-16,-9,32,18);}},
    './chroma-key':{keyRgba:()=>{}},
    './transition-placement':placement,
    './render-transition':{renderVideoTransition:tr},
    './smart-footage':{matteAt:()=>canvas(32,18,'white'),motionAt:()=>({x:.5,y:.5})},
  });
  const sources={pauseUnused:set=>{calls.active=[...set]},prepareUpcoming:()=>{},
    frame:async(asset,t,_playing,_signal,_rate,id)=>{
      calls.sources.push([asset.id,t,id]);return canvas(32,18,asset.id==='red'?'#ff0000':'#0000ff');
    }};
  return {compositor,calls,sources};
}
const plan=scene=>contract.createVideoRenderContract(scene,32,18,30,false,1920);

test('authored cut transition draws both clips even when neither is active for the full transition span',async()=>{
  const transition={version:1,kind:'effect',preset:'combo-dissolve',duration:.8,direction:'left',placement:'cut'};
  const scene=timeline([clip('from','lower','red',0,2),clip('to','lower','blue',2,2,{transitionIn:transition})]);
  const {compositor,calls,sources}=setup();
  const before=await compositor.renderBrowserPreviewFrame(plan(scene),1.8,sources);
  const after=await compositor.renderBrowserPreviewFrame(plan(scene),2.2,sources);
  assert.ok(sample(before)[0]>sample(before)[2],`before cut: ${sample(before)}`);
  assert.ok(sample(after)[2]>sample(after)[0],`after cut: ${sample(after)}`);
  assert.equal(calls.transitions.length,2);
  assert.equal(new Set(calls.sources.map(c=>c[2])).size,2);
});

test('fade-in and fade-out authored transitions apply at their correct edges',async()=>{
  const fadeIn={version:1,kind:'cross-dissolve',duration:.5,direction:'left',placement:'start'};
  const fadeOut={version:1,kind:'cross-dissolve',duration:.5,direction:'left',placement:'end'};
  const scene=timeline([clip('base','lower','red',1,2,{transitionIn:fadeIn,transitionOut:fadeOut})]);
  const {compositor,calls,sources}=setup();
  const enter=await compositor.renderBrowserPreviewFrame(plan(scene),1.25,sources);
  const exit=await compositor.renderBrowserPreviewFrame(plan(scene),2.75,sources);
  assert.ok(sample(enter)[0]>65&&sample(enter)[0]<190,`fade in ${sample(enter)}`);
  assert.ok(sample(exit)[0]>65&&sample(exit)[0]<190,`fade out ${sample(exit)}`);
  assert.equal(calls.transitions.length,2);
});

test('temporal operations receive real earlier fitted source frames, not a black placeholder',async()=>{
  const scene=timeline([clip('echo','lower','red',0,2,{effects:[{id:'e',version:1,kind:'video-temporal-echo',enabled:true,amount:50}]})]);
  const {compositor,calls,sources}=setup();
  await compositor.renderBrowserPreviewFrame(plan(scene),.75,sources);
  assert.deepEqual(calls.history[0],[255,0,0,255]);
  assert.ok(calls.sources.some(x=>x[1]===.5&&x[2]==='echo:history'));
  assert.ok(calls.active.includes('echo:history'));
});

test('compound scene renders its child tracks and maps the parent source clock',async()=>{
  const inner={tracks:[{id:'inside',kind:'video',muted:false}],clips:[clip('child','inside','blue',0,2)]};
  const scene=timeline([clip('parent','lower',undefined,1,2,{title:'Compound',sourceIn:0,compound:inner})]);
  const {compositor,calls,sources}=setup();
  const out=await compositor.renderBrowserPreviewFrame(plan(scene),1.5,sources);
  assert.deepEqual(sample(out),[0,0,255,255]);
  assert.ok(calls.sources.some(([id,t,identity])=>id==='blue'&&t===.5&&identity==='parent/child'));
});

test('adjustments modify lower layers without altering independently authored upper overlays',async()=>{
  const custom=[{id:'top',kind:'title',muted:false},{id:'adjust',kind:'video',muted:false},{id:'lower',kind:'video',muted:false}];
  const scene=timeline([clip('bottom','lower','red'),clip('fx','adjust',undefined,0,2,{adjustment:true,effects:[{id:'e',kind:'brightness',enabled:true}]}),
    clip('headline','top',undefined,0,2,{title:'Hi'})],custom);
  const {compositor,sources}=setup();
  const out=await compositor.renderBrowserPreviewFrame(plan(scene),.5,sources);
  assert.deepEqual(sample(out),[255,255,0,255]);
  const withoutTop={...scene,clips:scene.clips.filter(c=>c.id!=='headline')};
  assert.deepEqual(sample(await compositor.renderBrowserPreviewFrame(plan(withoutTop),.5,sources)),[0,255,0,255]);
});

test('round4 compatibility export accepts authored transitions, temporal effects, compounds and adjustments',()=>{
  const src=read('src/editor/video/hybrid-timeline-export.ts');
  const known=new Map([['video-temporal-echo',{}],['brightness',{}]]);
  const api=load('src/editor/video/hybrid-timeline-export.ts',{
  './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
      './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    './effects/catalog':{VIDEO_EFFECT_LOOKUP:known},'./filters':{VIDEO_FILTER_LOOKUP:new Map()},
    './transition-recipes':{AUTHORED_TRANSITION_LOOKUP:new Map([['combo-dissolve',{}]])},
    './transitions':{TRANSITION_LOOKUP:new Map()},
    './transition-placement':{authoredTransitions:placement.authoredTransitions},
    './native-timeline-export':{collectNativeRenderIssues:()=>[{clipLabel:'x',operation:'effect'}]},
    './native-media':{streamNativeVideo:async()=>({})},
    './preview-media-sources':{PreviewMediaSources:class{}},
    './preview-render-contract':contract,'./preview-frame-compositor':{renderBrowserPreviewFrame:async()=>canvas()},
  });
  const inner={tracks:[{id:'inside',kind:'video',muted:false}],clips:[clip('child','inside','blue')]};
  const transition={version:1,kind:'effect',preset:'combo-dissolve',duration:.5,placement:'start'};
  const scene=timeline([clip('main','lower','red',0,2,{effects:[{kind:'video-temporal-echo',enabled:true}],transitionIn:transition}),
    clip('compound','lower',undefined,0,2,{title:'Compound',compound:inner}),
    clip('adjust','overlay',undefined,0,2,{adjustment:true,effects:[{kind:'brightness',enabled:true}]})]);
  const choice=api.selectVideoExportBackend(scene,{start:0,end:2});
  assert.equal(choice.backend,'browser-frames');
  assert.deepEqual(api.browserFrameExportIssues(scene,{start:0,end:2}),[]);
  const unknown={...scene,clips:[clip('bad','lower','red',0,2,{transitionIn:{...transition,preset:'missing'}})]};
  assert.match(api.browserFrameExportIssues(unknown,{start:0,end:2}).join(),/unknown transition preset/);
  assert.ok(!src.includes("fail('authored video transitions (Round 4)')"));
});

test('AudioContext timestamp narrowing guards optional values in strict TypeScript',()=>{
  const source=read('src/components/VideoAudioPreview.tsx');
  assert.match(source,/typeof contextTime==='number'/);
  assert.match(source,/typeof performanceTime==='number'/);
  assert.doesNotMatch(source,/stamp\.contextTime\+\(performance\.now\(\)-stamp\.performanceTime\)/);
});

test('source pool reserves every visible decoder before compositing a 15-layer frame',async()=>{
  const {compositor,sources}=setup();
  const scene=timeline(Array.from({length:15},(_,n)=>clip(`layer-${n}`,'lower','red')));
  let firstLoad=false;
  const originally=sources.frame;
  sources.frame=async(...args)=>{
    if(!firstLoad){
      firstLoad=true;
      assert.equal(sources.reserved.size,15);
    }
    return originally(...args);
  };
  const originallyPaused=sources.pauseUnused;
  sources.pauseUnused=set=>{sources.reserved=set;originallyPaused(set);};
  const output=await compositor.renderBrowserPreviewFrame(plan(scene),1,sources);
  assert.deepEqual(sample(output),[255,0,0,255]);
});

test('an isolated authored transition is rejected if its centered cut has no preceding clip',()=>{
  const api=load('src/editor/video/hybrid-timeline-export.ts',{
  './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
      './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    './effects/catalog':{VIDEO_EFFECT_LOOKUP:new Map()},'./filters':{VIDEO_FILTER_LOOKUP:new Map()},
    './transition-recipes':{AUTHORED_TRANSITION_LOOKUP:new Map([['combo-dissolve',{}]])},
    './transitions':{TRANSITION_LOOKUP:new Map()},
    './transition-placement':placement,
    './native-timeline-export':{collectNativeRenderIssues:()=>[]},
    './native-media':{streamNativeVideo:async()=>({})},
    './preview-media-sources':{PreviewMediaSources:class{}},
    './preview-render-contract':contract,'./preview-frame-compositor':{renderBrowserPreviewFrame:async()=>canvas()},
  });
  const scene=timeline([clip('orphan','lower','red',2,2,{transitionIn:{version:1,kind:'effect',
    preset:'combo-dissolve',duration:.5,direction:'left',placement:'cut'}})]);
  assert.throws(()=>api.selectVideoExportBackend(scene,{start:0,end:4},30),/no adjacent outgoing clip/);
});

test('overlapping transitions are detected before encoding, avoiding partially rendered output',()=>{
  const api=load('src/editor/video/hybrid-timeline-export.ts',{
  './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
      './export-frame-reuse':{createExportFrameReuse:()=>()=>false},
  './export-static-scene':{canReuseStaticProcessedClip:()=>false,ProcessedLayerCache:class{hits=0;get(){return undefined;}remember(){}clear(){}}},
    './effects/catalog':{VIDEO_EFFECT_LOOKUP:new Map()},'./filters':{VIDEO_FILTER_LOOKUP:new Map()},
    './transition-recipes':{AUTHORED_TRANSITION_LOOKUP:new Map([['combo-dissolve',{}]])},
    './transitions':{TRANSITION_LOOKUP:new Map()},
    './transition-placement':placement,
    './native-timeline-export':{collectNativeRenderIssues:()=>[{clipLabel:'x',operation:'effect'}]},
    './native-media':{streamNativeVideo:async()=>{throw Error('should not encode');}},
    './preview-media-sources':{PreviewMediaSources:class{}},
    './preview-render-contract':contract,'./preview-frame-compositor':{renderBrowserPreviewFrame:async()=>canvas()},
  });
  const outgoing={version:1,kind:'cross-dissolve',duration:.7,direction:'left',placement:'end'};
  const incoming={version:1,kind:'effect',preset:'combo-dissolve',duration:.8,direction:'left',placement:'cut'};
  const scene=timeline([clip('from','lower','red',0,2,{transitionOut:outgoing}),
    clip('to','lower','blue',2,2,{transitionIn:incoming})]);
  assert.match(api.browserFrameExportIssues(scene,{start:0,end:4},30).join(),/overlapping transitions/);
});

test('the real authored transition renderer blends frames and honors completion bounds',async()=>{
  const cross=load('src/editor/video/effects/cross-dissolve.ts',{'../../canvas-surface':{createSurface:()=>canvas()}});
  const recipes=load('src/editor/video/transition-recipes.ts',{});
  const authored=load('src/editor/video/render-authored-transition.ts',{
    '../canvas-surface':{createSurface:()=>canvas()},
    './effects/catalog':{createVideoEffect:kind=>({kind,version:1,id:'test',enabled:true,amount:0})},
    './effects/cross-dissolve':cross,
  });
  const ordinary=load('src/editor/video/render-transition.ts',{
    './effects/cross-dissolve':cross,
    './effects/slide':{slideTransition:(a,b)=>b},'./effects/wipe':{wipeTransition:(a,b)=>b},
    './process-effects':{processVideoEffects:async src=>src},
    './transitions':{transitionStack:()=>[]},
    './transition-recipes':recipes,
    './render-authored-transition':authored,
  });
  const from=canvas(32,18,'#ff0000'),to=canvas(32,18,'#0000ff');
  const transition={version:1,kind:'effect',preset:'combo-dissolve',duration:.6,direction:'left'};
  assert.equal(await ordinary.renderVideoTransition(from,to,0,transition,{timestamp:0,sourceTime:0,frameIndex:0,fps:30}),from);
  assert.equal(await ordinary.renderVideoTransition(from,to,1,transition,{timestamp:1,sourceTime:1,frameIndex:30,fps:30}),to);
  const middle=await ordinary.renderVideoTransition(from,to,.5,transition,{timestamp:.5,sourceTime:.5,frameIndex:15,fps:30},
    async src=>src);
  assert.ok(sample(middle)[0]>20&&sample(middle)[2]>20,`mid-transition pixel ${sample(middle)}`);
});
