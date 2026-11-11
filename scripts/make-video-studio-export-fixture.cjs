/* Expands a real saved native speech project into a mixed export acceptance scene. */
require('./video-canvas-runtime.cjs');
const fs=require('node:fs'),path=require('node:path');
const {createFilterEffect,createVideoEffect}=require('../src/editor/video/effects/catalog.ts');
const {VIDEO_FILTERS}=require('../src/editor/video/filters/index.ts');
const {TEXT_TEMPLATE_LOOKUP}=require('../src/editor/video/text-templates.ts');
const {STICKERS}=require('../src/editor/video/library.ts');
const {AUDIO_LIBRARY}=require('../src/editor/video/audio-library.ts');
const {motionKeys}=require('../src/editor/video/motion.ts');
const {isVideoTimeline}=require('../src/editor/video/timeline.ts');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'output/video-studio');
const original=JSON.parse(fs.readFileSync(path.join(folder,'studio-fixture.huelith'),'utf8'));
const result=structuredClone(original),t=result.timeline,scene=t.clips.find(c=>c.id==='portrait');
const first={...scene,id:'scene-a',duration:3.5,effects:[createFilterEffect(VIDEO_FILTERS[10].id)]};first.keyframes=motionKeys(first,'slow-zoom');
const second={...scene,id:'scene-b',start:3,duration:3,effects:[createFilterEffect(VIDEO_FILTERS[245].id)],transitionIn:{version:1,kind:'effect',preset:'prism-flash',duration:.5,direction:'left'}};
const sticker=STICKERS[0],music=AUDIO_LIBRARY[0],template=TEXT_TEMPLATE_LOOKUP.get('violet-headline');
t.assets.push({id:'sticker-cat',name:'Black cat.png',path:'library:stickers/huelith-sticker-atlas.png',libraryId:sticker.file,kind:'image',duration:5,width:1254,height:1254,crop:sticker.crop,sticker:true},
 {id:'music-library',name:'Violet afterglow.m4a',path:'library:'+music.file,libraryId:music.file,kind:'audio',duration:music.duration,waveform:music.waveform},
 {id:'gif-sticker',name:'test-sticker.gif',path:path.join(folder,'test-sticker.gif'),kind:'image',duration:5,width:64,height:64,sticker:true,animated:true,animationDuration:.6},
 {id:'tga-sticker',name:'test-sticker.tga',path:path.join(folder,'test-sticker.tga'),kind:'image',duration:5,width:64,height:64,sticker:true});
t.tracks.splice(1,0,{id:'stickers',name:'Stickers',kind:'video',muted:false,locked:false,purpose:'stickers'});
const clip=(id,trackId,assetId,start,duration,patch={})=>({id,trackId,assetId,start,sourceIn:0,duration,volume:0,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0,...patch});
t.clips=t.clips.filter(c=>c.id!=='portrait');t.clips.push(first,second,
 clip('cat','stickers','sticker-cat',.5,4.5,{scale:.2,x:.32,y:.25}),
 clip('gif','stickers','gif-sticker',1,2,{scale:.13,x:.34,y:-.3}),
 clip('tga','stickers','tga-sticker',.5,4,{scale:.13,x:-.34,y:-.3}),
 clip('music','audio','music-library',0,6,{volume:.15,fadeIn:.15,fadeOut:1}),
 {...clip('headline','title',undefined,0,2.6,{x:0,y:-.34}),title:'A NEW PERSPECTIVE',textStyle:template.style,keyframes:motionKeys({...scene,duration:2.6},'fade-in')});
t.background='#15131d';
if(!isVideoTimeline(t))throw Error('Export fixture is not a valid real timeline');
result.id='video-studio-export-qa';result.name='Video Studio export QA';result.updatedAt=new Date().toISOString();
fs.writeFileSync(path.join(folder,'studio-export-fixture.huelith'),JSON.stringify(result,null,2));console.log(`Created ${t.clips.length}-clip mixed native export fixture, including ${t.clips.filter(c=>c.caption).length} recognized captions.`);
