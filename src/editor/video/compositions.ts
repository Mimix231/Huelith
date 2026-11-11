import {addMediaClip,addTitle,MAX_TIMELINE,type VideoTimeline,newTrack} from './timeline';
import {TEXT_TEMPLATE_LOOKUP} from './text-templates';
import {motionKeys} from './motion';
import {createFilterEffect} from './effects/catalog';
import {VIDEO_FILTERS} from './filters';
import {placeLibraryMedia} from './library-drop';
export const VIDEO_COMPOSITIONS=[
 {id:'cinema',name:'Cinematic opening',description:'Slow push, cinematic grade and a gold title.',text:'YOUR NEXT CHAPTER',template:'gold-headline',category:'Openers'},
 {id:'story',name:'Story introduction',description:'A rising headline with a gentle image pan.',text:'A STORY WORTH TELLING',template:'clean-headline',category:'Openers'},
 {id:'news',name:'News lower third',description:'Editable name label over your selected media.',text:'YOUR NAME · YOUR STORY',template:'sidebar-lower-third',category:'Titles'},
 {id:'travel',name:'Travel postcard',description:'Warm grade, gentle zoom and an editorial caption.',text:'SOMEWHERE NEW',template:'serif-headline',category:'Openers'},
 {id:'social',name:'Social statement',description:'Bold outlined text with a pop entrance.',text:'MAKE IT HAPPEN',template:'comic-headline',category:'Social'},
 {id:'quote',name:'Quiet quotation',description:'Soft typography and an unhurried fade.',text:'“Find beauty in the ordinary.”',template:'quiet-headline',category:'Titles'},
 {id:'neon',name:'Neon night',description:'A night grade, violet glow title and an entrance spin.',text:'AFTER DARK',template:'violet-headline',category:'Social'},
 {id:'end',name:'Closing card',description:'A clean closing message with a fade.',text:'THANK YOU FOR WATCHING',template:'clean-headline',category:'Titles'},
] as const;
/** A composition expands into ordinary editable clips, never flattened video. */
export function applyVideoComposition(timeline:VideoTimeline,id:string,at:number,assetId?:string,dropTrackId?:string):VideoTimeline{
  const preset=VIDEO_COMPOSITIONS.find(p=>p.id===id);if(!preset)throw Error('Unknown composition');
  let result=timeline;
  at=Math.max(0,Math.min(MAX_TIMELINE-4,at));
  const asset=timeline.assets.find(a=>a.id===assetId&&a.kind!=='audio')??timeline.assets.find(a=>a.kind!=='audio');
  if(timeline.clips.length+(asset?2:1)>4096)throw Error('The timeline clip limit is reached.');
  if(asset){
    const added=dropTrackId?placeLibraryMedia(result,asset,at,dropTrackId,6):addMediaClip(result,asset,undefined,at);result=added.timeline;
    const clip=added.clip,look=VIDEO_FILTERS.find(f=>f.category===(id==='neon'?'Night':id==='travel'?'Nature':'Cinematic'))!;
    result={...result,clips:result.clips.map(c=>c.id===clip.id?{...c,duration:Math.min(6,c.duration),keyframes:motionKeys({...c,duration:Math.min(6,c.duration)},id==='story'?'pan-left':'slow-zoom'),effects:['cinema','travel','neon'].includes(id)?[createFilterEffect(look.id)]:[]}:c)};
  }
  if(!result.tracks.some(t=>t.kind==='title'&&!t.locked))result=newTrack(result,'title');
  const added=addTitle(result,at,preset.text,undefined,4),template=TEXT_TEMPLATE_LOOKUP.get(preset.template)!;
  const title={...added.clip,x:template.x,y:template.y,textStyle:template.style,fadeOut:.4};
  return {...added.timeline,clips:added.timeline.clips.map(c=>c.id===title.id?{...title,keyframes:motionKeys(title,id==='social'?'pop-in':id==='neon'?'spin-in':'fade-in')}:c)};
}
