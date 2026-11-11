/* Render catalog cards using production processors, never approximated CSS. */
const {createCanvas,loadImage}=require('./video-canvas-runtime.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../public/video-library');
const {VIDEO_EFFECT_CATALOG,VIDEO_TEMPORAL_KINDS,VIDEO_TIME_VARYING_KINDS,createFilterEffect}=require('../src/editor/video/effects/catalog.ts');
const {createLibraryVideoEffect,VIDEO_PREVIEW_ALPHA_KINDS,VIDEO_PREVIEW_BRIGHT_KINDS,VIDEO_EFFECT_DESIGN_WIDTH}=require('../src/editor/video/effect-previews.ts');
const {VIDEO_FILTERS}=require('../src/editor/video/filters/index.ts');
const {processVideoEffects}=require('../src/editor/video/process-effects.ts');
const {markImmutableEffectSource}=require('../src/editor/immutable-effect-sources.ts');
const {TEXT_TEMPLATES}=require('../src/editor/video/text-templates.ts');
const {drawVideoText}=require('../src/editor/video/text-renderer.ts');
const {TRANSITION_PRESETS,createEffectTransition}=require('../src/editor/video/transitions.ts');
const {renderVideoTransition}=require('../src/editor/video/render-transition.ts');
const {MOTION_PRESETS,motionKeys,transformAt}=require('../src/editor/video/motion.ts');
const {AUTHORED_TRANSITIONS}=require('../src/editor/video/transition-recipes.ts');
const {CLIP_ANIMATIONS,makeAnimationSpan}=require('../src/editor/video/clip-animation.ts');
const safe=id=>id.replace(/[^a-z0-9_-]/gi,'_');
const matte='#20212b';
const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function difference(a,b){
  let total=0,changed=0,alpha=0;
  for(let i=0;i<a.length;i+=4){
    const distance=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/3;
    total+=distance;changed+=distance>=3;alpha+=Math.abs(a[i+3]-b[i+3]);
  }
  return {rgb:+(total/(a.length/4)).toFixed(3),area:+(changed/(a.length/4)).toFixed(4),alpha:+(alpha/(a.length/4)).toFixed(3)};
}
function writeAsset(file,bytes){
  const target=path.join(root,file);
  if(fs.existsSync(target)&&fs.readFileSync(target).equals(bytes))return;
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,bytes);
}
async function main(){
  const base=await loadImage(path.join(root,'previews/night-run.png'));
  const cutout=await loadImage(path.join(root,'previews/night-run-cutout.png'));
  const w=288,h=162;
  const motionWidth=192,motionHeight=108,motionFps=10;
  function make(image,offset=0,width=w,height=h,exposure=1){
    const c=createCanvas(width,height),ctx=c.getContext('2d');
    if(exposure!==1)ctx.filter=`brightness(${exposure})`;
    const margin=Math.abs(offset);
    ctx.drawImage(image,offset-margin,0,width+margin*2,height);
    markImmutableEffectSource(c);
    return c;
  }
  const cardFrame=(frame,width=w,height=h,background=matte)=>{
    const c=createCanvas(width,height),ctx=c.getContext('2d');
    ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
    ctx.drawImage(frame,0,0,width,height);
    return c;
  };
  const blank=(width,height)=>createCanvas(width,height);
  const moving=(t,width=w,height=h)=>make(base,Math.sin(t*8)*width*.072,width,height,1+.23*Math.sin(t*13));
  const context=(t,width=w,height=h)=>({timestamp:t,sourceTime:t,frameIndex:Math.round(t*30),fps:30,
    previousFrame:async age=>moving(Math.max(0,t-age),width,height)});
  const bright=make(base,0,w,h,1.9),dark=make(base,0,w,h,.54),transparent=make(cutout);
  const opaque=make(base),basePixels=pixels(opaque);
  const alphaPixels=pixels(transparent);
  if(!alphaPixels.some((alpha,i)=>i%4===3&&alpha===0)||!alphaPixels.some((alpha,i)=>i%4===3&&alpha>=250))
    throw Error('The preview cutout needs real transparent and opaque regions.');
  const entries=[];
  const save=(kind,id,frame,info={})=>{
    const c=cardFrame(frame,w,h,kind==='transitions'?'#000000':matte);
    const bytes=c.toBuffer('image/webp',86),file=`thumbnails/${kind}/${safe(id)}.webp`;
    writeAsset(file,bytes);
    entries.push({kind,id,file,sha256:hash(bytes),...info});
  };
  async function saveMotion(kind,id,render){
    const frames=[];
    for(let i=0;i<=motionFps;i++){
      const c=cardFrame(await render(i/motionFps),motionWidth,motionHeight,kind==='transitions'?'#000000':matte);
      frames.push(Buffer.from(pixels(c)));
    }
    const encoded=spawnSync(process.env.HUELITH_FFMPEG||'ffmpeg',['-v','error','-f','rawvideo','-pix_fmt','rgba',
      '-s',`${motionWidth}x${motionHeight}`,'-r',String(motionFps),'-i','pipe:0','-an','-c:v','libwebp_anim',
      '-threads','1','-quality','76','-loop','0','-f','webp','pipe:1'],{input:Buffer.concat(frames),maxBuffer:4*1024*1024,windowsHide:true});
    if(encoded.status!==0)throw Error(`Could not encode ${kind}/${id}: ${encoded.error??encoded.stderr?.toString()}`);
    const motionFile=`thumbnails/animated/${kind}/${safe(id)}.webp`;
    writeAsset(motionFile,encoded.stdout);
    return {motionFile,motionSha256:hash(encoded.stdout),motionFrames:frames.length};
  }
  const movingTime=.65,movingFrame=moving(movingTime);
  const fixtures={bright,dark,moving:movingFrame,cutout:transparent};
  async function audit(effect){
    const comparisons={};
    for(const [name,source] of Object.entries(fixtures)){
      const result=await processVideoEffects(source,[effect],name==='moving'?context(movingTime):
        {timestamp:1,sourceTime:1,frameIndex:30,fps:30});
      comparisons[name]=difference(pixels(source),pixels(result));
    }
    return comparisons;
  };
  for(const descriptor of VIDEO_EFFECT_CATALOG){
    const effect=createLibraryVideoEffect(descriptor.kind);
    const usesCutout=VIDEO_PREVIEW_ALPHA_KINDS.has(effect.kind);
    const usesBright=VIDEO_PREVIEW_BRIGHT_KINDS.has(effect.kind);
    const temporal=VIDEO_TEMPORAL_KINDS.has(effect.kind);
    const animated=temporal||VIDEO_TIME_VARYING_KINDS.has(effect.kind);
    const width=VIDEO_EFFECT_DESIGN_WIDTH,height=width*9/16;
    const time=temporal?movingTime:1;
    const source=temporal?moving(time,width,height):make(usesCutout?cutout:base,0,width,height,usesBright?1.9:1);
    const output=await processVideoEffects(source,[effect],context(time,width,height));
    const clip=await processVideoEffects(temporal?movingFrame:opaque,[effect],context(time));
    const motion=animated?await saveMotion('effects',effect.kind,progress=>{
      const t=.34+progress,movingInput=temporal?moving(t,motionWidth,motionHeight):make(base,0,motionWidth,motionHeight);
      return processVideoEffects(movingInput,[effect],context(t,motionWidth,motionHeight));
    }):undefined;
    save('effects',effect.kind,output,{amount:effect.amount,color:effect.color,parameters:effect.parameters,
      source:temporal?'moving':usesCutout?'cutout':usesBright?'bright':'base',renderWidth:width,renderHeight:height,
      change:difference(pixels(cardFrame(source)),pixels(cardFrame(output))),
      opaquePreview:difference(temporal?pixels(movingFrame):basePixels,pixels(cardFrame(clip))),
      audit:await audit(effect),...motion});
  }
  for(const look of VIDEO_FILTERS){
    const effect=createFilterEffect(look.id);
    const result=await processVideoEffects(opaque,[effect],{timestamp:0,sourceTime:0,frameIndex:0,fps:30});
    save('filters',look.id,result,{change:difference(basePixels,pixels(result)),audit:await audit(effect)});
  }
  for(const template of TEXT_TEMPLATES){
    const frame=make(base),ctx=frame.getContext('2d');ctx.fillStyle='#11121b90';ctx.fillRect(0,0,w,h);
    ctx.translate(w*(.5+template.x),h*(.5+template.y));
    drawVideoText(ctx,{title:template.text,scale:1,textStyle:template.style},w,h,1280);save('text',template.id,frame);
  }
  const clip={duration:2,x:0,y:0,scale:1,rotation:0,opacity:1};
  function poseFrame(clip,time,width=w,height=h){
    const pose=transformAt(clip,time),frame=blank(width,height),ctx=frame.getContext('2d');
    ctx.globalAlpha=pose.opacity;
    ctx.translate(width*(.5+pose.x),height*(.5+pose.y));
    ctx.rotate(pose.rotation*Math.PI/180);
    ctx.scale(pose.scale,pose.scaleY);
    ctx.drawImage(base,-width/2,-height/2,width,height);
    return frame;
  }
  for(const preset of MOTION_PRESETS){
    const motion={...clip,keyframes:motionKeys(clip,preset.id)};
    const time=preset.group==='In'?.2:preset.group==='Out'?1.8:.55;
    save('motion',preset.id,poseFrame(motion,time));
  }
  for(const preset of CLIP_ANIMATIONS){
    const span=makeAnimationSpan(preset.id,1,clip.duration);
    const animated={...clip,animation:{[preset.group]:span}};
    const motion=await saveMotion('animation',preset.id,progress=>poseFrame(animated,span.start+progress,motionWidth,motionHeight));
    save('animation',preset.id,poseFrame(animated,span.start+.47),{group:preset.group,...motion});
  }
  const transitionContext={timestamp:.5,sourceTime:.5,frameIndex:15,fps:30};
  const outgoing=make(base,0,960,540);
  const alternateSource=createCanvas(960,540),alt=alternateSource.getContext('2d');
  alt.translate(960,0);alt.scale(-1,1);alt.drawImage(base,0,0,960,540);
  const alternate=await processVideoEffects(alternateSource,[createFilterEffect(VIDEO_FILTERS.find(f=>f.category==='Creative').id)],transitionContext);
  for(const kind of ['cross-dissolve','wipe','slide']){
    save('transitions',kind,await renderVideoTransition(outgoing,alternate,.5,{version:1,kind,duration:1,direction:'left'},transitionContext));
  }
  for(const transition of TRANSITION_PRESETS){
    save('transitions',transition.id,await renderVideoTransition(outgoing,alternate,.5,createEffectTransition(transition.id,1),transitionContext),{legacy:true});
  }
  const transitionSizes=[[w,h],[motionWidth,motionHeight]].map(([width,height])=>({
    base:make(base,0,width,height),alternate:make(alternate,0,width,height),blank:blank(width,height),
  }));
  for(const recipe of AUTHORED_TRANSITIONS){
    const transition=createEffectTransition(recipe.id,recipe.duration);
    const render=(progress,{base,alternate,blank})=>renderVideoTransition(
      recipe.group==='Fade In'?blank:base,recipe.group==='Fade Out'?blank:recipe.group==='Combo'?alternate:base,
      progress,transition,{...context(progress),referenceWidth:960});
    const motion=await saveMotion('transitions',recipe.id,progress=>render(progress,transitionSizes[1]));
    save('transitions',recipe.id,await render(.46,transitionSizes[0]),{group:recipe.group,...motion});
  }
  writeAsset('thumbnails/manifest.json',Buffer.from(JSON.stringify({
    generator:'Huelith production Canvas2D processors',artwork:'Night Run',width:w,height:h,
    auditFixtures:['bright','dark','moving','cutout'],entries},null,2)+'\n'));
  console.log(`Rendered ${entries.length} cards, including ${VIDEO_EFFECT_CATALOG.length} effects, ${VIDEO_FILTERS.length} filters and ${AUTHORED_TRANSITIONS.length} selectable transitions.`);
  console.log(`Rendered ${entries.filter(entry=>entry.motionFile).length} animated demos and audited ${entries.filter(entry=>entry.audit).length} looks on four fixtures.`);
  console.table(entries.filter(entry=>entry.kind==='effects').sort((a,b)=>a.opaquePreview.rgb-b.opaquePreview.rgb).slice(0,20)
    .map(entry=>({id:entry.id,card:entry.change.rgb,opaque:entry.opaquePreview.rgb})));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
