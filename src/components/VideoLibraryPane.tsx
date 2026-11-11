import {createContext,memo,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {catalogChanged,noteCatalogUse,readCatalogPreferences,toggleCatalogPin} from '../editor/video/catalog-preferences';
import type {VideoJobTask} from './useVideoJobs';
import {Add,AutoAwesomeOutlined,ClosedCaptionOutlined,ColorLensOutlined,GridViewOutlined,MovieOutlined,MusicNoteOutlined,Search,SentimentSatisfiedAltOutlined,TextFields,Tune,WallpaperOutlined,AnimationOutlined,VideoLibraryOutlined} from '@mui/icons-material';
import {Menu,MenuItem,Divider,ListSubheader} from '@mui/material';
import type {VideoProject} from '../editor/project-hub';
import type {VideoAsset,VideoClip,VideoTimeline} from '../editor/video/timeline';
import {VIDEO_EFFECT_CATALOG,VIDEO_TEMPORAL_KINDS,VIDEO_TIME_VARYING_KINDS} from '../editor/video/effects/catalog';
import {FEATURED_VIDEO_EFFECTS,VIDEO_LIBRARY_EFFECT_NAMES,VIDEO_PREVIEW_ALPHA_KINDS,VIDEO_PREVIEW_BRIGHT_KINDS} from '../editor/video/effect-previews';
import type {VideoEffect} from '../editor/video/effects/types';
import {VIDEO_FILTERS} from '../editor/video/filters';
import {TEXT_TEMPLATES,type TextTemplate} from '../editor/video/text-templates';
import {STICKERS,VIDEO_LIBRARY_ROOT} from '../editor/video/library';
import type {Recording} from '../editor/video/audio-catalogue';
import VideoAudioCatalogue from './VideoAudioCatalogue';
import {AUTHORED_TRANSITIONS,TRANSITION_GROUPS,type TransitionGroup} from '../editor/video/transition-recipes';
import {readLocalMedia,toggleLocalMedia,type LocalMediaEntry} from '../editor/video/local-media-library';
import {sceneUsesAsset} from '../editor/video/sequences';
import {VIDEO_COMPOSITIONS} from '../editor/video/compositions';
import {MOTION_PRESETS} from '../editor/video/motion';
import type {VideoLibraryCard} from '../editor/video/library-drop';
import type {StartVideoCardDrag} from './useVideoLibraryDrag';
import VideoCaptionPanel from './VideoCaptionPanel';
import VideoAdjustmentPanel from './VideoAdjustmentPanel';
import VideoGradePanel from './VideoGradePanel';
import VideoUserPresets from './VideoUserPresets';
import type {UserVideoPreset} from '../editor/video/user-presets';
import VideoMediaThumbnail from './VideoMediaThumbnail';
import VideoSourceViewer from './VideoSourceViewer';
import {VIDEO_SHAPES,drawVideoShape} from '../editor/video/graphics';
export function VideoTransitionGlyph(){
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M3 5v14l9-7zm18 0v14l-9-7z" strokeLinejoin="round"/>
  </svg>;
}
const TABS=[
 ['media','Media',VideoLibraryOutlined],['audio','Audio',MusicNoteOutlined],['text','Text',TextFields],['stickers','Stickers',SentimentSatisfiedAltOutlined],
 ['effects','Effects',AutoAwesomeOutlined],['transitions','Transitions',VideoTransitionGlyph],['captions','Captions',ClosedCaptionOutlined],
 ['filters','Filters',ColorLensOutlined],['adjustment','Adjustment',Tune],['color','Color',ColorLensOutlined],['animation','Animation',AnimationOutlined],['templates','Templates',GridViewOutlined],['canvas','Canvas',WallpaperOutlined],
] as const;
type Tab=typeof TABS[number][0];
const primaryTabs=TABS.filter(([id])=>id!=='color'&&id!=='animation'&&id!=='canvas');
const MEDIA_VIEWS=['Project Media','Used in Timeline','Subprojects','Local Library'] as const;
type Props={project:VideoProject;timeline:VideoTimeline;sources:Record<string,string>;offline:Record<string,string>;head:number;playing:boolean;selected?:VideoClip;locked:boolean;busy:boolean;
 onImport:(mode:'media'|'stickers'|'audio')=>void;onInsert:(asset:VideoAsset)=>void;onRelink:(asset:VideoAsset)=>void;onRemoveAsset:(asset:VideoAsset)=>void;
 onSourceInsert:(asset:VideoAsset,mode?:'insert'|'overwrite'|'selects')=>boolean;
 onRecordingTool?:(asset:VideoAsset,mode:'proxy'|'streams'|'voice')=>void;proxyIds:ReadonlySet<string>;
 onText:(template?:TextTemplate)=>void;onGraphic:(id:string)=>void;onSticker:(sticker:typeof STICKERS[number])=>void;onAudio:(item:Recording)=>void;
 onEffects:(effects:VideoEffect[],preview?:boolean)=>void;onClipCard:(card:VideoLibraryCard)=>void;onClip:(patch:Partial<VideoClip>,preview?:boolean)=>void;
 onTimeline:(timeline:VideoTimeline)=>void;onProject:(patch:Partial<VideoProject>)=>void;onCommit:()=>void;onSeek:(time:number)=>void;onComposition:(id:string)=>void;onError:(message:string)=>void;
 gradeBypass:boolean;onGradeBypass:()=>void;onGradeFrame:(graded:boolean)=>Promise<HTMLCanvasElement>;
 selectedIds:string[];onUserPreset:(preset:UserVideoPreset,slots?:Record<string,string>,time?:number)=>void;
 onCardDrag:StartVideoCardDrag;sceneKey:string;
 onAudition:(card?:VideoLibraryCard,name?:string)=>void;
 onImportFolder?:()=>void;onBatchRelink?:()=>void;onVoiceover:()=>void;onFitMusic?:()=>void;
 onImportLocal?:(entry:LocalMediaEntry)=>void;onOpenSequence?:(id:string)=>void;onOpenCompound?:(id:string)=>void;
 enqueue?:(name:string,task:VideoJobTask)=>string;
};
export const videoThumbnail=(group:string,id:string)=>`${VIDEO_LIBRARY_ROOT}thumbnails/${group}/${id.replace(/[^a-z0-9_-]/gi,'_')}.webp`;
const mm=(time:number)=>`${Math.floor(time/60)}:${String(Math.floor(time%60)).padStart(2,'0')}`;
const unique=(values:readonly string[])=>['All',...new Set(values)];
const effectCategories=['All','Stylize','Motion','Lighting','Retro','Artistic','Distort'];
const effectGroups=new Map<string,string>([
 ['Color & light','Lighting'],['Detail & texture','Stylize'],['Artistic Painting','Artistic'],['Anime & Comics','Artistic'],
 ['Video & Temporal','Motion'],['Signature FX','Stylize'],['Creative effects','Artistic'],
]);
function effectCategory(kind:string,group:string){
 if(/blur|trail|echo|zoom|speed/.test(kind))return 'Motion';
 if(/light|glow|bloom|flare|sig_11|sig_3/.test(kind))return 'Lighting';
 if(/vhs|grain|crt|pixel|retro/.test(kind))return 'Retro';
 if(/chromatic|warp|wave|swirl|distort|glitch/.test(kind))return 'Distort';
 if(/ink|paint|sketch/.test(kind))return 'Artistic';
 return effectGroups.get(group)??'Stylize';
}
const order=new Map<string,number>(FEATURED_VIDEO_EFFECTS.map((kind,index)=>[kind,index]));
const featuredEffects=[...VIDEO_EFFECT_CATALOG].sort((a,b)=>(order.get(a.kind)??99)-(order.get(b.kind)??99));
const CatalogContext=createContext<ReturnType<typeof readCatalogPreferences>>({pinned:[],recent:[]});
function GraphicThumbnail({shape}:{shape:typeof VIDEO_SHAPES[number]['shape']}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,176,116);
   ctx.translate(88,58);drawVideoShape(ctx,shape,176,116,1.9);}},[shape]);
 return <canvas ref={canvas} width={176} height={116} style={{width:'100%',height:'100%',objectFit:'cover'}}/>;
}
const CatalogCard=memo(function CatalogCard({name,image,motion,description,disabled,card,onDrag,onClick,onAudition,children,badge,applied}:{
  name:string;image?:string;motion?:string;description?:string;disabled?:boolean;card?:VideoLibraryCard;badge?:string;applied?:boolean;
  onDrag:StartVideoCardDrag;onClick:()=>void;onAudition?:Props['onAudition'];children?:ReactNode;
}){
 const audition=()=>{if(!disabled&&card)onAudition?.(card,name);};
 const [showMotion,setShowMotion]=useState(false);
 const {pinned}=useContext(CatalogContext);
 const identity=card&&'id' in card&&['effect','filter','transition','text','sticker'].includes(card.kind)?card.kind+':'+card.id:undefined;
 const control=<button type="button" className={`hv-catalog-card${card?' hv-draggable-card':''}${applied?' is-applied':''}`} aria-disabled={disabled||undefined}
   title={description??`Add ${name}`} aria-label={`Add ${name}`}
   onPointerEnter={event=>{if(!event.buttons&&event.pointerType==='mouse'){if(motion)setShowMotion(true);audition();}}}
   onPointerLeave={()=>{setShowMotion(false);onAudition?.();}} onFocus={event=>{if(event.currentTarget.matches(':focus-visible')){if(motion)setShowMotion(true);audition();}}}
   onBlur={()=>{setShowMotion(false);onAudition?.();}} onPointerDown={event=>{onAudition?.();if(card)onDrag(event,card,name);}}
   onClick={()=>{onAudition?.();if(!disabled){onClick();if(identity)noteCatalogUse(identity);}}}>
   <span className="hv-card-image">{image?<img src={showMotion&&motion?motion:image} alt="" loading="lazy" draggable={false}/>:children}
     {badge&&<span className="hv-card-context">{badge}</span>}<span className="hv-card-add"><Add fontSize="small"/></span></span><span className="hv-card-name">{name}</span></button>;
 return identity?<span className="hv-catalog-pinnable">{control}<button type="button" className="hv-catalog-pin"
   aria-label={(pinned.includes(identity)?'Unpin ':'Pin ')+name} aria-pressed={pinned.includes(identity)}
   onClick={()=>toggleCatalogPin(identity)}>{pinned.includes(identity)?'★':'☆'}</button></span>:control;
});
export default function VideoLibraryPane(props:Props){
 const [tab,setTab]=useState<Tab>('media'),[category,setCategory]=useState('All'),[query,setQuery]=useState('');
 const [libraryMenu,setLibraryMenu]=useState<HTMLElement|null>(null);
 const [catalog,setCatalog]=useState(readCatalogPreferences),[catalogView,setCatalogView]=useState<'all'|'pinned'|'recent'>('all');
 useEffect(()=>{const refresh=()=>setCatalog(readCatalogPreferences());window.addEventListener(catalogChanged,refresh);
   return()=>window.removeEventListener(catalogChanged,refresh);},[]);
 const [liveAudition,setLiveAudition]=useState(false);
 const audition=liveAudition&&!props.playing?props.onAudition:undefined;
 const [bin, setBin] = useState('');
 const [mediaView,setMediaView]=useState<typeof MEDIA_VIEWS[number]>('Project Media');
 const [mediaLayout,setMediaLayout]=useState<'grid'|'list'>('grid'),[sort,setSort]=useState('added');
 const [localMedia,setLocalMedia]=useState(readLocalMedia);
 const [transitionGroup,setTransitionGroup]=useState<TransitionGroup>('Fade In');
 const [sourceId, setSourceId] = useState<string>();
 const source = props.timeline.assets.find(asset => asset.id === sourceId);
 const bins = useMemo(() => [...new Set(props.timeline.assets.flatMap(asset => asset.bin ? [asset.bin] : []))].sort(), [props.timeline.assets]);
 const used=useMemo(()=>new Set(props.timeline.assets.filter(asset=>sceneUsesAsset(props.timeline,asset.id)).map(asset=>asset.id)),[props.timeline]);
 const media=props.timeline.assets.filter(asset=>{
   if(asset.sticker||bin&&asset.bin!==bin||mediaView==='Used in Timeline'&&!used.has(asset.id))return false;
   const group=asset.kind==='image'?'Images':asset.kind==='video'?'Video':'Audio';
   return (category==='Favourites'?asset.favorite:category==='All'||category===group)
     &&[asset.name,asset.bin,...asset.tags??[]].some(value=>value?.toLowerCase().includes(query.toLowerCase()));
 });
 if(sort==='name')media.sort((a,b)=>a.name.localeCompare(b.name));
 if(sort==='duration')media.sort((a,b)=>b.duration-a.duration);
 const effects=props.selected?.effects??[];
 const chosen=(name:string,group:string,id?:string)=>(category==='All'||category===group)&&name.toLowerCase().includes(query.toLowerCase())
   &&(catalogView==='all'||!id||catalog[catalogView].includes(id));
 const visual=!!props.selected&&!props.locked&&props.timeline.tracks.find(t=>t.id===props.selected?.trackId)?.kind!=='audio';
 const categories=tab==='media'?['All','Video','Audio','Images','Favourites']:tab==='audio'?['All','Music','Sound effects']:
  tab==='text'?unique(TEXT_TEMPLATES.map(t=>t.category)):tab==='stickers'?['All','Imported',...new Set(STICKERS.map(s=>s.category))]:
  tab==='effects'?effectCategories:tab==='filters'?unique(VIDEO_FILTERS.map(f=>f.category)):
  tab==='transitions'?unique(AUTHORED_TRANSITIONS.filter(item=>item.group===transitionGroup).map(item=>item.family)):tab==='templates'?unique(VIDEO_COMPOSITIONS.map(t=>t.category)):
  tab==='animation'?['All','In','Out','Loop']:[];
 function selectTab(value:Tab){props.onAudition();setTab(value);setCategory('All');setQuery('');}
 return <CatalogContext.Provider value={catalog}><aside className="hv-library hv-card hv-studio-library" data-tab={tab} aria-label="Video asset library">
  <div className="hv-library-tabbar">
   <nav className="hv-library-tabs hv-expanded-library-tabs" aria-label="Video library tabs">{primaryTabs.map(([id,label,Icon])=><button key={id} className={tab===id?'is-active':''} aria-pressed={tab===id} title={label} onClick={()=>selectTab(id)}><Icon/><span>{label}</span></button>)}</nav>
  </div>
  <div className="hv-library-body">
   <section className="hv-library-content" aria-label={`${TABS.find(t=>t[0]===tab)?.[1]} library`}>
    <div className="hv-library-toolbar">{(['media','audio','stickers'] as string[]).includes(tab)&&<button className="hv-library-import" disabled={props.busy} onClick={()=>props.onImport(tab==='stickers'?'stickers':tab==='audio'?'audio':'media')}><Add fontSize="small"/> Import</button>}
     {tab==='text'&&<button className="hv-library-import" onClick={()=>props.onText()}><Add fontSize="small"/> Add text</button>}
     {!!categories.length?<label className="hv-library-search"><Search fontSize="small"/><input aria-label={`Search ${tab}`} placeholder={`Search ${tab}…`} type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
       :<strong className="hv-library-tool-name">{TABS.find(item=>item[0]===tab)?.[1]}</strong>}
     <button type="button" className="hv-library-options" title="Library options and tools" aria-label="Library options and tools"
       onClick={event=>setLibraryMenu(event.currentTarget)}><Tune fontSize="small"/></button>
    </div>
    <Menu anchorEl={libraryMenu} open={!!libraryMenu} onClose={()=>setLibraryMenu(null)}>
      {['effects','filters','text','stickers','transitions'].includes(tab)&&[
        ...(['all','pinned','recent'] as const).map(view=><MenuItem key={view} selected={view===catalogView}
          onClick={()=>{setCatalogView(view);setLibraryMenu(null);}}>{view==='all'?'Browse all':view==='pinned'?'Pinned cards':'Recently used'}</MenuItem>),
        <Divider key="views-divider"/>,
      ]}
      {visual&&['effects','filters','transitions'].includes(tab)&&<MenuItem selected={liveAudition}
        onClick={()=>{props.onAudition();setLiveAudition(value=>!value);setLibraryMenu(null);}}>Preview cards on selected clip</MenuItem>}
      <ListSubheader>Library tools</ListSubheader>
      {TABS.filter(([id])=>!primaryTabs.some(([primary])=>id===primary)).map(([id,label])=><MenuItem key={id} selected={id===tab}
        onClick={()=>{selectTab(id);setLibraryMenu(null);}}>{label}</MenuItem>)}
    </Menu>
    {tab==='transitions'&&<nav className="hv-inspector-subtabs hv-transition-tabs" aria-label="Transition placement">
      {TRANSITION_GROUPS.map(name=><button type="button" key={name} aria-pressed={transitionGroup===name}
        onClick={()=>{setTransitionGroup(name);setCategory('All');props.onAudition();}}>{name}</button>)}
    </nav>}
    {tab==='media'&&<nav className="hv-inspector-subtabs hv-media-views" aria-label="Media views">
      {MEDIA_VIEWS.map(name=><button type="button" key={name} aria-pressed={mediaView===name}
        onClick={()=>{setMediaView(name);setSourceId(undefined);setCategory('All');}}>{name}</button>)}
    </nav>}
    {!!categories.length&&(tab!=='media'||mediaView==='Project Media'||mediaView==='Used in Timeline')&&<nav className="hv-category-rail" aria-label={`${tab} categories`}>{categories.map(name=>
      <button className={category===name?'is-active':''} aria-pressed={category===name} key={name} onClick={()=>setCategory(name)}>{name}</button>)}</nav>}
    {['adjustment','color'].includes(tab)&&!visual&&<p className="hv-selection-hint">Select an unlocked visual clip on the timeline to apply {tab}.</p>}
    <div className="hv-library-scroll">
     {tab==='media'&&(mediaView==='Project Media'||mediaView==='Used in Timeline')&&<>
       <div className="hv-inline-actions hv-media-actions">
         {props.onImportFolder&&<button disabled={props.busy} onClick={props.onImportFolder}>Import folder</button>}
         {props.onBatchRelink&&Object.keys(props.offline).length>0&&<button disabled={props.busy} onClick={props.onBatchRelink}>Relink folder</button>}
       </div>
       <div className="hv-tool-panel hv-media-tools hv-media-display"><label className="hv-field">Bin<select value={bin} onChange={event=>setBin(event.target.value)}>
         <option value="">All bins</option>{bins.map(name=><option key={name}>{name}</option>)}
       </select></label><label className="hv-field">Sort<select value={sort} onChange={event=>setSort(event.target.value)}>
         <option value="added">Added order</option><option value="name">Name</option><option value="duration">Duration</option></select></label>
         <button type="button" onClick={()=>setMediaLayout(value=>value==='grid'?'list':'grid')}>{mediaLayout==='grid'?'List':'Grid'}</button></div>
       <div className={`hv-catalog-grid hv-media-grid${mediaLayout==='list'?' is-list':''}`}>{media.map(asset=><div className="hv-project-media" key={asset.id}>
      <CatalogCard name={asset.name} disabled={!!props.offline[asset.id]} card={props.offline[asset.id]?undefined:{kind:'asset',id:asset.id}}
        onDrag={props.onCardDrag} description={`Drag ${asset.name} to the timeline, or click to insert at the playhead`} onClick={()=>props.onInsert(asset)}><VideoMediaThumbnail asset={asset} url={props.sources[asset.id]}/><span className="hv-media-duration">{asset.animated?'GIF':asset.kind==='image'?'Image':mm(asset.duration)}</span>
        {used.has(asset.id)&&<span className="hv-media-used">Added</span>}</CatalogCard>
      <div className="hv-media-actions"><button aria-label={`${asset.favorite?'Unfavourite':'Favourite'} ${asset.name}`} aria-pressed={!!asset.favorite}
        onClick={()=>props.onTimeline({...props.timeline,assets:props.timeline.assets.map(item=>item.id===asset.id?{...item,favorite:!item.favorite}:item)})}>{asset.favorite?'★':'☆'}</button>
       <button title={props.offline[asset.id]?'Offline source':'Open source viewer'} onClick={()=>setSourceId(asset.id)}>Source</button><button aria-label={`Relink ${asset.name}`} onClick={()=>props.onRelink(asset)}>Relink</button>
       {!asset.libraryId&&!asset.path.startsWith('browser:')&&<button aria-label={`Keep ${asset.name} in Local Library`}
         aria-pressed={localMedia.some(item=>item.path===asset.path)} onClick={()=>{try{setLocalMedia(toggleLocalMedia(asset));}catch(error){props.onError(String(error));}}}>Keep</button>}
       <button aria-label={`Remove ${asset.name} from library`} onClick={()=>props.onRemoveAsset(asset)}>×</button></div>
     </div>)}</div>
       {source&&<VideoSourceViewer key={source.id} asset={source} url={props.sources[source.id]} onClose={()=>setSourceId(undefined)}
         onSave={asset=>props.onTimeline({...props.timeline,assets:props.timeline.assets.map(item=>item.id===asset.id?asset:item)})}
         onInsert={props.onSourceInsert} proxy={props.proxyIds.has(source.id)}
         onRecordingTool={props.onRecordingTool&&!props.busy?mode=>{props.onRecordingTool?.(source,mode);setSourceId(undefined);}:undefined}/>}
       {!media.length&&<div className="hv-library-empty"><MovieOutlined/><b>{mediaView==='Used in Timeline'?'No matching media on this timeline':'No matching media'}</b><button onClick={()=>props.onImport('media')}>Import media</button></div>}</>}
     {tab==='media'&&mediaView==='Subprojects'&&<div className="hv-media-subprojects">
       {(props.project.sequences??[]).filter(item=>item.name.toLowerCase().includes(query.toLowerCase())).map(item=>
         <button type="button" key={item.id} onClick={()=>props.onOpenSequence?.(item.id)}><MovieOutlined/>{item.name}<small>Sequence</small></button>)}
       {props.timeline.clips.filter(clip=>clip.compound&&(clip.title??'').toLowerCase().includes(query.toLowerCase())).map(clip=>
         <button type="button" key={clip.id} onClick={()=>props.onOpenCompound?.(clip.id)}><MovieOutlined/>{clip.title}<small>Compound clip</small></button>)}
       {!props.project.sequences?.length&&!props.timeline.clips.some(clip=>clip.compound)&&<p>Create a sequence or compound clip to see it here.</p>}
     </div>}
     {tab==='media'&&mediaView==='Local Library'&&<div className="hv-media-subprojects">
       {localMedia.filter(item=>item.name.toLowerCase().includes(query.toLowerCase())).map(item=><div key={item.path} className="hv-local-media-row">
         <button type="button" disabled={props.busy||!props.onImportLocal} onClick={()=>props.onImportLocal?.(item)}><MovieOutlined/>{item.name}<small>Import</small></button>
         <button type="button" aria-label={`Remove ${item.name} from Local Library`} onClick={()=>{try{setLocalMedia(toggleLocalMedia(item));}catch(error){props.onError(String(error));}}}>×</button>
       </div>)}
       {!localMedia.length&&<p>Use Keep on a media card to reuse the file in other projects.</p>}
     </div>}
     {tab==='audio'&&<div className="hv-inline-actions hv-media-actions"><button onClick={props.onVoiceover}>Record voiceover</button>
       {props.onFitMusic&&<button disabled={props.busy} onClick={props.onFitMusic}>Fit selected music to range</button>}</div>}
     {tab==='audio'&&<VideoAudioCatalogue key={props.project.id} query={query} category={category} playing={props.playing}
       busy={props.busy} onAdd={props.onAudio} onCardDrag={props.onCardDrag} onError={props.onError}/>}
     {tab==='text'&&<><p className="hv-library-section">EDITABLE TEXT · {TEXT_TEMPLATES.length} TEMPLATES</p><div className="hv-catalog-grid">{TEXT_TEMPLATES.filter(t=>chosen(t.name,t.category,'text:'+t.id)).map(t=><CatalogCard key={t.id} name={t.name} image={videoThumbnail('text',t.id)} description="Drag to place text, or click to insert at the playhead" card={{kind:'text',id:t.id}} onDrag={props.onCardDrag} onClick={()=>props.onText(t)}/>)}</div></>}
     {tab==='text'&&category==='All'&&catalogView==='all'&&<><p className="hv-library-section">MOTION GRAPHICS</p><div className="hv-catalog-grid">
       {VIDEO_SHAPES.filter(item=>item.name.toLowerCase().includes(query.toLowerCase())).map(item=><CatalogCard key={item.shape.kind}
         name={item.name} card={{kind:'graphic',id:item.shape.kind}} onDrag={props.onCardDrag} onClick={()=>props.onGraphic(item.shape.kind)}>
         <GraphicThumbnail shape={item.shape}/></CatalogCard>)}
     </div></>}
     {tab==='stickers'&&<><p className="hv-library-section">ORIGINAL STICKERS · PNG / GIF / JPG / BMP / TGA IMPORT</p><div className="hv-catalog-grid hv-sticker-grid">{category!=='Imported'&&STICKERS.filter(s=>chosen(s.name,s.category,'sticker:'+s.id)).map(sticker=><CatalogCard key={sticker.id} name={sticker.name} card={{kind:'sticker',id:sticker.id}} onDrag={props.onCardDrag} onClick={()=>props.onSticker(sticker)}><span className="hv-sticker-sprite" style={{backgroundPosition:`${sticker.crop.x/(1-sticker.crop.width)*100}% ${sticker.crop.y/(1-sticker.crop.height)*100}%`}}/></CatalogCard>)}
       {catalogView==='all'&&(category==='All'||category==='Imported')&&props.timeline.assets.filter(a=>a.sticker&&a.name.toLowerCase().includes(query.toLowerCase())).map(a=><CatalogCard key={a.id} name={a.name} disabled={!!props.offline[a.id]} card={props.offline[a.id]?undefined:{kind:'asset',id:a.id}} onDrag={props.onCardDrag} onClick={()=>props.onInsert(a)}><VideoMediaThumbnail asset={a} url={props.sources[a.id]}/></CatalogCard>)}</div><p className="hv-license-note">Original sticker artwork · CC0. Animated GIFs keep their timing on the timeline.</p></>}
     {tab==='effects'&&<div className="hv-catalog-grid" aria-label={`${VIDEO_EFFECT_CATALOG.length} Huelith effects`}>{featuredEffects.filter(e=>chosen((VIDEO_LIBRARY_EFFECT_NAMES[e.kind]??e.label)+' '+e.label,effectCategory(e.kind,e.group),'effect:'+e.kind)).map(e=><CatalogCard key={e.kind} name={VIDEO_LIBRARY_EFFECT_NAMES[e.kind]??e.label} image={videoThumbnail('effects',e.kind)} onAudition={audition}
       motion={(VIDEO_TEMPORAL_KINDS.has(e.kind)||VIDEO_TIME_VARYING_KINDS.has(e.kind))?videoThumbnail('animated/effects',e.kind):undefined}
       badge={e.temporal?'Motion demo':VIDEO_PREVIEW_ALPHA_KINDS.has(e.kind)?'Cutout demo':VIDEO_PREVIEW_BRIGHT_KINDS.has(e.kind)?'Bright areas':undefined}
       description={e.temporal?'Uses earlier frames in this clip':e.kind==='backdrop'?'Fills transparent areas. Use a cutout, mask, or transparent clip to reveal the backdrop.':VIDEO_PREVIEW_ALPHA_KINDS.has(e.kind)?'Demo rendered on a subject with transparent edges':VIDEO_PREVIEW_BRIGHT_KINDS.has(e.kind)?'Preview rendered on bright footage':e.kind==='atelier_4_7'?'Position the emitters with Center X, Center Y, Eye tilt, and Separation in the Inspector.':undefined}
       applied={effects.some(effect=>effect.enabled&&effect.kind===e.kind)} disabled={!visual} card={{kind:'effect',id:e.kind}} onDrag={props.onCardDrag} onClick={()=>props.onClipCard({kind:'effect',id:e.kind})}/>)}</div>}
     {tab==='filters'&&<><p className="hv-library-section">COLOR FILTERS · {VIDEO_FILTERS.length} LOOKS</p><div className="hv-catalog-grid">{VIDEO_FILTERS.filter(f=>chosen(f.name,f.category,'filter:'+f.id)).map(f=><CatalogCard key={f.id} name={f.name} image={videoThumbnail('filters',f.id)} onAudition={audition} description={f.description} disabled={!visual} card={{kind:'filter',id:f.id}} onDrag={props.onCardDrag} onClick={()=>props.onClipCard({kind:'filter',id:f.id})}/>)}</div></>}
     {tab==='transitions'&&<div className="hv-catalog-grid" aria-label={transitionGroup+' transition presets'}>
       {AUTHORED_TRANSITIONS.filter(item=>item.group===transitionGroup&&chosen(item.name,item.family,'transition:'+item.id)).map(item=>
         <CatalogCard key={item.id} name={item.name} image={videoThumbnail('transitions',item.id)} motion={videoThumbnail('animated/transitions',item.id)}
           description={item.name+' · '+(item.group==='Combo'?'At a cut or split point':item.group==='Fade In'?'Clip start':'Clip end')}
           onAudition={audition} disabled={!visual||props.selected?.adjustment} card={{kind:'transition',id:item.id}}
           onDrag={props.onCardDrag} onClick={()=>props.onClipCard({kind:'transition',id:item.id})}/>)}</div>}
     <div hidden={tab!=='captions'}><VideoCaptionPanel key={props.sceneKey} timeline={props.timeline} head={props.head}
       onChange={props.onTimeline} onSeek={props.onSeek} onError={props.onError} enqueue={props.enqueue}
       dictionary={props.project.captionDictionary} onDictionary={captionDictionary=>props.onProject({captionDictionary})}/></div>
     {tab==='adjustment'&&<VideoAdjustmentPanel effects={effects} disabled={!visual} onChange={props.onEffects} onCommit={props.onCommit}/>}
     {tab==='color'&&<VideoGradePanel grade={props.selected?.grade} disabled={!visual} bypass={props.gradeBypass}
       onChange={(grade,preview)=>props.onClip({grade},preview)} onCommit={props.onCommit} onBypass={props.onGradeBypass}
       onFrame={props.onGradeFrame} onError={props.onError}/>}
     {tab==='animation'&&<div className="hv-tool-panel"><h3>Clip animation</h3><p>Motion presets create editable position, scale, rotation and opacity keys.</p><div className="hv-catalog-grid">{MOTION_PRESETS.filter(p=>chosen(p.name,p.group)).map(p=><CatalogCard key={p.id} name={p.name} image={videoThumbnail('motion',p.id)}
        disabled={!visual||props.selected?.adjustment} card={{kind:'motion',id:p.id}} onDrag={props.onCardDrag} onClick={()=>props.onClipCard({kind:'motion',id:p.id})}/>)}</div><button disabled={!visual||!props.selected?.keyframes?.length} onClick={()=>props.onClip({keyframes:[]})}>Clear clip animation</button></div>}
     {tab==='templates'&&<>
       <VideoUserPresets key={props.sceneKey} timeline={props.timeline} selectedIds={props.selectedIds} clip={props.selected} locked={props.locked} onApply={props.onUserPreset} onCardDrag={props.onCardDrag}/>
       <p className="hv-library-section">EDITABLE COMPOSITIONS</p><div className="hv-catalog-grid">{VIDEO_COMPOSITIONS.filter(t=>chosen(t.name,t.category,'text:'+t.id)).map(t=><CatalogCard key={t.id} name={t.name} image={videoThumbnail('text',t.template)} description={t.description} card={{kind:'composition',id:t.id}} onDrag={props.onCardDrag} onClick={()=>props.onComposition(t.id)}/>)}</div><p className="hv-license-note">Uses your selected media, or the first visual asset in the library. All clips, titles, effects and motion remain editable.</p></>}
     {tab==='canvas'&&<div className="hv-tool-panel"><h3>Project canvas</h3><p>Set the output shape and background for this project.</p>
      <label className="hv-field">Aspect ratio<select value="" onChange={e=>{const [width,height]=e.target.value.split('x').map(Number);props.onProject({width,height});}}><option value="">{props.project.width} × {props.project.height}</option>{[[1920,1080,'16:9 · Landscape'],[1080,1920,'9:16 · Portrait'],[1080,1080,'1:1 · Square'],[1440,1080,'4:3 · Classic'],[1080,1440,'3:4 · Portrait'],[2560,1080,'21:9 · Cinema']].map(([w,h,label])=><option key={String(label)} value={`${w}x${h}`}>{label}</option>)}</select></label>
      <div className="hv-pair">{(['width','height'] as const).map(key=><label className="hv-field" key={key}>{key}<input key={`${key}-${props.project[key]}`} type="number" min={16} max={key==='width'?3840:2160} step={2} defaultValue={props.project[key]} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>{const value=Math.max(16,Math.min(key==='width'?3840:2160,Math.round(+e.target.value/2)*2||props.project[key]));e.currentTarget.value=String(value);if(value!==props.project[key])props.onProject({[key]:value});}}/></label>)}</div>
      <label className="hv-field">Frame rate<select value={props.project.fps} onChange={e=>props.onProject({fps:+e.target.value})}>{[24,25,30,50,60,120].map(n=><option key={n} value={n}>{n} fps</option>)}</select></label>
      <label className="hv-field">Background<input type="color" value={props.timeline.background??'#0b0e18'} onChange={e=>props.onTimeline({...props.timeline,background:e.target.value})}/></label>
      <label className="hv-field">Project name<input key={props.project.name} defaultValue={props.project.name} maxLength={120}
        onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}
        onBlur={event=>{const name=event.currentTarget.value.trim()||props.project.name;event.currentTarget.value=name;if(name!==props.project.name)props.onProject({name});}}/></label>
     </div>}
    </div>
   </section>
  </div>
 </aside></CatalogContext.Provider>;
}
