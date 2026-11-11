import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ChangeEvent, type CSSProperties } from 'react';
import {Button,Dialog,DialogActions,DialogContent,DialogTitle,Menu,MenuItem} from '@mui/material';
import {invoke} from '@tauri-apps/api/core';
import {
  Add, Audiotrack, Close, ContentCut, DeleteOutline, LockOutlined,
  LockOpenOutlined, MovieOutlined, Pause, PlayArrow, SkipPrevious, TextFields,
  VolumeOff, VolumeUp, VisibilityOutlined, VisibilityOffOutlined, ZoomIn, SkipNext, FastRewind, FastForward,
  Fullscreen, MonitorOutlined, ExpandMore, PanToolOutlined, NearMeOutlined, Loop, Tune,
  DiamondOutlined,MicNone,Link,LinkOff,BookmarkAddOutlined,FirstPage,LastPage,FitScreen,
} from '@mui/icons-material';
import type { VideoProject } from '../editor/project-hub';
import {
  activeClips, addTitle, defaultTimeline, durationOf, makeAsset, moveClip, newTrack,
  MAX_TIMELINE, splitClip, VIDEO_LABEL_COLORS,
  type TimelineMarker, type VideoAsset, type VideoClip, type VideoRange, type VideoTimeline, type VideoTrack,
} from '../editor/video/timeline';
import { classifyMedia, mediaMetadata, mediaUrl, registerBrowserFile, clearMediaUrls, forgetMediaUrl } from '../editor/video/media-assets';
import { findCachedProxies, isNativeMediaDesktop, nativeMediaCapabilities, prepareRecording, probeNativeMedia, recordingTimecode,type MediaCapabilities, type NativeExportReport } from '../editor/video/native-media';
import VideoPreviewCanvas from './VideoPreviewCanvas';
import VideoAudioPreview from './VideoAudioPreview';
import { VideoPlaybackTransport } from '../editor/video/playback-transport';
import { timelineAudioSources } from '../editor/video/audio-plan';
import VideoEffectInspector from './VideoEffectInspector';
import VideoExportDialog,{type VideoExportSettings} from './VideoExportDialog';
import {planDelivery} from '../editor/video/delivery';
import type {VideoEffect} from '../editor/video/effects/types';
import VideoLibraryPane,{VideoTransitionGlyph} from './VideoLibraryPane';
import { useVideoLibraryDrag } from './useVideoLibraryDrag';
import { applyLibraryClipCard, librarySampleTime, placeLibraryMedia, resolveLibraryDrop, type TimelineDrop, type VideoLibraryCard } from '../editor/video/library-drop';
import VideoTransformOverlay from './VideoTransformOverlay';
import VideoTransformControls from './VideoTransformControls';
import VideoMaskOverlay from './VideoMaskOverlay';
import VideoMaskControls from './VideoMaskControls';
import VideoKeyframeLanes from './VideoKeyframeLanes';
import VideoClipAnimation from './VideoClipAnimation';
import {type KeyClock} from './VideoKeyedValue';
import VideoAdvancedClipControls from './VideoAdvancedClipControls';
import VideoSequenceBar from './VideoSequenceBar';
import VideoFootageTools from './VideoFootageTools';
import {addSequence,MAIN_SEQUENCE,makeCompound,replaceScene,sceneAt,sceneUsesAsset,switchSequence,syncVariantCuts} from '../editor/video/sequences';
import {pitchTiming,playbackRateAt,sourceBounds} from '../editor/video/clip-timing';
import {analyzeAudio,sourceBeatToTimeline} from '../editor/video/audio-analysis';
import VideoClipWaveform from './VideoClipWaveform';
import VideoStudioHints from './VideoStudioHints';
import VideoAudioControls from './VideoAudioControls';
import VideoGradePanel from './VideoGradePanel';
import {VideoTextControls,VideoMotionControls} from './VideoClipControls';
import { TEXT_TEMPLATE_LOOKUP, type TextTemplate } from '../editor/video/text-templates';
import {importRecording,recordingCredits,type Recording} from '../editor/video/audio-catalogue';
import {STICKERS,libraryFilePath,resolvedAssetPath} from '../editor/video/library';
import {transitionName} from '../editor/video/transitions';
import {AUTHORED_TRANSITION_LOOKUP} from '../editor/video/transition-recipes';
import {createLibraryVideoEffect} from '../editor/video/effect-previews';
import type {VideoGrade} from '../editor/video/color-tools';
import {applyVideoComposition} from '../editor/video/compositions';
import {applyLayout,presetClipPatch,type UserVideoPreset} from '../editor/video/user-presets';
import {deleteClips, editableClips, linkClips, linkedSelection, moveSelectedClips, pasteClips, rippleTrim,splitLinkedClips,trimLinkedClips,type ClipClipboard} from '../editor/video/timeline-edits';
import {assembleSelects,placeSourceEdit} from '../editor/video/precision-edit';
import {assembleHighlights} from '../editor/video/editorial-review';
import VideoEditorialTools from './VideoEditorialTools';
import {readOtio,writeOtio} from '../editor/video/otio';
import {VIDEO_SHAPES} from '../editor/video/graphics';
import {beatPulsePoints,pinOverlay} from '../editor/video/animation-tools';
import {VIDEO_EFFECT_LOOKUP} from '../editor/video/effects/catalog';
import {buildMulticam,correlateAngles,cutMulticam,syncSourceRange} from '../editor/video/multicam';
import {DEFAULT_STUDIO_LAYOUT,readStudioPreferences,saveStudioPreferences,VIDEO_COMMANDS,type StudioCommand,type StudioPreferences} from '../editor/video/workspace-preferences';
import VideoWorkspacePreferences from './VideoWorkspacePreferences';
import {useDetachedMonitor} from './VideoMonitorWindow';
import {TRACK_HEADER_WIDTH,maxTimelineZoom,useTimelineNavigation,visibleRulerTicks,zoomTimeline} from './useTimelineNavigation';
import {playheadStops,type PlayheadStop} from '../editor/video/playhead-stops';
import {clipKeyLanes} from '../editor/video/clip-key-lanes';
import {keyFrame} from '../editor/video/parameter-keys';
import {clipEnd,closeGap,cutRange,fitSoundtrack,gapAt,loopSpan,makeFirstCut,pasteAttributes,type StarterLayout,type TimeSpan} from '../editor/video/working-edit';
import {finishedExports,readVideoView,saveVideoView,VIDEO_DELIVERIES_CHANGED,type FinishedExport} from '../editor/video/working-storage';
import {useVideoJobs} from './useVideoJobs';
import {useVideoFileDrop,type FileDropTarget} from './useVideoFileDrop';
import {AuditionSoundtrack,PasteClipSettings,ReplaceFootage,StartFromFootage} from './VideoEditDialogs';
import VideoWorkspaceShelf,{type ShelfTab} from './VideoWorkspaceShelf';
import VideoVoiceover,{type VoiceTake} from './VideoVoiceover';
import VideoClipFilmstrip from './VideoClipFilmstrip';
import VideoAudioHandles from './VideoAudioHandles';
import VideoTimelineOverview from './VideoTimelineOverview';
import VideoSourceAnalysis from './VideoSourceAnalysis';
import {createVideoMeterBus} from './VideoLevelMeter';
import {reviewExport} from '../editor/video/export-review';
import {noteCatalogUse} from '../editor/video/catalog-preferences';
import './VideoWorkspace.css';
import './VideoLibraryPane.css';
import './VideoStudioDetails.css';
import './VideoStudioDesign.css';
import {frameTime,magneticFrame} from '../editor/video/timeline-grid';
import {authoredTransitions,type TransitionDrop} from '../editor/video/transition-placement';

type Props = { project: VideoProject;onChange: (next:VideoProject)=>void;onOpenCopy?:(next:VideoProject)=>void;
  onHistoryChange?:(available:{undo:boolean;redo:boolean})=>void };
type MediaPath={path:string;bin?:string};
type ContextTarget={x:number;y:number;time:number;clip?:VideoClip;track:VideoTrack};
type SelectionGesture={pointerId:number;start:number;x:number;y:number;trackId:string};
const INSPECTOR_PAGES=['Video','Audio','Speed','Animation','Adjust','Stylize'] as const;
const VIDEO_PAGES=['Basic','Background','Mask','Retouch'] as const;
const RETOUCH_EFFECTS=[['denoise','Denoise'],['video-deflicker','Deflicker'],['motionblur','Motion blur']] as const;
type ZoomAnchor={seconds:number;pixels:number};
const sec = (t:number) => `${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;
const timecode=(time:number,fps:number)=>{
  const frames=Math.max(0,Math.round(time*fps)),seconds=Math.floor(frames/fps);
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':')
    +'.'+String(frames%fps).padStart(2,'0');
};
const aspectLabel=(width:number,height:number)=>{
  let a=width,b=height;
  while(b){const next=a%b;a=b;b=next;}
  return width/a+':'+height/a;
};
const SnapGlyph=()=> <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
  <path d="M4 3h5v10a3 3 0 0 0 6 0V3h5v10a8 8 0 0 1-16 0zM4 8h5m6 0h5"/>
</svg>;
const num = (value:string, fallback:number) => Number.isFinite(Number(value))?Number(value):fallback;
const cap = (value:number, min:number,max:number)=>Math.max(min,Math.min(max,value));
const boundedTimelineHeight=(height:number)=>cap(height,180,Math.max(180,window.innerHeight*.6));
const sourceKey=(path:string)=>path.replaceAll('\\','/').replace(/^\/\/\?\/UNC\//i,'//').replace(/^\/\/\?\//,'').toLowerCase();

function aroundTime(markers:TimelineMarker[],time:number,count:number) {
  let lo=0,hi=markers.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(markers[mid].time<time)lo=mid+1;else hi=mid;}
  return markers.slice(Math.max(0,lo-count),lo+count);
}

function requiredSourceDuration(project:VideoProject, assetId:string) {
  const visit=(scene:Pick<VideoTimeline,'clips'>):number=>Math.max(0,...scene.clips.map(clip=>clip.assetId===assetId?sourceBounds(clip)[1]:clip.compound?visit(clip.compound):0));
  return Math.max(project.timeline?visit(project.timeline):0,...(project.sequences??[]).map(sequence=>visit(sequence.scene)));
}

type Drag = { id:string;edge:'left'|'right'|'move'; initialX:number; start:number; length:number;guide?:number;
  trackId:string; targetTrackId:string; delta:number; pointerId:number; ids:string[]; scrollLeft:number };
export default function VideoWorkspace({project,onChange,onOpenCopy,onHistoryChange}:Props){
  const fallbackTimeline=useRef<VideoTimeline>(defaultTimeline());
  const rootTimeline=project.timeline??fallbackTimeline.current;
  const [compoundPath,setCompoundPath]=useState<string[]>([]);
  const scenePath=useRef(compoundPath);scenePath.current=compoundPath;
  const timeline=useMemo(()=>sceneAt(rootTimeline,compoundPath),[rootTimeline,compoundPath]);
  const audioPlan=useMemo(()=>timelineAudioSources(timeline),[timeline]);
  const [previewQuality,setPreviewQuality]=useState(0);
  const [monitorMuted,setMonitorMuted]=useState(false),[monitorTools,setMonitorTools]=useState(false);
  const [timelineTools,setTimelineTools]=useState(false),[panTimeline,setPanTimeline]=useState(false);
  const monitorStage=useRef<HTMLElement>(null);
  const panning=useRef<{id:number;x:number;y:number;left:number;top:number}|undefined>(undefined);
  const [cacheRequest,setCacheRequest]=useState(0);
  const [sliderScrubbing,setSliderScrubbing]=useState(false);
  const [gradeBypass,setGradeBypass]=useState<string>();
  const [trackGuide,setTrackGuide]=useState<string>();
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.at(-1);
  const selectedIds = useMemo(() => new Set(selection), [selection]);
  const clipboard = useRef<ClipClipboard | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [followHead,setFollowHead]=useState(true);
  const [inspectorPage,setInspectorPage]=useState<typeof INSPECTOR_PAGES[number]>('Video');
  const [videoPage,setVideoPage]=useState<typeof VIDEO_PAGES[number]>('Basic');
  const [transformClip,setTransformClip]=useState<string>(),[gradeMask,setGradeMask]=useState(false);
  const [autoKey,setAutoKey]=useState(false),[keyLanesOpen,setKeyLanesOpen]=useState(false);
  const [retouchBypass,setRetouchBypass]=useState<string>();
  const [beatSnap, setBeatSnap] = useState(true);
  const [rippleTrims,setRippleTrims]=useState(false);
  const [beatBusy,setBeatBusy]=useState(false);
  const [showPacing,setShowPacing]=useState(false);
  const analyzed=useRef(new Set<string>()),analysisActive=useRef(false);
  const [analysisTick,setAnalysisTick]=useState(0);
  const setSelected = (id: string | null) => setSelection(id ? [id] : []);
  const [head,setHead]=useState(0);
  const [transport]=useState(()=>new VideoPlaybackTransport());
  const [tailPreview,setTailPreview]=useState<{head:number;time:number}>();
  const [clockDraft,setClockDraft]=useState<string>();
  const [playing,setPlaying]=useState(false);
  const [direction,setDirection]=useState<1|-1>(1);
  const [zoom,setZoom]=useState(60);
  const zoomDrag=useRef<{id:number;y:number;zoom:number;anchor:ZoomAnchor}|undefined>(undefined);
  const zoomWheel=useRef<(event:WheelEvent)=>void>(()=>{});
  const [preferences,setPreferences]=useState(readStudioPreferences);
  const snap=preferences.magnet;
  const [preferencesOpen,setPreferencesOpen]=useState<'layout'|'commands'>();
  const [timelineHeight,setTimelineHeight]=useState(()=>boundedTimelineHeight(preferences.layout.timeline));
  const timelineSection=useRef<HTMLElement>(null);
  const resizeTimeline=useRef<{y:number;height:number}|null>(null),heightValue=useRef(timelineHeight);heightValue.current=timelineHeight;
  const [drag,setDrag]=useState<Drag|null>(null);
  const [sources,setSources]=useState<Record<string,string>>({});
  const [capabilities,setCapabilities]=useState<MediaCapabilities|null>(null);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [exportOpen,setExportOpen]=useState(false);
  const [sourceAnalysis,setSourceAnalysis]=useState<'scene'|'loudness'>();
  const [meters]=useState(createVideoMeterBus);
  const [editorialOpen,setEditorialOpen]=useState(false);
  const [proxies,setProxies]=useState<Record<string,{input:string;revision:number;path:string}>>({});
  const proxyOff=useRef(new Set<string>());
  const [proxyRefresh,refreshProxies]=useState(0);
  const [audition,setAudition]=useState<{card:VideoLibraryCard;name:string;clipId:string;scene:string}>();
  const auditionDelay=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(auditionDelay.current),[]);
  const [offline,setOffline]=useState<Record<string,string>>({});
  const shell=useRef<HTMLElement|null>(null);
  const [shelf,setShelf]=useState<ShelfTab>();
  const [exports,setExports]=useState(finishedExports);
  const jobs=useVideoJobs(project.id);
  const [starter,setStarter]=useState(false),[replaceId,setReplaceId]=useState<string>();
  const [attributeSource,setAttributeSource]=useState<VideoClip>(),[attributesOpen,setAttributesOpen]=useState(false);
  const [contextMenu,setContextMenu]=useState<ContextTarget>();
  const [folderTarget,setFolderTarget]=useState<VideoTrack>(),[folderName,setFolderName]=useState('');
  const [collapsed,setCollapsed]=useState<string[]>([]);
  const [rangeMode,setRangeMode]=useState<'box'|'range'>(),[range,setRange]=useState<TimeSpan>();
  const rangeGesture=useRef<SelectionGesture|null>(null);
  const [loop,setLoop]=useState<TimeSpan>(),looping=useRef(loop);looping.current=loop;
  const timelineSpan=range??loop,markedRange=!!range&&!rangeMode;
  const [skim,setSkim]=useState<number>(),[filmstrip,setFilmstrip]=useState(true);
  const [original,setOriginal]=useState(false),[compare,setCompare]=useState(false),[divider,setDivider]=useState(50);
  const [titleEdit,setTitleEdit]=useState<{id:string;text:string}>(),[guide,setGuide]=useState(false);
  const guideInset=project.sequence?.safeInset??12;
  const [voiceover,setVoiceover]=useState(false),voiceStart=useRef(0);
  const [soundtrack,setSoundtrack]=useState<{parts:VideoClip[];track:VideoTrack;span:TimeSpan;original:VideoClip}>();
  const [relinkReview,setRelinkReview]=useState<{asset:VideoAsset;replacement:VideoAsset;url:string}[]>();
  const [fonts,setFonts]=useState<string[]>();
  const gesture=useRef<VideoProject|null>(null);
  const [lastExport,setLastExport]=useState<NativeExportReport|null>(null);
  useEffect(()=>{
    const finished=(event:Event)=>{
      const items=(event as CustomEvent<FinishedExport[]>).detail;
      setExports(items);
      if(items[0])setLastExport(items[0]);
    };
    window.addEventListener(VIDEO_DELIVERIES_CHANGED,finished);
    return()=>window.removeEventListener(VIDEO_DELIVERIES_CHANGED,finished);
  },[]);
  const fileInput=useRef<HTMLInputElement>(null);
  const importMode=useRef<'media'|'audio'|'stickers'>('media');
  const history=useRef<VideoProject[]>([]), future=useRef<VideoProject[]>([]);
  const moving=useRef<Drag|null>(null), moveFrame=useRef(0);
  const selectedClip=timeline.clips.find(c=>c.id===selected);
  const selectedTrack=timeline.tracks.find(t=>t.id===selectedClip?.trackId);
  const replacementClip=timeline.clips.find(clip=>clip.id===replaceId);
  const assetMap=useMemo(()=>new Map(timeline.assets.map(asset=>[asset.id,asset])),[timeline.assets]);
  const assetOf=(clip:VideoClip)=>assetMap.get(clip.assetId??'');
  const selectedAsset=selectedClip?assetOf(selectedClip):undefined;
  const inspectorPages=INSPECTOR_PAGES.filter(page=>{
    if(selectedClip?.adjustment)return page==='Adjust'||page==='Stylize';
    if(selectedTrack?.kind==='audio')return page==='Audio'||page==='Speed';
    if(page==='Audio')return !!selectedClip?.compound||selectedAsset?.kind==='video'&&selectedAsset.hasAudio!==false;
    if(page==='Speed')return selectedAsset?.kind==='video'||selectedAsset?.kind==='audio';
    return true;
  });
  const activeInspector=inspectorPages.includes(inspectorPage)?inspectorPage:inspectorPages[0];
  const credits=useMemo(()=>{
    const audible=new Set(audioPlan.map(source=>source.assetId));
    return recordingCredits(timeline.assets.flatMap(asset=>asset.credit&&audible.has(asset.id)?[asset.credit]:[]));
  },[timeline]);
  const total = useMemo(() => durationOf(timeline), [timeline]);
  const PX = zoom;
  const zoomMax=maxTimelineZoom(project.fps);
  const previewHead = !playing&&tailPreview?.head===head?tailPreview.time:total > 0 && Math.abs(head - total) < 1e-6
    ? Math.max(0, (Math.ceil(total * project.fps) - 1) / project.fps)
    : Math.floor((head + 1e-7) * project.fps) / project.fps;
  const seekTo=(time:number,stop?:PlayheadStop)=>{
    const next=cap(frameTime(time,project.fps),0,length);
    setPlaying(false);setHead(next);setTailPreview(stop?.tailFrame===undefined?undefined:{head:next,time:stop.tailFrame/project.fps});
  };
  const stops=useMemo(()=>playheadStops(timeline,project.fps,collapsed),[timeline,project.fps,collapsed]);
  const navigation=useTimelineNavigation(zoom,seekTo,{enabled:snap,fps:project.fps,stops});
  const length = Math.min(MAX_TIMELINE, Math.max(15,total+5,(timeline.markers?.at(-1)?.time??0)+1,navigation.viewport.width/PX));
  const viewportWidth = Math.ceil(length * PX);
  const clipClock:KeyClock={time:head-(selectedClip?.start??0),fps:project.fps,auto:autoKey,duration:selectedClip?.duration,
    active:!!selectedClip&&head>=selectedClip.start-1e-7&&head<=clipEnd(selectedClip)+1e-7&&!selectedTrack?.locked,
    onSeek:time=>selectedClip&&seekTo(selectedClip.start+time)};
  const primaryVideo=[...timeline.tracks].reverse().find(track=>track.kind==='video'&&track.purpose!=='adjustment')?.id;
  const fileDrop=useVideoFileDrop(shell,navigation.timeAt,(input,target)=>{
    if(busy)return;
    importMode.current='media';
    if(typeof input[0]==='string')void scanDropped(input as string[],target);
    else{
      const files=input as File[];
      void importPaths(files.map(file=>'browser:'+crypto.randomUUID()+'/'+file.name),files,target);
    }
  });
  const sceneKey = JSON.stringify([project.id, project.sequence?.id, compoundPath]);
  const libraryDrag = useVideoLibraryDrag({
    scroll: navigation.scroll, timeAt: navigation.timeAt, pixelsPerSecond: zoom, sceneKey,
    resolve: (card, hit) => card.kind === 'asset' && offline[card.id] ? undefined : resolveLibraryDrop(latestModel.current.timeline,card,hit,project.fps),
    drop: dropLibraryCard,
  });
  const { interval, ticks } = visibleRulerTicks(navigation.viewport.x, navigation.viewport.width, zoom, length, project.fps);
  const liveClips = useMemo(() => activeClips(timeline, previewHead), [timeline, previewHead]);
  const gradeDisplay=useMemo(()=>selected&&(gradeBypass===selected||retouchBypass===selected)
    ?{...timeline,clips:timeline.clips.map(clip=>{
      if(clip.id!==selected)return clip;
      const next={...clip};
      if(gradeBypass===selected)next.grade=undefined;
      if(retouchBypass===selected){
        next.smart=clip.smart?{...clip.smart,stabilization:undefined,reframe:false}:undefined;
        next.effects=clip.effects?.filter(effect=>!RETOUCH_EFFECTS.some(([kind])=>kind===effect.kind));
      }
      return next;
    })}:timeline,[timeline,gradeBypass,retouchBypass,selected]);
  const activeAudition=!playing&&!libraryDrag.hover&&audition&&audition.clipId===selected&&audition.scene===sceneKey?audition:undefined;
  const auditionResult=useMemo(()=>activeAudition
    ?applyLibraryClipCard(gradeDisplay,activeAudition.card,activeAudition.clipId,undefined,project.fps):undefined,[activeAudition,gradeDisplay,project.fps]);
  const transitionSpans=useMemo(()=>authoredTransitions(timeline,project.fps),[timeline,project.fps]);
  const selectedTransition=selected?transitionSpans.find(span=>span.from?.id===selected||span.to?.id===selected):undefined;
  const transitionGuide=libraryDrag.hover?.target?.transition?.at??selectedTransition?.to?.start??selectedTransition?.end;
  const proxyIds=useMemo(()=>new Set(timeline.assets.filter(asset=>proxies[asset.id]?.input===asset.path
    &&proxies[asset.id].revision===(asset.revision??0)).map(asset=>asset.id)),[timeline.assets,proxies]);
  const proxyAssets=useMemo(()=>proxyIds.size?timeline.assets.map(asset=>proxyIds.has(asset.id)?{...asset,path:proxies[asset.id].path}:asset):timeline.assets,
    [timeline.assets,proxyIds,proxies]);
  useEffect(()=>{
    if(!isNativeMediaDesktop())return;
    const inputs=timeline.assets.filter(asset=>asset.kind==='video'&&!asset.missing&&!asset.path.startsWith('browser:'));
    let cancelled=false;
    if(!inputs.length){setProxies(previous=>Object.keys(previous).length?{}:previous);return;}
    void findCachedProxies(inputs.map(asset=>asset.path)).then(paths=>{
      if(cancelled)return;
      setProxies(Object.fromEntries(inputs.flatMap((asset,i)=>paths[i]&&!proxyOff.current.has(project.id+':'+asset.id)
        ?[[asset.id,{input:asset.path,revision:asset.revision??0,path:paths[i]!}]]:[])));
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[timeline.assets,project.id,proxyRefresh]);
  const visibleTimeline=auditionResult?.timeline??gradeDisplay;
  const displayTimeline=useMemo(()=>proxyIds.size?{...visibleTimeline,assets:proxyAssets}:visibleTimeline,[proxyIds,visibleTimeline,proxyAssets]);
  const displayHead=auditionResult&&activeAudition
    ?librarySampleTime(activeAudition.card,auditionResult.clip,previewHead,project.fps):!playing&&skim!==undefined?skim:previewHead;
  const displayClips=useMemo(()=>auditionResult||displayHead!==previewHead?activeClips(displayTimeline,displayHead):liveClips,[auditionResult,displayTimeline,displayHead,previewHead,liveClips]);
  const originalTimeline=useMemo(()=>selected?{...displayTimeline,clips:displayTimeline.clips.map(clip=>clip.id===selected
    ?{...clip,effects:[],grade:undefined}:clip)}:displayTimeline,[displayTimeline,selected]);
  const monitorScene=useMemo(()=>({timeline:displayTimeline,width:project.width,height:project.height,fps:project.fps,quality:previewQuality,key:sceneKey}),
    [displayTimeline,project.width,project.height,project.fps,previewQuality,sceneKey]);
  const interactivePreview=skim!==undefined||navigation.scrubbing||sliderScrubbing||gesture.current!==null||playing&&direction===-1;
  const monitorClock=useMemo(()=>({time:displayHead,playing:playing&&direction===1,interactive:interactivePreview,key:sceneKey}),
    [displayHead,playing,direction,interactivePreview,sceneKey]);
  const openMonitor=useDetachedMonitor(monitorScene,monitorClock);
  const visibleStart = (navigation.viewport.x - 180) / zoom;
  const visibleEnd = (navigation.viewport.x + navigation.viewport.width + 180) / zoom;
  const markers=useMemo(()=>[...timeline.markers??[]].sort((a,b)=>a.time-b.time),[timeline.markers]);
  const beats=useMemo(()=>markers.filter(marker=>marker.kind==='beat'),[markers]);
  const nearbyMarkers=showPacing?aroundTime(markers,head,16):[];
  const nearestBeat=showPacing?aroundTime(beats,head,1).sort((a,b)=>Math.abs(a.time-head)-Math.abs(b.time-head))[0]:undefined;
  const visibleMarkers=useMemo(()=>markers.filter(marker=>marker.time>=visibleStart&&marker.time<=visibleEnd)
    .filter((marker,index,markers)=>index===0||(marker.time-markers[index-1].time)*zoom>=4),[markers,visibleStart,visibleEnd,zoom]);
  const clipsByTrack = useMemo(() => {
    const lanes = new Map<string, VideoClip[]>();
    for (const clip of timeline.clips) {
      const clips = lanes.get(clip.trackId) ?? [];
      clips.push(clip);
      lanes.set(clip.trackId, clips);
    }
    return lanes;
  }, [timeline.clips]);

  const latestModel=useRef({project,timeline});latestModel.current={project,timeline};
  const activeProject=useRef<string|null>(project.id);
  useEffect(()=>{activeProject.current=project.id;return()=>{activeProject.current=null;};},[project.id]);
  const publish = useCallback((next: VideoProject) => {
    latestModel.current = { project: next, timeline: sceneAt(next.timeline ?? fallbackTimeline.current,scenePath.current) };
    onChange(next);
  }, [onChange]);

  function remember(before: VideoProject) {
    history.current.push(before);
    if (history.current.length > 75) history.current.shift();
    future.current = [];
  }

  const commitProject = useCallback((next: VideoProject) => {
    const current = latestModel.current.project;
    if (activeProject.current !== current.id || next === current) return;
    const before=gesture.current??current;
    gesture.current = null;
    remember(before);
    publish(syncVariantCuts(before,next));
  }, [publish]);

  const commit = useCallback((updated: VideoTimeline) => {
    const snapshot = latestModel.current;
    if (updated !== snapshot.timeline) commitProject({ ...snapshot.project,
      timeline: replaceScene(snapshot.project.timeline??fallbackTimeline.current,scenePath.current,updated) });
  }, [commitProject]);

  function undo() {
    const current = latestModel.current.project;
    const previous = gesture.current ?? history.current.pop();
    if (!previous) return;
    gesture.current = null;
    future.current.push(current);
    publish(previous);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(latestModel.current.project);
    publish(next);
  }

  function finishGesture() {
    const before = gesture.current;
    if (!before) return;
    gesture.current = null;
    const current = latestModel.current.project;
    if (before !== current) {
      remember(before);
      publish(syncVariantCuts(before,{...current}));
    }
  }

  function previewTimeline(updated: VideoTimeline) {
    const current = latestModel.current.project;
    if (!gesture.current) gesture.current = current;
    publish({ ...current, timeline: replaceScene(current.timeline??fallbackTimeline.current,scenePath.current,updated) });
  }
  function cancelGesture() {
    const before=gesture.current;
    gesture.current=null;
    if(before)publish(before);
  }

  function changeScene(path: string[]) {
    finishGesture();
    setPlaying(false);
    setHead(0);
    setTailPreview(undefined);
    setLoop(undefined);setRange(undefined);setSkim(undefined);
    setSelection([]);
    setCompoundPath(path);
    if(navigation.scroll.current)navigation.scroll.current.scrollLeft=0;
  }

  function updateEffects(effects:VideoEffect[],preview=false) {
    if(preview&&!gesture.current&&selectedClip&&(previewHead<selectedClip.start||previewHead>=clipEnd(selectedClip))){
      const effect=effects.find(item=>item.enabled&&VIDEO_EFFECT_LOOKUP.get(item.kind)?.temporal)??effects.at(-1);
      if(effect)seekTo(librarySampleTime({kind:'effect',id:effect.kind},selectedClip,selectedClip.start+selectedClip.duration/2,project.fps));
    }
    updateClip({effects},preview);
  }
  function updateClip(next:Partial<VideoClip>,preview=false) {
    const snapshot=latestModel.current;
    if(!selectedClip||snapshot.project.id!==project.id||snapshot.project.sequence?.id!==project.sequence?.id
      ||scenePath.current.join('/')!==compoundPath.join('/'))return;
    const current=snapshot.timeline.clips.find(clip=>clip.id===selectedClip.id);
    if(!current||snapshot.timeline.tracks.find(track=>track.id===current.trackId)?.locked)return;
    if(current.linkId&&snapshot.timeline.clips.some(clip=>clip.id!==current.id&&clip.linkId===current.linkId)
      &&(next.duration!==undefined&&next.duration!==current.duration||'holdFrame' in next||'sourceMap' in next)){
      setError('Unlink this clip before changing its timing.');return;
    }
    const updated={...current,...next};
    if(next.title!==undefined&&current.caption&&!next.caption)updated.caption={...current.caption,words:undefined};
    if(updated.fadeIn+updated.fadeOut>updated.duration)updated.fadeOut=Math.max(0,updated.duration-updated.fadeIn);
    const result={...snapshot.timeline,clips:snapshot.timeline.clips.map(clip=>clip.id===current.id?updated:clip)};
    if(preview)previewTimeline(result);else commit(result);
  }
  useEffect(()=>{void nativeMediaCapabilities().then(setCapabilities).catch(()=>setCapabilities(null));},[]);
  useEffect(()=>{if(isNativeMediaDesktop())void invoke<string[]>('list_system_fonts').then(setFonts).catch(()=>{});},[]);
  useEffect(()=>{
    const actions=[['export',exportVideo],['undo',undo],['redo',redo]] as const;
    for(const [name,handler] of actions)window.addEventListener('huelith-video-'+name,handler);
    return()=>{for(const [name,handler] of actions)window.removeEventListener('huelith-video-'+name,handler);};
  });
  const canUndo=history.current.length>0,canRedo=future.current.length>0;
  useEffect(()=>onHistoryChange?.({undo:canUndo,redo:canRedo}),[onHistoryChange,canUndo,canRedo]);
  useEffect(()=>{
    let cancelled=false;
    void Promise.allSettled(timeline.assets.map(async asset=>({id:asset.id,url:await mediaUrl(asset)}))).then(results=>{
      if(cancelled)return;const urls:Record<string,string>={},missing:Record<string,string>={};
      results.forEach((result,index)=>{if(result.status==='fulfilled')urls[result.value.id]=result.value.url;
        else missing[timeline.assets[index].id]=String(result.reason);});
      setSources(urls);setOffline(missing);
    });return()=>{cancelled=true;};
  },[timeline.assets,project.id]);
  const sequenceId=project.sequence?.id??'main';
  const lastScene=useRef<{projectId:string;sequenceId:string}|undefined>(undefined);
  const restoreSequence=useRef<string|undefined>(undefined);
  useEffect(()=>{
    setSources({});setOffline({});setBusy(false);setProgress('');setLoop(undefined);setRange(undefined);
    setShelf(undefined);history.current=[];future.current=[];gesture.current=null;clipboard.current=null;setCanPaste(false);
    return()=>clearMediaUrls();
  },[project.id]);
  useEffect(()=>{
    const projectChanged=lastScene.current?.projectId!==project.id;
    const sequenceChanged=lastScene.current?.sequenceId!==sequenceId;
    lastScene.current={projectId:project.id,sequenceId};
    if(!projectChanged&&restoreSequence.current!==sequenceId){
      if(sequenceChanged)changeScene([]);
      return;
    }
    const saved=readVideoView(project.id);
    if(projectChanged&&saved?.sequenceId&&saved.sequenceId!==sequenceId){
      const switched=switchSequence(project,saved.sequenceId);
      if(switched!==project){
        restoreSequence.current=saved.sequenceId;
        publish(switched);
        return;
      }
    }
    restoreSequence.current=undefined;
    const savedScene=saved?.sequenceId===sequenceId?saved:undefined;
    const restored=savedScene?sceneAt(rootTimeline,savedScene.path):rootTimeline;
    setPlaying(false);
    setHead(savedScene?cap(savedScene.head,0,durationOf(restored)):0);
    setSelection(savedScene?savedScene.selection.filter(id=>restored.clips.some(clip=>clip.id===id)):[]);
    setZoom(saved?cap(saved.zoom,.04,zoomMax):60);
    setCompoundPath(restored===rootTimeline?[]:savedScene!.path);
  },[project.id,sequenceId]);
  const viewPosition=useRef({head,zoom,selection,path:compoundPath,sequenceId});
  viewPosition.current={head,zoom,selection,path:compoundPath,sequenceId};
  useEffect(()=>{
    if(playing)return;
    const timer=setTimeout(()=>saveVideoView(project.id,viewPosition.current),180);
    return()=>clearTimeout(timer);
  },[project.id,sequenceId,head,zoom,selection,compoundPath,playing]);
  useEffect(()=>{
    const save=()=>saveVideoView(project.id,viewPosition.current);
    window.addEventListener('pagehide',save);
    const timer=playing?setInterval(save,550):undefined;
    return()=>{window.removeEventListener('pagehide',save);clearInterval(timer);};
  },[project.id,playing]);
  useEffect(()=>{if(compoundPath.length&&timeline===rootTimeline)changeScene([]);},[timeline,rootTimeline,compoundPath]);
  useEffect(()=>{
    if(busy||playing||analysisActive.current)return;
    const asset=rootTimeline.assets.find(item=>item.kind!=='image'&&item.waveform===undefined&&item.hasAudio!==false
      && !!sources[item.id]&&sceneUsesAsset(timeline,item.id)&&!analyzed.current.has(`${item.id}:${item.revision??0}:${item.path}`));
    if(!asset)return;
    const key=`${asset.id}:${asset.revision??0}:${asset.path}`,origin=project.id;
    analyzed.current.add(key);analysisActive.current=true;
    void analyzeAudio(asset,sources[asset.id]).then(result=>{
      const current=latestModel.current.project,root=current.timeline;
      if(activeProject.current!==origin||!root||!root.assets.some(item=>item.id===asset.id&&item.path===asset.path&&item.revision===asset.revision))return;
      publish({...current,timeline:{...root,assets:root.assets.map(item=>item.id===asset.id?{...item,hasAudio:result.hasAudio,waveform:result.waveform}:item)}});
    }).catch(()=>{}).finally(()=>{analysisActive.current=false;if(activeProject.current)setAnalysisTick(value=>value+1);});
  },[rootTimeline.assets,timeline.clips,sources,busy,playing,analysisTick,project.id,publish]);
  useEffect(()=>{
    const scroll=navigation.scroll.current;
    if(!followHead||navigation.scrubbing||!scroll)return;
    const x=head*zoom,width=scroll.clientWidth-TRACK_HEADER_WIDTH;
    if(x<scroll.scrollLeft||x>scroll.scrollLeft+width-10)scroll.scrollLeft=Math.max(0,x-width*.2);
  },[head,zoom,followHead,navigation.scrubbing]);
  useLayoutEffect(() => {
    if (!playing) return;
    transport.start(cap(head, 0, total),total,direction,()=>looping.current,audioPlan.length>0,true);
    let publishedAt = -Infinity;
    function tick(timestamp: number) {
      const time = transport.time();
      const ended = direction === 1 ? time >= total : time <= 0;
      if (ended || timestamp - publishedAt >= 1000 / 30) {
        publishedAt = timestamp;
        setHead(time);
      }
      if (ended) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    }

    let frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); transport.pause(); };
    // Sample the playhead once when this run begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total, direction]);
  useEffect(()=>{
    function key(e:KeyboardEvent){const target=e.target as HTMLElement;
      const space=e.code==='Space'||e.key===' '||e.key==='Spacebar';
      const unmodified=!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey;
      const letter=e.key.toLowerCase(),mark=unmodified?(letter==='i'?'start':letter==='o'?'end':undefined):undefined;
      const timelineRange=target instanceof HTMLInputElement&&target.type==='range'&&
        (space||e.ctrlKey||e.metaKey||e.key==='Escape'||!!mark&&!!target.closest('.hv-timeline'));
      if((!timelineRange&&['INPUT','TEXTAREA','SELECT','VIDEO','AUDIO'].includes(target.tagName))
        ||target.isContentEditable||document.querySelector('[role="dialog"][aria-modal="true"]')||e.defaultPrevented)return;
      if(e.altKey&&e.code==='KeyB'&&selectedClip){e.preventDefault();setOriginal(true);return;}
      if(e.key==='Escape'){setContextMenu(undefined);clearTimelineRange();setSkim(undefined);setMonitorTools(false);setTimelineTools(false);return;}
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.code==='KeyK'){e.preventDefault();setPreferencesOpen('commands');return;}
      if(unmodified){
        const command=VIDEO_COMMANDS.find(([id])=>preferences.keys[id]===e.code);
        if(command){e.preventDefault();if(!e.repeat||command[0]==='previous'||command[0]==='next')runCommand(command[0]);return;}
        if(mark){e.preventDefault();if(!e.repeat)markTimelineRange(mark);return;}
      }
      if(e.altKey&&(e.code==='BracketLeft'||e.code==='BracketRight')){
        e.preventDefault();jumpKey(e.code==='BracketLeft'?-1:1);return;
      }
      if(space&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&
        (target.tagName!=='BUTTON'||!target.matches(':focus-visible')||navigation.scroll.current?.contains(target))){
        e.preventDefault();if(!e.repeat)togglePlayback();return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); stepFrame(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey ? 10 : 1);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) { e.preventDefault(); deleteSelected(e.shiftKey); }
      if (!(e.ctrlKey || e.metaKey)) { if (e.key.toLowerCase()==='m') addMarker('marker'); return; }
      switch (e.key.toLowerCase()) {
        case 'b': if(!e.altKey){e.preventDefault();if(!e.repeat)split();} break;
        case 'z': e.preventDefault(); if (e.shiftKey) redo(); else undo(); break;
        case 'y': e.preventDefault(); redo(); break;
        case 'a': e.preventDefault(); setSelection(timeline.clips.map(clip => clip.id)); break;
        case 'c': if (selection.length) { e.preventDefault(); copySelection(); } break;
        case 'x': if (selection.length) { e.preventDefault(); copySelection(); deleteSelected(); } break;
        case 'v': if (clipboard.current) { e.preventDefault(); pasteSelection(); } break;
        case 'd': if (selection.length) { e.preventDefault(); duplicateSelection(); } break;
      }
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
    // undo/redo are intentionally scoped to this video editor; global project-save shortcuts stay in App.
  });
  useEffect(()=>{
    const release=(event:KeyboardEvent)=>{if(event.code==='KeyB'||event.key==='Alt')setOriginal(false);};
    const blur=()=>setOriginal(false);
    window.addEventListener('keyup',release);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keyup',release);window.removeEventListener('blur',blur);};
  },[]);

  async function addDesktopFiles(mode:'media'|'audio'|'stickers'='media'){
    if(busy)return;
    const {open}=await import('@tauri-apps/plugin-dialog');
    const extensions=mode==='stickers'?['png','gif','jpg','jpeg','bmp','tga','webp']:mode==='audio'?['mp3','wav','m4a','aac','ogg','flac']:['mp4','mov','m4v','webm','wmv','avi','mkv','mp3','wav','m4a','aac','ogg','flac','png','jpg','jpeg','webp','bmp','gif','tga'];
    const files=await open({multiple:true,filters:[{name:mode==='stickers'?'Stickers':mode==='audio'?'Audio':'Media',extensions}]});
    if(!files)return;
    const paths=Array.isArray(files)?files:[files];
    await importPaths(paths);
  }
  async function scanDropped(paths:string[],target?:FileDropTarget){
    if(!paths.length||busy)return;
    setBusy(true);
    try{
      const items=await invoke<MediaPath[]>('video_scan_media',{paths});
      if(!isCurrentScene())return;
      if(!items.length)throw Error('No supported media was found in this drop.');
      await importPaths(items.map(item=>item.path),undefined,target,items.map(item=>item.bin));
    }catch(reason){if(isCurrentScene())setError(String(reason));}
    finally{if(activeProject.current===project.id)setBusy(false);}
  }
  async function chooseMediaFolder(){
    try{
      const {open}=await import('@tauri-apps/plugin-dialog');
      const folder=await open({directory:true,multiple:false,title:'Import a media folder'});
      if(folder&&isCurrentScene()){importMode.current='media';await scanDropped([folder]);}
    }catch(reason){setError(String(reason));}
  }
  async function importPaths(paths:string[],webFiles?:File[],target?:FileDropTarget,bins?:(string|undefined)[]){
    setBusy(true);setError('');setNotice('');
    const origin=project.id,imported:VideoAsset[]=[],insertions:VideoAsset[]=[],skipped:string[]=[];
    const mode=importMode.current;
    const seen=new Map(latestModel.current.timeline.assets.filter(asset=>!!asset.sticker===(mode==='stickers')&&!asset.crop&&!asset.missing)
      .map(asset=>[sourceKey(asset.recordingPath??asset.path),asset]));
    let reused=0;
    const finishImport=()=>{
      const latest=latestModel.current;
      if((!imported.length&&!(target&&insertions.length))||activeProject.current!==origin||latest.project.id!==origin)return;
      let next=imported.length?{...latest.timeline,assets:[...latest.timeline.assets,...imported.filter(a=>!latest.timeline.assets.some(b=>b.id===a.id))]}:latest.timeline;
      if(target&&isCurrentScene()){
        const track=next.tracks.find(item=>item.id===target.trackId);
        if(!track||track.locked){setNotice('Media imported. The destination track is locked.');commit(next);return;}
        let at=magneticFrame(next,target.time,project.fps,new Set(),snap?8/PX:0,{head,beats:beatSnap}).time;
        const placed:string[]=[];
        for(const asset of insertions){
          try{
            const result=placeLibraryMedia(next,asset,at,track.id,undefined,project.fps);
            next=result.timeline;at=clipEnd(result.clip);placed.push(result.clip.id);
          }catch(reason){skipped.push(asset.name+' (placement: '+String(reason).replace(/^Error: /,'')+')');}
        }
        if(placed.length){setSelection(placed);seekTo(target.time);}
      }
      commit(next);
    };
    try {
      for(let i=0;i<paths.length;i++){
        if(activeProject.current!==origin)break;
        const path=paths[i],name=path.split(/[\\/]/).pop()??'Media',kind=classifyMedia(name);
        if(!kind||mode==='stickers'&&kind!=='image'||mode==='audio'&&kind!=='audio'){skipped.push(name+' (unsupported type)');continue;}
        const existing=seen.get(sourceKey(path));
        if(existing){reused++;insertions.push(existing);continue;}
        if(latestModel.current.timeline.assets.length+imported.length>=512){skipped.push(name+' (library full)');continue;}
        const file=webFiles?.[i];
        const asset=makeAsset(name,path,kind,0);
        try{
        if(kind==='video'&&/\.mkv$/i.test(name)&&!file){
          setProgress('Preparing editing master · '+name);
          const [prepared]=await prepareRecording(path,'master',project.fps);
          asset.path=prepared.path;asset.recordingPath=path;
        }
        if(file)registerBrowserFile(asset.id,file);
        let url=await mediaUrl(asset);
        let metadata;
        try{metadata=await mediaMetadata(url,kind,name);}
        catch(error){
          if(file||kind!=='video'||asset.recordingPath||!isNativeMediaDesktop())throw error;
          setProgress('Preparing editing master · '+name);
          const [prepared]=await prepareRecording(path,'master',project.fps);
          asset.path=prepared.path;asset.recordingPath=path;
          url=await mediaUrl(asset);metadata=await mediaMetadata(url,kind,name);
        }
        if(kind!=='image'&&metadata.duration>MAX_TIMELINE)throw Error(`${name}: source exceeds the six-hour video media limit.`);
        if(kind!=='image'&&metadata.duration<.1)throw Error(`${name}: media duration is unavailable or the codec is unsupported`);
        asset.duration=kind==='image'?5:metadata.duration;
        asset.width=metadata.width;asset.height=metadata.height;
        asset.bin=bins?.[i]?.slice(0,80)||undefined;
        if(kind==='video'&&isNativeMediaDesktop()&&!file){
          const native=await probeNativeMedia(asset.path).catch(()=>undefined);
          const rate=native&&native.frameRateNumerator/native.frameRateDenominator;
          if(rate&&rate>=1&&rate<=240)asset.frameRate=rate;
        }
        asset.animated=metadata.animated;asset.animationDuration=metadata.animationDuration;asset.sticker=mode==='stickers';
        if(activeProject.current!==origin)break;
        setSources(s=>({...s,[asset.id]:url}));
        seen.set(sourceKey(path),asset);
        imported.push(asset);insertions.push(asset);
        }catch(error){
          forgetMediaUrl(asset.id);
          skipped.push(name+' ('+String(error).replace(/^Error: /,'').slice(0,160)+')');
        }
      }
      finishImport();
      if(activeProject.current===origin)setNotice([
        imported.length?`${imported.length} imported`:'',reused?`${reused} already in Media`:'',
        skipped.length?`${skipped.length} skipped · ${skipped.join(' · ')}`:'',
      ].filter(Boolean).join(' · '));
    }catch(e){if(activeProject.current===origin)setError(String(e));finishImport();}
    finally{if(activeProject.current===origin){setBusy(false);setProgress('');if(fileInput.current)fileInput.current.value='';}}
  }
  async function recordingTool(asset:VideoAsset,mode:'proxy'|'streams'|'voice'){
    if(mode==='proxy'){
      const cacheKey=project.id+':'+asset.id;
      if(proxyIds.has(asset.id)){
        proxyOff.current.add(cacheKey);
        setProxies(previous=>{const next={...previous};delete next[asset.id];return next;});
        return;
      }
      const name='Proxy · '+asset.name;
      if(jobs.jobs.some(job=>job.name===name&&(job.status==='running'||job.status==='queued')))return;
      const matchingAsset=()=>latestModel.current.project.timeline?.assets.some(item=>
        item.id===asset.id&&item.path===asset.path&&item.revision===asset.revision);
      try{
        jobs.enqueue(name,async(signal,report)=>{
          if(!matchingAsset())throw Error('The source changed. Queue a proxy for the current source.');
          report('Encoding a smaller preview copy…');
          const [output]=await prepareRecording(asset.path,'proxy',project.fps,undefined,signal,preferences.proxyLimitMb);
          report('Checking preview media…',.95);
          await mediaUrl({...asset,path:output.path});
          signal.throwIfAborted();
          if(!matchingAsset())throw Error('The source changed while its proxy was encoding.');
          proxyOff.current.delete(cacheKey);
          setProxies(previous=>({...previous,[asset.id]:{input:asset.path,revision:asset.revision??0,path:output.path}}));
          refreshProxies(value=>value+1);
        });
        setNotice(name+' queued.');
      }catch(error){setError(String(error));}
      return;
    }
    if(busy)return;
    setBusy(true);setError('');setProgress(mode==='voice'?'Cleaning dialogue…':'Separating recording audio…');
    const placement=selectedClip?.assetId===asset.id?selectedClip:undefined;
    try{
      const outputs=await prepareRecording(mode==='streams'?asset.recordingPath??asset.path:asset.path,mode,project.fps);
      if(!isCurrentScene())return;
      const current=latestModel.current.timeline;
      if(!current.assets.some(item=>item.id===asset.id&&item.path===asset.path&&item.revision===asset.revision))return;
      if(current.assets.length+outputs.length>512||current.tracks.length+outputs.length>24||current.clips.length+outputs.length>4096)
        throw Error('Free tracks or media slots before adding these streams.');
      let next=current;
      const anchor=placement&&current.clips.find(clip=>clip.id===placement.id&&clip.assetId===asset.id);
      const linkId=anchor?.linkId??crypto.randomUUID();
      for(const output of outputs){
        const name=mode==='voice'?asset.name+' · Cleaned voice':output.title;
        const audio={...makeAsset(name,output.path,'audio',output.duration),hasAudio:true};
        const lane={id:crypto.randomUUID(),name,kind:'audio' as const,muted:false,locked:false,
          purpose:mode==='voice'?'dialogue' as const:undefined};
        const result=placeLibraryMedia({...next,tracks:[...next.tracks,lane]},audio,anchor?.start??head,lane.id,undefined,project.fps);
        if(anchor&&sourceBounds(anchor)[1]>output.duration+1e-6)throw Error('This audio stream is shorter than the source edit.');
        next={...result.timeline,clips:result.timeline.clips.map(clip=>clip.id===result.clip.id&&anchor
          ?{...clip,sourceIn:anchor.sourceIn,sourceMap:anchor.sourceMap,duration:anchor.duration,volume:anchor.volume,
            volumeKeys:anchor.volumeKeys,fadeIn:anchor.fadeIn,fadeOut:anchor.fadeOut,linkId}:clip)};
      }
      if(anchor){
        if(current.tracks.find(track=>track.id===anchor.trackId)?.locked)throw Error('Unlock the source clip before replacing its audio.');
        next={...next,clips:next.clips.map(clip=>clip.id===anchor.id?{...clip,audioMuted:true,linkId}:clip)};
      }
      commit(next);setNotice(mode==='voice'?'Added cleaned voice to a dialogue track.':`Added ${outputs.length} independent audio stream(s).`);
    }catch(error){if(isCurrentScene())setError(String(error));}
    finally{if(activeProject.current===project.id){setBusy(false);setProgress('');}}
  }
  async function preservePitch(){
    const clip=selectedClip,asset=clip&&assetOf(clip);
    if(busy||!clip||!asset||asset.kind==='image'||asset.hasAudio===false)return;
    setBusy(true);setError('');setProgress('Baking pitch-preserved audio…');
    try{
      if(clip.linkId&&timeline.clips.some(item=>item.id!==clip.id&&item.linkId===clip.linkId))throw Error('Unlink or remove the existing companion audio before baking pitch.');
      const [prepared]=await prepareRecording(asset.path,'pitch',project.fps,pitchTiming(clip));
      if(!isCurrentScene())return;
      const current=latestModel.current.timeline;
      if(!current.clips.includes(clip))throw Error('The source clip changed while preparing the audio.');
      if(current.tracks.length>=24||current.clips.length>=4096||current.assets.length>=512)throw Error('Free a track, clip and media slot first.');
      const audio={...makeAsset(asset.name+' · Preserved pitch',prepared.path,'audio',prepared.duration),hasAudio:true};
      const track={id:crypto.randomUUID(),kind:'audio' as const,name:'Preserved pitch',muted:false,locked:false};
      const linkId=crypto.randomUUID();
      const sound:VideoClip={id:crypto.randomUUID(),trackId:track.id,assetId:audio.id,sourceIn:0,duration:clip.duration,start:clip.start,
        x:0,y:0,scale:1,rotation:0,opacity:1,volume:clip.volume,volumeKeys:clip.volumeKeys,fadeIn:clip.fadeIn,fadeOut:clip.fadeOut,
        audioFadeIn:clip.audioFadeIn,audioFadeOut:clip.audioFadeOut,pan:clip.pan,panKeys:clip.panKeys,channelMode:clip.channelMode,
        voice:clip.voice,ducking:clip.ducking,linkId};
      commit({...current,assets:[...current.assets,audio],tracks:[...current.tracks,track],clips:[
        ...current.clips.map(item=>item.id===clip.id?{...item,linkId,audioMuted:true}:item),sound]});
      setNotice('Pitch-preserved audio is linked to the retimed clip.');
    }catch(error){if(isCurrentScene())setError(String(error));}
    finally{if(activeProject.current===project.id){setBusy(false);setProgress('');}}
  }
  function onFileInput(files:FileList|null){if(!files?.length)return;
    const list=Array.from(files);void importPaths(list.map(f=>`browser:${crypto.randomUUID()}/${f.name}`),list);}
  function insertAsset(asset:VideoAsset,at=head,trackId?:string) {
    if(!isCurrentScene())return false;
    try{
      const result=placeLibraryMedia(latestModel.current.timeline,asset,at,trackId,undefined,project.fps);
      commit(result.timeline);
      setSelected(result.clip.id);
      if(trackId)seekTo(result.clip.start);
      return true;
    }catch(error){setError(String(error));return false;}
  }
  function insertSource(asset:VideoAsset,mode?:'insert'|'overwrite'|'selects'){
    if(!isCurrentScene())return false;
    try{
      const current=latestModel.current.timeline;
      const updated={...current,assets:current.assets.map(item=>item.id===asset.id?asset:item)};
      const at=Math.round(head*project.fps)/project.fps;
      const lane=selectedTrack?.kind===(asset.kind==='audio'?'audio':'video')&&selectedTrack.purpose!=='adjustment'?selectedTrack:undefined;
      if(mode&&lane?.locked)throw Error('Unlock the selected track or choose a different destination.');
      if(mode==='selects'){
        const result=assembleSelects(updated,asset,at,lane?.id);
        commit(result.timeline);setSelection(result.ids);seekTo(at);
      }else{
        const result=mode?placeSourceEdit(updated,asset,at,lane?.id,mode):placeLibraryMedia(updated,asset,at,undefined,undefined,project.fps);
        commit(result.timeline);setSelected(result.clip.id);seekTo(result.clip.start);
      }
      return true;
    }catch(error){setError(String(error));return false;}
  }
  function makeHighlights(ranges:VideoRange[],vertical:boolean){
    try{
      const result=assembleHighlights(timeline,ranges);
      const next=addSequence(project,vertical?'Portrait highlights':'Highlights');
      const width=vertical?Math.max(18,Math.floor(Math.min(next.width,next.height,1080)/18)*18):next.width;
      const height=vertical?width*16/9:next.height;
      const portrait=vertical?{...result,clips:result.clips.map(clip=>result.assets.find(asset=>asset.id===clip.assetId)?.kind==='video'
        &&result.tracks.find(track=>track.id===clip.trackId)?.kind==='video'&&!clip.crop?{...clip,fit:'fill' as const}:clip)}:result;
      commitProject({...next,timeline:portrait,width,height});
      setEditorialOpen(false);changeScene([]);setSelected(null);seekTo(0);
    }catch(error){setError(String(error));}
  }
  async function makeMulticam(method:'timeline'|'waveform'|'timecode'){
    if(busy)return;
    setBusy(true);setProgress(method==='waveform'?'Matching camera waveforms…':'Preparing multicam sequence…');
    try{
      const ids=[...selection],snapshot=latestModel.current;
      let offsets:number[]|undefined;
      if(method==='waveform'){
        const analyses:{waveform:number[];seconds:number}[]=[];
        for(const id of ids){
          const clip=snapshot.timeline.clips.find(item=>item.id===id),asset=clip&&assetOf(clip);
          if(!clip||asset?.kind!=='video')throw Error('Select camera footage with recorded audio.');
          const range=syncSourceRange(clip);
          const result=await analyzeAudio(asset,sources[asset.id],range.start,range.end);
          if(!result.hasAudio)throw Error(asset.name+' has no usable audio for sync.');
          analyses.push({waveform:result.waveform,seconds:range.end-range.start});
          if(!isCurrentScene())return;
        }
        offsets=analyses.map((angle,index)=>index?correlateAngles(analyses[0].waveform,angle.waveform,analyses[0].seconds,angle.seconds,project.fps):0);
      }else if(method==='timecode'){
        const clocks=await Promise.all(ids.map(async id=>{
          const clip=snapshot.timeline.clips.find(item=>item.id===id),asset=clip&&assetOf(clip);
          if(!clip||asset?.kind!=='video')throw Error('Select camera footage with embedded timecode.');
          return await recordingTimecode(asset.recordingPath??asset.path)+clip.sourceIn;
        }));
        offsets=clocks.map(clock=>{
          let offset=clock-clocks[0];
          if(offset>43200)offset-=86400;
          else if(offset<-43200)offset+=86400;
          return Math.round(offset*project.fps)/project.fps;
        });
      }
      if(!isCurrentScene()||snapshot.timeline!==latestModel.current.timeline)throw Error('The source timeline changed while aligning cameras.');
      const aligned=buildMulticam(snapshot.timeline,ids,offsets);
      commitProject({...addSequence(snapshot.project,'Multicam edit'),timeline:aligned});
      setEditorialOpen(false);changeScene([]);
    }finally{if(activeProject.current===project.id){setBusy(false);setProgress('');}}
  }
  async function interchange(mode:'import'|'export'){
    const {open,save}=await import('@tauri-apps/plugin-dialog');
    const {readFile,writeFile}=await import('@tauri-apps/plugin-fs');
    const {dirname}=await import('@tauri-apps/api/path');
    const filters=[{name:'OpenTimelineIO',extensions:['otio']}];
    if(mode==='export'){
      const path=await save({defaultPath:'Timeline.otio',filters});
      if(!path)return '';
      const result=writeOtio(timeline,project.sequence?.name??project.name,project.fps);
      await writeFile(path,new TextEncoder().encode(result.document),{createNew:true});
      return result.warnings.length?result.warnings.join(' '):'OpenTimelineIO file saved.';
    }
    const path=await open({multiple:false,filters});
    if(!path||!isCurrentScene())return '';
    const bytes=await readFile(path);
    if(!isCurrentScene())return '';
    const current=latestModel.current.project;
    const result=readOtio(new TextDecoder().decode(bytes),await dirname(path),current.timeline?.assets);
    if(!isCurrentScene())return '';
    commitProject({...addSequence(current,result.name),timeline:result.timeline,fps:result.fps});
    changeScene([]);
    return result.warnings.length?result.warnings.join(' '):'Imported as a new sequence.';
  }
  function insertTitle(){insertText(undefined,head,undefined,'Your title');}
  function insertGraphic(id:string,at=head,trackId?:string){
    const graphic=VIDEO_SHAPES.find(item=>item.shape.kind===id);
    if(!graphic)return;
    try{
      const current=latestModel.current.timeline;
      if(current.clips.length>=4096)throw Error('The timeline clip limit is reached.');
      const result=addTitle(current,at,graphic.name,trackId);
      commit({...result.timeline,clips:result.timeline.clips.map(clip=>clip.id===result.clip.id?{...clip,shape:graphic.shape}:clip)});
      setSelected(result.clip.id);seekTo(result.clip.start);
    }catch(error){setError(String(error));}
  }
  function animateBeats(effectId?:string){
    if(!selectedClip)return;
    try{
      if(!effectId){
        const points=beatPulsePoints(selectedClip,beats,selectedClip.scale,Math.min(8,selectedClip.scale*1.14));
        updateClip({keyframes:[...selectedClip.keyframes?.filter(key=>key.parameter!=='scale')??[],
          ...points.map(point=>({...point,parameter:'scale' as const}))]});
      }else{
        const effect=selectedClip.effects?.find(item=>item.id===effectId),descriptor=effect&&VIDEO_EFFECT_LOOKUP.get(effect.kind);
        if(!effect||!descriptor)return;
        const change=(descriptor.max-descriptor.min)*.22;
        const peak=effect.amount+change<=descriptor.max?effect.amount+change:Math.max(descriptor.min,effect.amount-change);
        const keys=beatPulsePoints(selectedClip,beats,effect.amount,peak);
        updateEffects((selectedClip.effects??[]).map(item=>item.id===effectId?{...item,keyframes:[
          ...item.keyframes?.filter(key=>key.parameter!=='amount').slice(0,4096-keys.length)??[],
          ...keys.map(key=>({...key,parameter:'amount'}))]}:item));
      }
    }catch(error){setError(String(error));}
  }
  function insertText(template?:TextTemplate,at=head,trackId?:string,fallback='Your text'){try{
    const current=latestModel.current.timeline;
    if(current.clips.length>=4096)throw Error('The timeline clip limit is reached.');
    const added=addTitle(current,at,template?.text??fallback,trackId);
    const result=template?{...added.timeline,clips:added.timeline.clips.map(c=>c.id===added.clip.id?{...c,x:template.x,y:template.y,textStyle:template.style}:c)}:added.timeline;
    commit(result);setSelected(added.clip.id);
    if(trackId)seekTo(added.clip.start);
  }catch(e){setError(String(e));}}
  function isCurrentScene() {
    const active=latestModel.current.project;
    return activeProject.current===project.id && active.id===project.id
      && active.sequence?.id===project.sequence?.id && scenePath.current.join('/')===compoundPath.join('/');
  }
  async function insertSticker(sticker:typeof STICKERS[number],at=head,trackId?:string){try{
    const path=await libraryFilePath(sticker.file);
    if(!isCurrentScene())return;
    const existing=latestModel.current.timeline.assets.find(a=>a.libraryId===sticker.file&&a.crop?.x===sticker.crop.x&&a.crop?.y===sticker.crop.y);
    const asset=existing??{...makeAsset(`${sticker.name}.png`,path,'image',5,1254,1254),libraryId:sticker.file,crop:sticker.crop,sticker:true};insertAsset(asset,at,trackId);
  }catch(e){setError(String(e));}}
  async function insertAudio(item: Recording, at=head, trackId?:string) {
    if (busy) return;
    const origin = project.id;
    const existing = latestModel.current.timeline.assets.find(asset => asset.credit?.sourceUrl === item.sourceUrl);
    if (existing) { insertAsset(existing,at,trackId); return; }
    setBusy(true);
    setError('');
    setProgress(`Downloading ${item.title}…`);
    try {
      const imported = await importRecording(item);
      if (!isCurrentScene()) return;
      const asset = {
        ...makeAsset(imported.name, imported.path ?? `browser:${crypto.randomUUID()}/${imported.name}`, 'audio', imported.duration),
        waveform: imported.waveform, credit: imported.credit,
      };
      if (imported.file) registerBrowserFile(asset.id, imported.file);
      if(!insertAsset(asset,at,trackId))return;
      setNotice(`Added ${item.title} · ${item.license}`);
    } catch (error) {
      if (activeProject.current === origin) setError(String(error));
    } finally {
      if (activeProject.current === origin) { setBusy(false); setProgress(''); }
    }
  }
  function applyClipCard(card:VideoLibraryCard,clipId=selected,time?:number,drop?:TransitionDrop) {
    if(!clipId)return;
    try{
      const result=applyLibraryClipCard(latestModel.current.timeline,card,clipId,drop,project.fps);
      if(!result){if(card.kind==='transition'&&AUTHORED_TRANSITION_LOOKUP.get(card.id)?.group==='Combo')setNotice('Drop the Combo on a cut or inside a clip to split it.');return;}
      commit(result.timeline);
      const {clip}=result;
      if(['effect','filter','transition'].includes(card.kind)){setInspectorPage(clip.adjustment?'Stylize':'Video');setVideoPage('Basic');}
      if(time!==undefined||clip.id!==clipId)setSelected(clip.id);
      if(time!==undefined||card.kind==='transition'||card.kind==='effect'&&VIDEO_EFFECT_LOOKUP.get(card.id)?.temporal
        ||previewHead<clip.start||previewHead>=clip.start+clip.duration)
        seekTo(drop?(drop.start+drop.end)/2:librarySampleTime(card,clip,time??previewHead,project.fps));
    }catch(error){setError(String(error));}
  }

  function auditionCard(card?:VideoLibraryCard,name?:string) {
    clearTimeout(auditionDelay.current);
    if(!card||!name||!selected||playing){setAudition(undefined);return;}
    auditionDelay.current=setTimeout(()=>setAudition({card,name,clipId:selected,scene:sceneKey}),220);
  }

  function insertComposition(id:string,at=head,target?:TimelineDrop) {
    const current=latestModel.current.timeline;
    const assetId=target?current.clips.find(clip=>clip.id===target.clipId)?.assetId:selectedClip?.assetId;
    try{
      const next=applyVideoComposition(current,id,at,assetId,target?.trackId);
      commit(next);
      if(target){
        const placed=next.clips.at(-1);
        if(placed){setSelected(placed.id);seekTo(placed.start);}
      }
    }catch(error){setError(String(error));}
  }

  function dropLibraryCard(card:VideoLibraryCard,target:TimelineDrop) {
    if('id' in card&&['effect','filter','transition','text','sticker'].includes(card.kind))noteCatalogUse(card.kind+':'+card.id);
    setError('');
    if(target.kind==='apply'){
      applyClipCard(card,target.clipId,target.time,target.transition);
      return;
    }
    const at=magneticFrame(timeline,target.time,project.fps,new Set(),snap?8/PX:0,{head,beats:beatSnap}).time,trackId=target.trackId;
    switch(card.kind){
      case 'asset': {
        const asset=latestModel.current.timeline.assets.find(item=>item.id===card.id);
        if(asset)insertAsset(asset,at,trackId);
        break;
      }
      case 'text': {
        const template=TEXT_TEMPLATE_LOOKUP.get(card.id);
        if(template)insertText(template,at,trackId);
        break;
      }
      case 'graphic': insertGraphic(card.id,at,trackId);break;
      case 'sticker': {
        const sticker=STICKERS.find(item=>item.id===card.id);
        if(sticker)void insertSticker(sticker,at,trackId);
        break;
      }
      case 'recording': card.stopPreview?.();void insertAudio(card.recording,at,trackId);break;
      case 'composition': insertComposition(card.id,at,target);break;
      case 'preset':
        if(card.chooseMedia)card.chooseMedia(at);
        else if(card.preset.kind==='layout'){
          try{applyPreset(card.preset,{},at);}catch(error){setError(String(error));}
        }
        break;
    }
  }
  function split(){
    const visible=[...liveClips].reverse().find(clip=>timeline.tracks.find(track=>track.id===clip.trackId)?.kind!=='audio');
    const ids=selection.length?selection:visible?[visible.id]:[];
    const at=Math.round(head*project.fps)/project.fps;
    try{
      const result=splitLinkedClips(timeline,ids,at,1/project.fps);
      if(result.ids.length){commit(result.timeline);setSelection(result.ids);}
    }catch(error){setError(String(error));}
  }
  function addMarker(kind:TimelineMarker['kind']) {
    const time=cap(Math.round(head*project.fps)/project.fps,0,MAX_TIMELINE);
    const markers=timeline.markers??[];
    if(markers.length>=8192){setError('The timeline marker limit is reached.');return;}
    if(markers.some(marker=>marker.kind===kind&&Math.abs(marker.time-time)<1e-5))return;
    commit({...timeline,markers:[...markers,{id:crypto.randomUUID(),time,kind}].sort((a,b)=>a.time-b.time)});
  }

  async function detectBeats() {
    const clip=selectedClip,asset=clip&&assetOf(clip);
    if(!clip||!asset||asset.kind==='image'||beatBusy||playbackRateAt(clip,0)<=0)return;
    const origin=project.id,sequence=project.sequence?.id,path=compoundPath.join('/');
    setBeatBusy(true);setError('');
    try {
      const [start,end]=sourceBounds(clip);
      const analysis=await analyzeAudio(asset,sources[asset.id],Math.max(0,start),Math.min(asset.duration,end));
      const snapshot=latestModel.current;
      if(activeProject.current!==origin||snapshot.project.sequence?.id!==sequence||scenePath.current.join('/')!==path)return;
      const current=snapshot.timeline.clips.find(item=>item.id===clip.id);
      if(!current||current!==clip){setNotice('The clip changed during analysis. Run beat detection again.');return;}
      const keep=(snapshot.timeline.markers??[]).filter(marker=>!marker.automatic||marker.time<clip.start||marker.time>=clip.start+clip.duration);
      const times=analysis.beats.map(beat=>sourceBeatToTimeline(clip,beat)).filter(Number.isFinite);
      const added=times.slice(0,8192-keep.length).map(time=>({id:crypto.randomUUID(),time,kind:'beat' as const,automatic:true}));
      if(!added.length){setNotice(analysis.hasAudio?'No clear beats in this source range.':'This source range has no audio.');return;}
      commit({...snapshot.timeline,markers:[...keep,...added].sort((a,b)=>a.time-b.time)});
      setShowPacing(true);setNotice(`Detected ${added.length} beat${added.length===1?'':'s'}`);
    }catch(error){if(activeProject.current===origin)setError(String(error));}
    finally{setBeatBusy(false);}
  }

  function cutOnBeat(transition:boolean) {
    if(!selectedClip||!nearestBeat)return;
    const result=splitClip(timeline,selectedClip.id,Math.round(nearestBeat.time*project.fps)/project.fps,1/project.fps);
    if(!result.rightId){setNotice('Choose a beat inside the selected clip.');return;}
    if(!transition){commit(result.timeline);setSelected(result.rightId);return;}
    const right=result.timeline.clips.find(clip=>clip.id===result.rightId)!;
    const left=result.timeline.clips.find(clip=>clip.id===selectedClip.id)!;
    const duration=Math.min(.4,right.duration,left.duration);
    commit({...result.timeline,clips:result.timeline.clips.map(clip=>clip.id===right.id?{...clip,start:clip.start-duration/2,
      transitionIn:{version:1,kind:'cross-dissolve',duration,direction:'left'}}:clip.id===left.id?{...clip,duration:clip.duration+duration/2}:clip)});
    setSelected(right.id);
  }

  function toggleDialogue() {
    if(!selectedTrack||selectedTrack.locked)return;
    commit({...timeline,tracks:timeline.tracks.map(track=>track.id===selectedTrack.id?{...track,purpose:track.purpose==='dialogue'?undefined:'dialogue'}:track)});
  }

  function separateAudio() {
    const clip=selectedClip,asset=clip&&assetOf(clip);
    if(!clip||asset?.kind!=='video'||asset.hasAudio===false||selectedTrack?.locked||selectedTrack?.kind!=='video'||asset.hasAudio!==true||playbackRateAt(clip,0)<=0)return;
    if(timeline.clips.length>=4096){setError('The timeline clip limit is reached.');return;}
    let tracks=timeline.tracks;
    let track=tracks.find(item=>item.kind==='audio'&&!item.locked&&!item.muted&&!timeline.clips.some(other=>other.trackId===item.id&&other.start<clip.start+clip.duration&&other.start+other.duration>clip.start));
    if(!track){
      if(tracks.length>=24){setError('Free an audio track before separating sound.');return;}
      track={id:crypto.randomUUID(),name:'Separated audio',kind:'audio',muted:false,locked:false};tracks=[...tracks,track];
    }
    const linkId=clip.linkId??crypto.randomUUID();
    const audio:VideoClip={id:crypto.randomUUID(),linkId,trackId:track.id,assetId:asset.id,title:`${asset.name} · audio`,start:clip.start,sourceIn:clip.sourceIn,
      duration:clip.duration,volume:clip.volume,fadeIn:clip.fadeIn,fadeOut:clip.fadeOut,sourceMap:clip.sourceMap,volumeKeys:clip.volumeKeys,
      ducking:clip.ducking,opacity:1,x:0,y:0,scale:1,rotation:0};
    commit({...timeline,tracks,clips:[...timeline.clips.map(item=>item.id===clip.id?{...item,audioMuted:true,linkId}:item),audio]});
    setSelected(audio.id);
  }

  function applyPreset(preset:UserVideoPreset,slots:Record<string,string>={},at?:number){
    if(preset.kind==='layout'){
      const result=applyLayout(latestModel.current.timeline,preset,slots,at??head);
      commit(result.timeline);setSelection(result.ids);
      if(at!==undefined)seekTo(at);
      return;
    }
    if(!selectedClip||selectedTrack?.locked)throw Error('Select an unlocked clip to apply the preset.');
    if(selectedTrack?.kind==='audio'&&['effects','grade','motion'].includes(preset.kind))throw Error('Select a visual clip for this preset.');
    updateClip(presetClipPatch(preset,selectedClip));
  }

  function insertAdjustment() {
    if(timeline.tracks.length>=24||timeline.clips.length>=4096){setError('Free a track or clip before adding an adjustment layer.');return;}
    const track={id:crypto.randomUUID(),name:'Adjustment',kind:'video' as const,purpose:'adjustment' as const,muted:false,locked:false};
    const clip:VideoClip={id:crypto.randomUUID(),trackId:track.id,adjustment:true,title:'Adjustment layer',start:cap(head,0,MAX_TIMELINE-.1),sourceIn:0,
      duration:Math.max(.1,Math.min(MAX_TIMELINE-head,Math.max(3,total-head))),volume:0,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0,effects:[]};
    commit({...timeline,tracks:[track,...timeline.tracks],clips:[...timeline.clips,clip]});
    setSelected(clip.id);
  }

  function changeZoom(value:number,fit=false,point?:ZoomAnchor){
    const next=cap(value,.04,zoomMax);
    const element = navigation.scroll.current;
    if (element) {
      const anchor=point??{seconds:head,pixels:cap(head*zoom-element.scrollLeft,0,navigation.viewport.width)};
      requestAnimationFrame(() => {
        element.scrollLeft=fit&&!point?0:Math.max(0,anchor.seconds*next-anchor.pixels);
        navigation.measure();
      });
    }
    setZoom(next);
  }

  function zoomAnchor(clientX:number):ZoomAnchor{
    const element=navigation.scroll.current;
    if(!element)return {seconds:head,pixels:0};
    const pixels=cap(clientX-element.getBoundingClientRect().left-TRACK_HEADER_WIDTH,0,navigation.viewport.width);
    return {pixels,seconds:(element.scrollLeft+pixels)/zoom};
  }
  zoomWheel.current=event=>{
    if(!event.ctrlKey||!event.deltaY)return;
    event.preventDefault();
    const unit=event.deltaMode===1?16:event.deltaMode===2?240:1;
    changeZoom(zoom*Math.exp(cap(-event.deltaY*unit*.004,-.85,.85)),false,zoomAnchor(event.clientX));
  };
  useEffect(()=>{
    const element=navigation.scroll.current;
    if(!element)return;
    const handler=(event:WheelEvent)=>zoomWheel.current(event);
    element.addEventListener('wheel',handler,{passive:false});
    return()=>element.removeEventListener('wheel',handler);
  },[]);

  function fitSelection(){
    const picked=timeline.clips.filter(clip=>selectedIds.has(clip.id));
    if(!picked.length)return;
    const start=Math.min(...picked.map(clip=>clip.start)),end=Math.max(...picked.map(clipEnd));
    changeZoom((navigation.viewport.width-32)/Math.max(1/project.fps,end-start),true,{seconds:start,pixels:16});
  }

  function jumpKey(direction:-1|1){
    const frame=keyFrame(head,project.fps);
    const frames=selectedClip?clipKeyLanes(selectedClip).flatMap(lane=>lane.keys
      .filter(key=>key.time<=selectedClip.duration+1e-7).map(key=>keyFrame(selectedClip.start+key.time,project.fps)))
      :stops.filter(stop=>stop.rank===3).map(stop=>stop.frame);
    const target=frames.filter(key=>direction>0?key>frame:key<frame).sort((a,b)=>(a-b)*direction)[0];
    if(target!==undefined)seekTo(target/project.fps);
  }

  function finishClock(){
    const input=clockDraft?.trim();setClockDraft(undefined);
    if(!input)return;
    const parts=input.split(/[:.]/).map(Number);
    const time=input.includes(':')&&(parts.length===3||parts.length===4)&&parts.every(Number.isInteger)&&parts[1]<60&&parts[2]<60
      &&(parts[3]??0)<project.fps?parts[0]*3600+parts[1]*60+parts[2]+(parts[3]??0)/project.fps:Number(input);
    if(Number.isFinite(time)&&time>=0)seekTo(time);else setError('Enter a timecode such as 00:00:04.12 or a number of seconds.');
  }

  function togglePlayback() {
    if (!total) return;
    if (playing){setHead(transport.time());setPlaying(false);return;}
    setTailPreview(undefined);
    if (loop&&(head<loop.start||head>=loop.end))setHead(loop.start);
    else if (head >= total) setHead(0);
    setDirection(1);
    setPlaying(true);
  }
  function runCommand(command:StudioCommand){
    if(command==='pause'){if(playing)setHead(transport.time());setPlaying(false);return;}
    if(command==='forward'||command==='reverse'){
      if(!total)return;
      setTailPreview(undefined);
      if(command==='forward'&&head>=total)setHead(0);
      if(command==='reverse'&&head<=0)setHead(total);
      setDirection(command==='forward'?1:-1);setPlaying(true);return;
    }
    if(command==='split'){split();return;}
    if(command==='previous'||command==='next'){
      const cuts=[0,total,...timeline.clips.filter(clip=>!timeline.tracks.find(track=>track.id===clip.trackId)?.muted)
        .flatMap(clip=>[clip.start,clip.start+clip.duration])].sort((a,b)=>a-b);
      seekTo(command==='previous'?cuts.reverse().find(time=>time<head-1e-6)??0:cuts.find(time=>time>head+1e-6)??total);return;
    }
    if(!selectedClip||previewHead<=selectedClip.start||previewHead>=selectedClip.start+selectedClip.duration)return;
    const edge=command==='trimIn'?'left':'right';
    commit(trimLinkedClips(timeline,selectedClip.id,edge,previewHead-(edge==='left'?selectedClip.start:selectedClip.start+selectedClip.duration),1/project.fps));
  }
  function changePreferences(value:StudioPreferences){
    const next={...value,layout:{...value.layout,timeline:boundedTimelineHeight(value.layout.timeline)}};
    setPreferences(next);setTimelineHeight(next.layout.timeline);saveStudioPreferences(next);
  }
  function saveTimelineSize(height:number){
    const next={...preferences,layout:{...preferences.layout,timeline:height}};
    setPreferences(next);saveStudioPreferences(next);
  }

  function stepFrame(direction: number, count = 1) {
    seekTo(Math.max(0, Math.min(total, (Math.round(head * project.fps) + direction * count) / project.fps)));
  }

  function deleteSelected(ripple = false) {
    const next=deleteClips(timeline,selection,ripple);
    if(next===timeline){setError('The selection, a linked clip or a sync-locked track blocks this edit.');return;}
    commit(next);setSelection([]);
  }
  function startEdit(asset:VideoAsset,layout:StarterLayout){
    try{
      const result=makeFirstCut(timeline,asset,layout,project.fps);
      commitProject({...project,timeline:result.timeline,width:result.width,height:result.height,fps:result.fps});
      setStarter(false);setSelected(result.clip.id);seekTo(0);
    }catch(reason){setError(String(reason));}
  }
  function toggleLoop(){
    if(loop){setLoop(undefined);setPlaying(false);return;}
    const next=loopSpan(timeline,selection,range,project.fps);
    if(!next)return;
    setLoop(next);setHead(next.start);setDirection(1);setPlaying(false);
  }
  function markTimelineRange(edge:'start'|'end'){
    if(!total)return;
    const time=cap(frameTime(playing?transport.time():head,project.fps),0,total);
    setRangeMode(undefined);
    setRange(current=>edge==='start'
      ?{start:time,end:current&&current.end>time?Math.min(total,current.end):total}
      :{start:current&&current.start<time?current.start:0,end:time});
  }
  function clearTimelineRange(){
    rangeGesture.current=null;
    setRangeMode(undefined);setRange(undefined);
    if(loop){
      if(playing)setHead(transport.time());
      setPlaying(false);setLoop(undefined);
    }
  }
  function selectionStart(event:PointerEvent<HTMLElement>,trackId:string){
    if(!rangeMode||event.button!==0)return false;
    event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    rangeGesture.current={pointerId:event.pointerId,start:navigation.timeAt(event.clientX),trackId,x:event.clientX,y:event.clientY};
    setPlaying(false);setSkim(undefined);setSelection([]);setRange(undefined);
    return true;
  }
  function selectionMove(event:PointerEvent<HTMLElement>){
    const current=rangeGesture.current;if(!current||current.pointerId!==event.pointerId)return false;
    event.stopPropagation();
    const track=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-track-id]')?.dataset.trackId;
    const a=timeline.tracks.findIndex(item=>item.id===current.trackId),b=timeline.tracks.findIndex(item=>item.id===(track??current.trackId));
    const x=navigation.timeAt(event.clientX),quantize=(time:number)=>cap(Math.round(time*project.fps)/project.fps,0,MAX_TIMELINE);
    const span={start:quantize(Math.min(x,current.start)),end:quantize(Math.max(x,current.start))};
    const tracks=new Set(timeline.tracks.slice(Math.min(a,b<0?a:b),Math.max(a,b)+1).map(item=>item.id));
    const ids=timeline.clips.filter(clip=>tracks.has(clip.trackId)&&clip.start<span.end&&clipEnd(clip)>span.start).map(clip=>clip.id);
    setRange(span.end>span.start?span:undefined);setSelection(ids);
    return true;
  }
  function selectionEnd(event:PointerEvent<HTMLElement>){
    const current=rangeGesture.current;if(!current||current.pointerId!==event.pointerId)return false;
    if(event.type==='pointerup')selectionMove(event);
    else {setRange(undefined);setSelection([]);}
    rangeGesture.current=null;
    return true;
  }
  function editSelectedRange(mode:'copy'|'cut'|'move'){
    if(!range||!selection.length)return;
    try{
      const picked=cutRange(timeline,selection,range,project.fps);
      if(!picked.clips.length)throw Error('The selected range contains no editable clips.');
      const copy={clips:picked.clips,tracks:picked.timeline.tracks};
      const ids=new Set(picked.clips.map(clip=>clip.id));
      const remaining={...picked.timeline,clips:picked.timeline.clips.filter(clip=>!ids.has(clip.id))};
      if(mode==='move'){
        const result=pasteClips(remaining,copy,head);
        commit(result.timeline);setSelection(result.ids);setRange(undefined);
      }else{
        clipboard.current=copy;setCanPaste(true);
        if(mode==='cut'){commit(remaining);setRange(undefined);setSelection([]);}
        setNotice(mode==='cut'?'Range cut to clipboard.':'Range copied.');
      }
    }catch(reason){setError(String(reason));}
  }
  function openContext(event:{clientX:number;clientY:number;currentTarget:HTMLElement;preventDefault:()=>void;stopPropagation:()=>void},track:VideoTrack,clip?:VideoClip){
    event.preventDefault();event.stopPropagation();
    const box=event.currentTarget.getBoundingClientRect();
    const x=event.clientX||box.left+12,y=event.clientY||box.top+12;
    if(clip&&!selectedIds.has(clip.id))setSelected(clip.id);
    setContextMenu({x,y,clip,track,time:cap(event.clientX?navigation.timeAt(x):clip?.start??head,0,length)});
  }
  function contextAction(action:()=>void){
    setContextMenu(undefined);try{action();}catch(reason){setError(String(reason));}
  }
  function labelClip(clip:VideoClip,color?:string){
    if(timeline.tracks.find(track=>track.id===clip.trackId)?.locked)return;
    commit({...timeline,clips:timeline.clips.map(item=>item.id===clip.id?{...item,labelColor:color}:item)});
  }
  function finishTitle(){
    if(!titleEdit)return;
    const next=titleEdit.text.trim().slice(0,2000);
    if(next&&titleEdit.id===selected)updateClip({title:next});
    setTitleEdit(undefined);
  }
  function acceptVoice(take:VoiceTake){
    try{
      const current=latestModel.current.timeline;
      const asset=makeAsset(take.name,take.path??'browser:'+crypto.randomUUID()+'/Voiceover.wav','audio',take.duration);
      asset.waveform=take.waveform;asset.hasAudio=true;
      if(take.file)registerBrowserFile(asset.id,take.file);
      let track=current.tracks.find(item=>item.kind==='audio'&&item.name==='Voiceover'&&!item.locked
        &&!current.clips.some(clip=>clip.trackId===item.id&&clip.start<voiceStart.current+take.duration&&clipEnd(clip)>voiceStart.current));
      if(!track){
        if(current.tracks.length>=24)throw Error('Free an audio track before inserting this take.');
        track={id:crypto.randomUUID(),kind:'audio',name:'Voiceover',muted:false,locked:false,purpose:'dialogue'};
      }
      const result=placeLibraryMedia({...current,tracks:current.tracks.includes(track)?current.tracks:[...current.tracks,track]},
        asset,voiceStart.current,track.id,undefined,project.fps);
      commit(result.timeline);setSelected(result.clip.id);seekTo(result.clip.start);setVoiceover(false);setNotice('Voiceover take added.');
    }catch(reason){setError(String(reason));}
  }
  async function prepareSoundtrack(){
    const clip=selectedClip,asset=clip&&assetOf(clip);
    const span=range??loop??(total>0?{start:0,end:total}:undefined);
    if(!clip||asset?.kind!=='audio'||!span){setError('Select a music clip and set the destination range.');return;}
    if(clip.linkId||selectedTrack?.locked){setError('Unlock and unlink this clip before fitting music.');return;}
    const scene=timeline;setBusy(true);setProgress('Finding music beats…');
    try{
      const [start,end]=sourceBounds(clip);
      const analyzed=await analyzeAudio(asset,sources[asset.id],start,end).catch(()=>undefined);
      if(!isCurrentScene()||latestModel.current.timeline!==scene)return;
      const parts=fitSoundtrack(clip,asset,span,analyzed?.beats??[],project.fps);
      const others=scene.clips.filter(item=>item.id!==clip.id);
      const shared=others.some(item=>item.trackId===clip.trackId&&item.start<span.end&&clipEnd(item)>span.start);
      const track=shared?{id:crypto.randomUUID(),kind:'audio' as const,name:'Fitted music',muted:false,locked:false}:selectedTrack!;
      if(shared&&scene.tracks.length>=24)throw Error('Free a track for the fitted music.');
      if(others.length+parts.length>4096)throw Error('The proposed cuts exceed the clip limit.');
      setSoundtrack({parts:parts.map(item=>({...item,trackId:track.id})),track,span,original:clip});
    }catch(reason){setError(String(reason));}
    finally{setBusy(false);setProgress('');}
  }

  function copySelection() {
    const clips = editableClips(timeline, linkedSelection(timeline,selection));
    if (!clips.length) return;
    clipboard.current = { clips, tracks: timeline.tracks };
    setCanPaste(true);
    setNotice(`${clips.length} clip${clips.length === 1 ? '' : 's'} copied`);
  }

  function pasteSelection(copy = clipboard.current, at = head) {
    if (!copy) return;
    try {
      const result = pasteClips(timeline, copy, at);
      commit(result.timeline);
      setSelection(result.ids);
    } catch (error) { setError(String(error)); }
  }

  function duplicateSelection() {
    const clips = editableClips(timeline, linkedSelection(timeline,selection));
    if (clips.length) pasteSelection({ clips, tracks: timeline.tracks }, Math.max(...clips.map(clip => clip.start + clip.duration)));
  }

  function pointDown(event:PointerEvent<HTMLElement>,clip:VideoClip,edge:'left'|'right'|'move'){
    if (event.button !== 0 || moving.current) return;
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      setSelection(ids => ids.includes(clip.id) ? ids.filter(id => id !== clip.id) : [...ids, clip.id]);
      return;
    }
    const picked=edge==='move'&&selectedIds.has(clip.id)?selection:[clip.id];
    const ids=[...linkedSelection(timeline,picked).filter(id=>id!==clip.id),clip.id];
    setSelection(ids);
    if (timeline.tracks.find(t => t.id === clip.trackId)?.locked) return;
    setPlaying(false);
    const d: Drag = { id: clip.id, edge, initialX: event.clientX, start: clip.start, length: clip.duration,
      trackId: clip.trackId, targetTrackId: clip.trackId, delta: 0, pointerId: event.pointerId,
      ids, scrollLeft: navigation.scroll.current?.scrollLeft ?? 0 };
    moving.current=d;setDrag(d);event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointMove(event:PointerEvent<HTMLElement>){const current=moving.current;if(current?.pointerId!==event.pointerId)return;
    const movement=(event.clientX-current.initialX+(navigation.scroll.current?.scrollLeft??0)-current.scrollLeft)/PX;
    const edge=current.start+(current.edge==='right'?current.length:0);
    const result=magneticFrame(timeline,edge+movement,project.fps,new Set(current.ids),snap&&!event.altKey?Math.min(.75,8/PX):0,
      {length:current.edge==='move'?current.length:undefined,head,beats:beatSnap});
    current.delta=result.time-edge;current.guide=result.guide;
    const element=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-track-id]');
    if(element && element instanceof HTMLElement)current.targetTrackId=element.dataset.trackId??current.trackId;
    cancelAnimationFrame(moveFrame.current);moveFrame.current=requestAnimationFrame(()=>setDrag({...current}));
  }
  function pointUp(event:PointerEvent<HTMLElement>){const current=moving.current;if(current?.pointerId!==event.pointerId)return;
    if(event.type==='pointerup')pointMove(event);
    moving.current=null;cancelAnimationFrame(moveFrame.current);setDrag(null);
    try{event.currentTarget.releasePointerCapture(current.pointerId);}catch{/* already released */}
    if (event.type !== 'pointerup' || Math.abs(event.clientX-current.initialX+(navigation.scroll.current?.scrollLeft??0)-current.scrollLeft)<2
      &&current.targetTrackId===current.trackId) return;
    if(current.edge==='move'){
      commit(moveSelectedClips(timeline, current.ids, current.id, current.delta, current.targetTrackId));
    } else {
      const next=(rippleTrims?rippleTrim:trimLinkedClips)(timeline,current.id,current.edge,current.delta,1/project.fps);
      if(next===timeline&&rippleTrims&&Math.abs(current.delta)>=1/project.fps)setError('The source handles, linked clips or sync-locked tracks block this ripple trim.');
      commit(next);
    }
  }
  async function relink(asset:VideoAsset){
    const origin=project.id;
    try{
      if(!isNativeMediaDesktop()){setError('Re-import this file through Import media in the browser.');return;}
      const {open}=await import('@tauri-apps/plugin-dialog');
      const path=await open({multiple:false,title:`Relink ${asset.name}`});if(!path||Array.isArray(path))return;
      const kind=classifyMedia(path);if(kind!==asset.kind)throw Error(`Choose another ${asset.kind} source.`);
      const next={...asset,path,name:path.split(/[\\/]/).pop()??asset.name,missing:false,revision:(asset.revision??0)+1};
      const detached:VideoAsset={...next,recordingPath:undefined,libraryId:undefined,crop:undefined,portablePath:undefined,waveform:undefined,hasAudio:undefined,credit:undefined};
      if(kind==='video'&&/\.mkv$/i.test(path)){
        const [prepared]=await prepareRecording(path,'master',project.fps);
        detached.path=prepared.path;detached.recordingPath=path;
      }
      forgetMediaUrl(asset.id);const url=await mediaUrl(detached),metadata=await mediaMetadata(url,kind,next.name);
      if(activeProject.current!==origin)return;const latest=latestModel.current.timeline;
      const required=requiredSourceDuration(latestModel.current.project,asset.id);
      if(kind!=='image'&&(metadata.duration<.1||metadata.duration>MAX_TIMELINE))throw Error('Choose a readable replacement source up to six hours long.');
      if(kind!=='image'&&metadata.duration+.02<required)throw Error('This source is shorter than the edited clips. Choose the original or a longer replacement.');
      const updated={...detached,duration:metadata.duration,width:metadata.width,height:metadata.height,animated:metadata.animated,animationDuration:metadata.animationDuration,
        sourceRange:detached.sourceRange&&detached.sourceRange.out<=metadata.duration?detached.sourceRange:undefined,
        selects:detached.selects?.filter(range=>range.out<=metadata.duration)};
      commit({...latest,assets:latest.assets.map(a=>a.id===asset.id?updated:a)});
      setSources(previous=>({...previous,[asset.id]:url}));setNotice(`Relinked ${updated.name}`);
    }catch(e){setError(String(e));}
  }
  async function batchRelink(){
    if(busy)return;
    try{
      const {open}=await import('@tauri-apps/plugin-dialog');
      const folder=await open({directory:true,multiple:false,title:'Find moved media'});
      if(!folder||!isCurrentScene())return;
      setBusy(true);setProgress('Finding matching media…');
      const entries=await invoke<MediaPath[]>('video_scan_media',{paths:[folder]});
      const base=(path:string)=>path.split(/[\\/]/).at(-1)?.toLowerCase();
      const matches=[];
      for(const asset of timeline.assets.filter(item=>offline[item.id])){
        const candidates=entries.filter(item=>base(item.path)===base(asset.name)&&classifyMedia(item.path)===asset.kind&&!/\.mkv$/i.test(item.path));
        if(candidates.length!==1)continue;
        const temporary={...asset,id:crypto.randomUUID(),path:candidates[0].path,libraryId:undefined};
        try{
          const url=await mediaUrl(temporary),meta=await mediaMetadata(url,asset.kind,asset.name);
          if(asset.kind!=='image'&&(meta.duration+.02<requiredSourceDuration(project,asset.id)||Math.abs(meta.duration-asset.duration)>.25))continue;
          if(asset.width&&meta.width&&asset.width!==meta.width||asset.height&&meta.height&&asset.height!==meta.height)continue;
          matches.push({asset,replacement:{...asset,path:temporary.path,missing:false,portablePath:undefined,revision:(asset.revision??0)+1},url});
        }catch{/* An unreadable or ambiguous source stays on the relink list. */}
        finally{forgetMediaUrl(temporary.id);}
      }
      if(!isCurrentScene())return;
      if(!matches.length)throw Error('No exact matches. Relink ambiguous files individually.');
      setRelinkReview(matches);
    }catch(reason){setError(String(reason));}
    finally{setBusy(false);setProgress('');}
  }
  async function gradeFrame(graded:boolean){
    if(!selectedClip||selectedTrack?.kind==='audio')throw Error('Select a visual clip to measure its color.');
    const {TimelineCompositor}=await import('../editor/video/compositor');
    const ratio=Math.min(1,480/Math.max(project.width,project.height));
    const renderer=new TimelineCompositor(Math.max(1,Math.round(project.width*ratio)),Math.max(1,Math.round(project.height*ratio)),project.fps,project.width);
    const clock=cap(previewHead,selectedClip.start,selectedClip.start+Math.max(0,selectedClip.duration-1/project.fps));
    try{
      if(selectedClip.adjustment)return await renderer.render(graded?timeline:{...timeline,clips:timeline.clips.filter(clip=>clip.id!==selectedClip.id)},clock);
      return graded?await renderer.clipFrame(timeline,selectedClip,clock):await renderer.rawFrame(timeline,selectedClip,clock);
    }finally{renderer.dispose();}
  }

  function applyGradeToSelection(grade:VideoGrade){
    const editable=new Set(editableClips(timeline,selection).filter(clip=>timeline.tracks.find(track=>track.id===clip.trackId)?.kind!=='audio').map(clip=>clip.id));
    if(!editable.size)return;
    commit({...timeline,clips:timeline.clips.map(clip=>editable.has(clip.id)?{...clip,grade:structuredClone(grade)}:clip)});
  }

  async function collectProject(){
    if(busy||!isNativeMediaDesktop())return;
    const origin=project.id;
    setError('');
    try{
      const [{open},{invoke}]=await Promise.all([import('@tauri-apps/plugin-dialog'),import('@tauri-apps/api/core')]);
      const directory=await open({title:'Collect a portable project copy',directory:true,multiple:false});
      if(!directory||Array.isArray(directory)||activeProject.current!==origin)return;
      setBusy(true);setProgress('Collecting project media…');
      const snapshot=latestModel.current.project;
      const root=snapshot.timeline??fallbackTimeline.current;
      const assets=await Promise.all(root.assets.map(async asset=>({...asset,path:await resolvedAssetPath(asset)})));
      const path=await invoke<string>('video_collect_project',{directory,contents:JSON.stringify({...snapshot,timeline:{...root,assets}})});
      if(activeProject.current===origin)setNotice(`Portable copy saved to ${path}`);
    }catch(error){if(activeProject.current===origin)setError(String(error));}
    finally{if(activeProject.current===origin){setBusy(false);setProgress('');}}
  }

  function exportVideo(){
    if(!isNativeMediaDesktop()||!capabilities?.h264Mp4Encode){setError('Native Windows H.264 export is unavailable.');return;}
    if(!timeline.clips.length){setError('Add media to the timeline before exporting.');return;}
    setPlaying(false);setExportOpen(true);
  }
  const issues=useMemo(()=>exportOpen?reviewExport(timeline,offline,fonts):[],[exportOpen,timeline,offline,fonts]);
  function queueExports(settings:VideoExportSettings[]){
    const snapshot=structuredClone(timeline),sequences=structuredClone(project.sequences??[]);
    const requests=settings.map(request=>{
      const sequence=sequences.find(item=>item.id===request.sequenceId);
      const source=sequence?{...sequence.scene,assets:snapshot.assets}:snapshot;
      if(Object.keys(offline).some(id=>sceneUsesAsset(source,id)))throw Error('Relink missing media in the selected sequence before exporting.');
      return {request,source,width:sequence?.width??project.width,name:request.prefix??project.name};
    });
    jobs.enqueueDelivery(requests.length===1?'Export '+requests[0].name:'Export '+requests.length+' edits',planDelivery(requests));
    setNotice('Export queued. You can keep editing.');
  }

  return <main ref={shell} className={`hv-shell${fileDrop.over?' is-file-drop':''}`} style={{'--hv-track-header':TRACK_HEADER_WIDTH+'px'} as CSSProperties}
    aria-label="Video Editor workspace" onClickCapture={libraryDrag.onClickCapture}
    {...fileDrop.handlers}
    onDragStart={event=>event.preventDefault()} onContextMenu={event=>event.preventDefault()}>
    <VideoStudioHints workspace={shell}/>
    {fileDrop.over&&<div className="hv-file-drop-notice" role="status">
      {fileDrop.over==='timeline'?'Release files to place clips at this point':'Release files or folders to import into Media'}
    </div>}
    <div ref={libraryDrag.ghost} className={`hv-library-drag-ghost${libraryDrag.hover?.target?' is-valid':''}`} hidden={!libraryDrag.hover} aria-hidden="true">
      {libraryDrag.hover&&<>
        <div className="hv-drag-art">
          {libraryDrag.hover.artwork ? 'image' in libraryDrag.hover.artwork
            ? <img src={libraryDrag.hover.artwork.image} alt="" draggable={false}/>
            : <span className="hv-drag-sprite" style={libraryDrag.hover.artwork}/>
            : <span className="hv-drag-placeholder">{libraryDrag.hover.kind==='recording'?<Audiotrack/>:
              libraryDrag.hover.kind==='text'?<TextFields/>:<MovieOutlined/>}</span>}
          <span className="hv-drag-kind">{libraryDrag.hover.kind==='asset'?'media':libraryDrag.hover.kind}</span>
        </div>
        <div className="hv-drag-label"><strong>{libraryDrag.hover.name}</strong>
          <small>{libraryDrag.hover.target?.kind==='apply'?'Release to apply':
            libraryDrag.hover.target?'Release to place':'Drop on a compatible clip or track'}</small></div>
      </>}
    </div>
    <div ref={libraryDrag.line} className="hv-library-drop-line" hidden aria-hidden="true"/>
    <input ref={fileInput} type="file" multiple accept={importMode.current==='stickers'?'.png,.gif,.jpg,.jpeg,.bmp,.tga,.webp':importMode.current==='audio'?'audio/*':'video/*,audio/*,image/*,.tga'} hidden onChange={(e:ChangeEvent<HTMLInputElement>)=>onFileInput(e.target.files)}/>
    <div className={`hv-workspace${preferences.layout.swap?' is-swapped':''}`} style={{
      '--hv-library-width':preferences.layout.library===DEFAULT_STUDIO_LAYOUT.library?'clamp(245px, 32.35vw, 680px)':preferences.layout.library+'px',
      '--hv-inspector-width':preferences.layout.inspector===DEFAULT_STUDIO_LAYOUT.inspector?'clamp(205px, 23.05vw, 485px)':preferences.layout.inspector+'px',
    } as CSSProperties}>
      <VideoLibraryPane project={project} timeline={timeline} sources={sources} offline={offline} head={head} playing={playing} selected={selectedClip} selectedIds={selection} onUserPreset={applyPreset} onCardDrag={libraryDrag.start} sceneKey={sceneKey} locked={!!selectedTrack?.locked} busy={busy}
        onImportFolder={isNativeMediaDesktop()?()=>void chooseMediaFolder():undefined} onBatchRelink={isNativeMediaDesktop()?()=>void batchRelink():undefined}
        onImportLocal={isNativeMediaDesktop()?entry=>void importPaths([entry.path]):undefined}
        onOpenSequence={id=>{try{commitProject(switchSequence(project,id));}catch(error){setError(String(error));}}}
        onOpenCompound={id=>changeScene([...compoundPath,id])}
        onVoiceover={()=>{setPlaying(false);setVoiceover(true);}} onFitMusic={selectedClip&&assetOf(selectedClip)?.kind==='audio'?()=>void prepareSoundtrack():undefined}
        enqueue={(name,task)=>{const id=jobs.enqueue(name,task);setNotice(name+' queued.');return id;}}
        onImport={mode=>{importMode.current=mode;if(isNativeMediaDesktop())void addDesktopFiles(mode);else{if(fileInput.current)fileInput.current.accept=mode==='stickers'?'.png,.gif,.jpg,.jpeg,.bmp,.tga,.webp':mode==='audio'?'audio/*':'video/*,audio/*,image/*,.tga';fileInput.current?.click();}}}
        onInsert={insertAsset} onSourceInsert={insertSource} proxyIds={proxyIds}
        onRecordingTool={isNativeMediaDesktop()?(asset,mode)=>void recordingTool(asset,mode):undefined} onRelink={asset=>void relink(asset)}
        onRemoveAsset={asset=>{if(sceneUsesAsset(rootTimeline,asset.id)||project.sequences?.some(sequence=>sceneUsesAsset(sequence.scene,asset.id))){setError('Remove this media from the timeline before removing it from the library.');return;}commit({...timeline,assets:timeline.assets.filter(a=>a.id!==asset.id)});}}
        onText={insertText} onGraphic={insertGraphic} onSticker={sticker=>void insertSticker(sticker)} onAudio={item=>void insertAudio(item)} onEffects={updateEffects}
        onClipCard={card=>applyClipCard(card)} onClip={updateClip} onTimeline={commit} onProject={patch=>commitProject({...project,...patch})} onCommit={finishGesture}
        onSeek={seekTo} gradeBypass={!!selected&&gradeBypass===selected} onGradeBypass={()=>setGradeBypass(gradeBypass===selected?undefined:selected)}
        onGradeFrame={gradeFrame} onComposition={insertComposition} onError={setError} onAudition={auditionCard}/>
      <section ref={monitorStage} className="hv-stage hv-card" aria-label="Video preview">
        {timeline.tracks.some(track=>track.purpose==='camera-program')&&<div className="hv-inline-actions hv-camera-bar">
          {timeline.tracks.filter(track=>track.purpose==='camera-angle').map(track=><button key={track.id}
            disabled={!timeline.clips.some(clip=>clip.trackId===track.id&&clip.start<=previewHead&&clip.start+clip.duration>previewHead)}
            onClick={()=>{try{commit(cutMulticam(timeline,track.id,previewHead,project.fps));}catch(error){setError(String(error));}}}>{track.name}</button>)}
        </div>}
        <div className="hv-stage-flex"><div className="hv-monitor" style={{aspectRatio:`${project.width} / ${project.height}`,'--hv-ratio':project.width/project.height} as CSSProperties}>
          <VideoPreviewCanvas key={`${project.id}:${project.sequence?.id??'main'}:${compoundPath.join('/')}`} timeline={original?originalTimeline:displayTimeline}
            width={project.width} height={project.height} quality={previewQuality} fps={project.fps} time={displayHead} playing={monitorClock.playing} transport={transport} synchronizeStart
            interactive={monitorClock.interactive} cacheRequest={cacheRequest} onError={setError}/>
          {auditionResult&&activeAudition&&<span className="hv-audition-badge">Clip preview · {activeAudition.name}</span>}
          {compare&&!original&&selectedClip&&<div className="hv-compare-image" style={{clipPath:`inset(0 ${100-divider}% 0 0)`}}>
            <VideoPreviewCanvas timeline={originalTimeline} width={project.width} height={project.height} fps={project.fps} time={displayHead}
              quality={.5} playing={monitorClock.playing} transport={transport} interactive={monitorClock.interactive} onError={setError}/>
            <span className="hv-compare-label">Original</span>
          </div>}
          {compare&&!original&&selectedClip&&<div className="hv-compare-rule" style={{left:divider+'%'}} role="slider"
            tabIndex={0} aria-label="Before and after divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={divider}
            onPointerDown={event=>{
              if(event.button!==0)return;
              event.currentTarget.setPointerCapture(event.pointerId);
            }} onPointerMove={event=>{
              if(!event.currentTarget.hasPointerCapture(event.pointerId))return;
              const rect=event.currentTarget.parentElement!.getBoundingClientRect();
              setDivider(Math.round(cap((event.clientX-rect.left)/rect.width*100,0,100)));
            }} onKeyDown={event=>{
              const next=event.key==='ArrowLeft'?divider-2:event.key==='ArrowRight'?divider+2:
                event.key==='Home'?0:event.key==='End'?100:undefined;
              if(next===undefined)return;
              event.preventDefault();event.stopPropagation();setDivider(cap(next,0,100));
            }}><i aria-hidden="true">↔</i></div>}
          {original&&<span className="hv-view-badge">Original clip</span>}
          {skim!==undefined&&!playing&&<span className="hv-view-badge">Skim · {skim.toFixed(2)} s</span>}
          {guide&&<div className="hv-safe-guide" aria-hidden="true" style={{inset:guideInset+'%'}}><i/><b/></div>}
          {!titleEdit&&!compare&&!auditionResult&&!playing&&activeInspector==='Video'&&videoPage==='Basic'&&selectedClip&&
            (transformClip===selectedClip.id||selectedTrack?.kind==='title')&&liveClips.some(clip=>clip.id===selectedClip.id)&&!selectedTrack?.locked&&selectedTrack?.kind!=='audio'&&!selectedClip.adjustment&&
            <VideoTransformOverlay key={selectedClip.id} clip={selectedClip} asset={assetOf(selectedClip)} time={previewHead} width={project.width} height={project.height} showGuide={trackGuide===selectedClip.id}
              fps={project.fps} autoKey={autoKey}
              onEditText={selectedTrack?.kind==='title'&&!selectedClip.shape?()=>setTitleEdit({id:selectedClip.id,text:selectedClip.title??''}):undefined}
              alignTo={liveClips.filter(clip=>clip.id!==selectedClip.id&&clip.title).map(clip=>({x:clip.x,y:clip.y}))}
              onChange={patch=>updateClip(patch,true)} onFinish={cancelled=>cancelled?cancelGesture():finishGesture()}/>}
          {!playing&&!compare&&!auditionResult&&selectedClip&&clipClock.active&&
            (activeInspector==='Video'&&videoPage==='Mask'&&selectedClip.mask||activeInspector==='Adjust'&&gradeMask&&selectedClip.grade?.mask)&&
            <VideoMaskOverlay key={selectedClip.id+activeInspector} clip={selectedClip} asset={selectedAsset} clock={clipClock}
              width={project.width} height={project.height} grade={activeInspector==='Adjust'}
              onChange={mask=>updateClip(activeInspector==='Adjust'?{grade:{...selectedClip.grade,mask}}:{mask},true)}
              onFinish={cancelled=>cancelled?cancelGesture():finishGesture()}/>}
          {titleEdit&&selectedClip?.id===titleEdit.id&&<div className="hv-canvas-text-edit" style={{left:(.5+selectedClip.x)*100+'%',top:(.5+selectedClip.y)*100+'%',
            width:Math.min(90,(selectedClip.textStyle?.width??.75)*100)+'%'}}>
            <textarea autoFocus aria-label="Edit title on canvas" value={titleEdit.text} maxLength={2000}
              onChange={event=>setTitleEdit({...titleEdit,text:event.target.value})} onBlur={finishTitle}
              onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setTitleEdit(undefined);}if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();finishTitle();}}}/>
            <small>Ctrl+Enter to apply · Escape to cancel</small></div>}
          <VideoAudioPreview plan={audioPlan} sources={sources} time={head} playing={monitorClock.playing} transport={transport}
            meters={meters} muted={monitorMuted} onError={setError}/>
          {!displayClips.some(c=>timeline.tracks.find(t=>t.id===c.trackId)?.kind!=='audio')&&
            <div className="hv-monitor-empty"><MovieOutlined sx={{fontSize:40}}/><span>{timeline.clips.length?'No visual clip at this time':'Your story starts here'}</span>
              <small>{timeline.clips.length?'Move the playhead to a video, image or title clip.':'Drop a recording here or choose a first clip.'}</small>
              {!timeline.clips.length&&!compoundPath.length&&<button className="hv-start-footage" onClick={()=>setStarter(true)}>Start from footage</button>}</div>}
        </div></div>
        <div className="hv-player-bar">
          <span className="hv-clock">
            {clockDraft===undefined?<button type="button" className="hv-timecode-button" aria-label="Go to timecode" data-hint="Go to timecode"
              onClick={()=>setClockDraft(timecode(head,project.fps))}>{timecode(head,project.fps)}</button>
              :<input autoFocus className="hv-timecode-input" aria-label="Playhead timecode" value={clockDraft} onFocus={event=>event.currentTarget.select()}
                onChange={event=>setClockDraft(event.target.value)} onBlur={finishClock} onKeyDown={event=>{
                  if(event.key==='Enter')event.currentTarget.blur();
                  if(event.key==='Escape'){event.stopPropagation();setClockDraft(undefined);}
                }}/>} <small>/ {timecode(total,project.fps)}</small>
          </span>
          <div className="hv-player-transport">
            <button aria-label="Jump to start" data-hint="Jump to start" onClick={()=>seekTo(0)}><SkipPrevious/></button>
            <button aria-label="Previous frame (Left)" data-hint="Previous frame · Left arrow" onClick={()=>stepFrame(-1)}><FastRewind/></button>
            <button className="hv-play" aria-label={playing?'Pause':'Play'} data-hint={playing?'Pause · Space':'Play · Space'}
              disabled={total===0} onClick={togglePlayback}>{playing?<Pause/>:<PlayArrow/>}</button>
            <button aria-label="Next frame (Right)" data-hint="Next frame · Right arrow" onClick={()=>stepFrame(1)}><FastForward/></button>
            <button aria-label="Jump to end" data-hint="Jump to end" onClick={()=>seekTo(total)}><SkipNext/></button>
          </div>
          <div className="hv-player-display">
            <button aria-expanded={monitorTools} aria-label="Monitor settings" data-hint="Monitor settings" onClick={()=>setMonitorTools(value=>!value)}>
              <MonitorOutlined/>{aspectLabel(project.width,project.height)}<ExpandMore fontSize="inherit"/>
            </button>
            <button aria-pressed={monitorMuted} aria-label={monitorMuted?'Unmute preview':'Mute preview'} data-hint={monitorMuted?'Unmute preview':'Mute preview'} onClick={()=>setMonitorMuted(value=>!value)}>
              {monitorMuted?<VolumeOff/>:<VolumeUp/>}
            </button>
            <button aria-label="Toggle fullscreen preview" data-hint="Fullscreen preview" onClick={()=>{
              const action=document.fullscreenElement?document.exitFullscreen():monitorStage.current?.requestFullscreen();
              void action?.catch(error=>setError(String(error)));
            }}><Fullscreen/></button>
          </div>
        </div>
        {monitorTools&&<div className="hv-monitor-options" aria-label="Monitor settings">
          <label className="hv-field">Scrub timeline
          <input type="range" aria-label="Scrub timeline" min={0} max={Math.max(.01,total)} step={1/project.fps} value={Math.min(head,total)}
            onPointerDown={()=>setSliderScrubbing(true)} onPointerUp={()=>setSliderScrubbing(false)} onPointerCancel={()=>setSliderScrubbing(false)}
            onBlur={()=>setSliderScrubbing(false)} onChange={(e:ChangeEvent<HTMLInputElement>)=>seekTo(Number(e.target.value))}/></label>
          <label className="hv-field">Preview resolution
          <select className="hv-preview-quality" aria-label="Preview resolution" value={previewQuality} onChange={event=>setPreviewQuality(+event.target.value)}>
            <option value={0}>Auto</option><option value={1}>Full</option><option value={.5}>½ preview</option><option value={.25}>¼ preview</option>
          </select></label>
        <div className="hv-monitor-tools hv-inline-actions">
          <button disabled={playing||!total||head>=total} data-hint="Cache upcoming frames at the preview resolution"
            onClick={()=>setCacheRequest(value=>value+1)}>Cache frames</button>
          <button disabled={!selectedClip} data-hint="Alt+B" onPointerDown={event=>{if(event.button===0){event.currentTarget.setPointerCapture(event.pointerId);setOriginal(true);}}}
            onPointerUp={()=>setOriginal(false)} onLostPointerCapture={()=>setOriginal(false)}
            onKeyDown={event=>{if(event.key===' '){event.preventDefault();setOriginal(true);}}} onKeyUp={event=>{if(event.key===' ')setOriginal(false);}}>Hold original</button>
          <button disabled={!selectedClip} aria-pressed={compare} onClick={()=>setCompare(!compare)}>Compare</button>
          <button aria-pressed={guide} onClick={()=>setGuide(!guide)}>Safe area</button>
          {selectedTrack?.kind==='title'&&selectedClip&&!selectedClip.shape&&!selectedTrack.locked&&<button onClick={()=>{
            setPlaying(false);setTitleEdit({id:selectedClip.id,text:selectedClip.title??''});
          }}>Edit title</button>}
          {guide&&<label>Inset <input type="range" aria-label="Safe area inset" min={4} max={35} value={guideInset} onChange={event=>{
            const current=latestModel.current.project;
            if(!gesture.current)gesture.current=current;
            publish({...current,sequence:{...current.sequence??MAIN_SEQUENCE,safeInset:event.target.valueAsNumber}});
          }} onPointerUp={finishGesture} onPointerCancel={finishGesture} onKeyUp={finishGesture} onBlur={finishGesture}/>{guideInset}%</label>}
        </div></div>}
      </section>
      <aside className="hv-inspector hv-card"><div className="hv-heading"><h3>Inspector</h3>
        {selectedClip&&<button type="button" className="hv-auto-key" aria-pressed={autoKey}
          data-hint="Automatically add a key when changing an animatable value" onClick={()=>setAutoKey(!autoKey)}><DiamondOutlined/> Auto Key</button>}
      </div>
        {selectedClip&&<nav className="hv-inspector-tabs hv-clip-inspector-tabs" aria-label="Inspector sections">
          {inspectorPages.map(page=><button type="button" key={page} aria-pressed={page===activeInspector}
            onClick={()=>{setInspectorPage(page);setGradeMask(false);}}>{page}</button>)}
        </nav>}
        {selectedClip?<div className="hv-inspector-scroll" key={selectedClip.id}>
          {activeInspector==='Video'&&<>
            <nav className="hv-inspector-subtabs" aria-label="Video tools">
              {VIDEO_PAGES.filter(page=>page==='Basic'||selectedTrack?.kind==='video').map(page=>
                <button type="button" key={page} aria-pressed={page===videoPage||page==='Basic'&&selectedTrack?.kind==='title'}
                  onClick={()=>setVideoPage(page)}>{page}</button>)}
            </nav>
            {(videoPage==='Basic'||selectedTrack?.kind==='title')&&<>
              {!!selectedClip.effects?.length&&<VideoEffectInspector effects={selectedClip.effects} compact clock={clipClock}
                time={clipClock.time} duration={selectedClip.duration} fps={project.fps} disabled={!!selectedTrack?.locked}
                onChange={updateEffects} onCommit={finishGesture} onError={setError}/>}
              <fieldset disabled={!!selectedTrack?.locked} className="hv-basic-inspector">
                <div className="hv-inspector-section-title"><strong>Transform</strong>
                  <button type="button" aria-pressed={transformClip===selectedClip.id}
                    onClick={()=>setTransformClip(transformClip===selectedClip.id?undefined:selectedClip.id)}>Canvas handles</button>
                </div>
                <VideoTransformControls clip={selectedClip} asset={selectedAsset} width={project.width} height={project.height}
                  clock={clipClock} onChange={updateClip} onCommit={finishGesture}/>
                <details className="hv-inspector-section"><summary>Clip settings</summary>
          <strong className="hv-selected-title">{selectedClip.title??assetOf(selectedClip)?.name??'Clip'}</strong>
          {selectedClip.compound&&<div className="hv-inline-actions"><button onClick={()=>changeScene([...compoundPath,selectedClip.id])}>Open compound</button></div>}
          {selectedClip.compound&&<label className="hv-field">Compound name<input value={selectedClip.title??''} maxLength={120} onChange={event=>updateClip({title:event.target.value})}/></label>}
          {selectedTrack?.kind==='title'&&<label className="hv-field">Text<textarea value={selectedClip.title??''} rows={3}
            onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>updateClip({title:e.target.value.slice(0,2000)})}/></label>}
          <div className="hv-pair"><label className="hv-field">Position (s)<input type="number" step="0.1" min={0} value={Number(selectedClip.start.toFixed(2))}
            onChange={(e:ChangeEvent<HTMLInputElement>)=>commit(moveClip(timeline,selectedClip.id,num(e.target.value,selectedClip.start)))}/></label>
            <label className="hv-field">Length (s)<input type="number" step="0.1" min={1/project.fps} value={Number(selectedClip.duration.toFixed(3))}
              onChange={(e:ChangeEvent<HTMLInputElement>)=>commit(trimLinkedClips(timeline,selectedClip.id,'right',num(e.target.value,selectedClip.duration)-selectedClip.duration,1/project.fps))}/></label></div>
          {selectedTrack?.kind==='title'&&!selectedClip.shape&&<VideoTextControls clip={selectedClip} time={Math.max(0,head-selectedClip.start)} onChange={updateClip} onCommit={finishGesture}/>}
          {selectedClip.shape&&<details className="hv-inspector-section"><summary>Graphic</summary>
            <div className="hv-pair">{(['fill','stroke'] as const).map(key=><label className="hv-field" key={key}>{key}
              <input type="color" value={selectedClip.shape![key]} onChange={event=>updateClip({shape:{...selectedClip.shape!,[key]:event.target.value}})}/></label>)}</div>
            <div className="hv-pair">{(['width','height','strokeWidth'] as const).map(key=><label className="hv-field" key={key}>{key} %
              <input type="number" min={key==='strokeWidth'?0:1} max={key==='strokeWidth'?10:100} step={.1} value={+(selectedClip.shape![key]*100).toFixed(2)}
                onChange={event=>updateClip({shape:{...selectedClip.shape!,[key]:cap(Number(event.target.value)/100,key==='strokeWidth'?0:.01,key==='strokeWidth'?.1:1)}})}/></label>)}</div>
          </details>}
                  {(selectedAsset||selectedClip.compound)&&<VideoAdvancedClipControls section="crop" clip={selectedClip}
                    asset={selectedAsset} time={head} fps={project.fps} visual onChange={updateClip} onCommit={finishGesture} onError={setError}/>}
                </details>
                <details className="hv-inspector-section"><summary>Transitions and fades</summary>
                  <div className="hv-pair">
                    <label className="hv-field">Visual fade in (s)<input type="number" min={0} step={1/project.fps}
                      value={+selectedClip.fadeIn.toFixed(3)} onChange={event=>updateClip({fadeIn:cap(event.target.valueAsNumber||0,0,selectedClip.duration-selectedClip.fadeOut)})}/></label>
                    <label className="hv-field">Visual fade out (s)<input type="number" min={0} step={1/project.fps}
                      value={+selectedClip.fadeOut.toFixed(3)} onChange={event=>updateClip({fadeOut:cap(event.target.valueAsNumber||0,0,selectedClip.duration-selectedClip.fadeIn)})}/></label>
                  </div>
                  {(['transitionIn','transitionOut'] as const).map(slot=>{
                    const transition=selectedClip[slot];
                    if(!transition)return null;
                    const other=slot==='transitionIn'?selectedClip.transitionOut:selectedClip.transitionIn;
                    const limit=Math.max(1/project.fps,selectedClip.duration-(other?.duration??0));
                    return <div className="hv-transition-control" key={slot}>
                      <strong>{transitionName(transition)}</strong>
                      <label className="hv-field">{slot==='transitionIn'?'Incoming':'Outgoing'} duration (s)
                        <input type="number" min={1/project.fps} max={Math.min(limit,selectedClip.duration)} step={1/project.fps}
                          key={transition.duration} defaultValue={+transition.duration.toFixed(3)} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}
                          onBlur={event=>{
                            const value=event.target.valueAsNumber;
                            if(!Number.isFinite(value)||Math.abs(value-transition.duration)<.0005)return;
                            const duration=cap(frameTime(value,project.fps),Math.min(1/project.fps,selectedClip.duration),Math.min(limit,selectedClip.duration));
                            updateClip({[slot]:{...transition,duration}});
                          }}/></label>
                      {(transition.kind==='slide'||transition.kind==='wipe')&&<label className="hv-field">Direction<select value={transition.direction}
                        onChange={event=>updateClip({[slot]:{...transition,direction:event.target.value as typeof transition.direction}})}>
                        {['left','right','up','down'].map(direction=><option key={direction}>{direction}</option>)}</select></label>}
                      <button type="button" onClick={()=>updateClip({[slot]:undefined})}>Remove transition</button>
                    </div>;
                  })}
                </details>
              </fieldset>
            </>}
            {videoPage==='Background'&&selectedTrack?.kind==='video'&&<fieldset disabled={!!selectedTrack.locked}>
              <VideoAdvancedClipControls section="background" clip={selectedClip} asset={selectedAsset} time={head} fps={project.fps}
                visual onChange={updateClip} onCommit={finishGesture} onError={setError}/>
              {selectedAsset?.kind==='video'&&<VideoFootageTools section="background" clip={selectedClip} asset={selectedAsset}
                onApply={smart=>updateClip({smart})} showGuide={false} onGuide={()=>setTrackGuide(undefined)}/>}
            </fieldset>}
            {videoPage==='Mask'&&selectedTrack?.kind==='video'&&<fieldset disabled={!!selectedTrack.locked}>
              <VideoMaskControls mask={selectedClip.mask} clock={clipClock} canTrack={!!selectedClip.smart?.track}
                onChange={(mask,preview)=>updateClip({mask},preview)} onCommit={finishGesture} onError={setError}/>
            </fieldset>}
            {videoPage==='Retouch'&&selectedTrack?.kind==='video'&&<fieldset disabled={!!selectedTrack.locked}>
              {selectedAsset?.kind==='video'&&<VideoFootageTools section="retouch" clip={selectedClip} asset={selectedAsset}
                onApply={smart=>updateClip({smart})} showGuide={trackGuide===selectedClip.id}
                onGuide={()=>setTrackGuide(trackGuide===selectedClip.id?undefined:selectedClip.id)}/>}
              <div className="hv-retouch-controls">
                {RETOUCH_EFFECTS.map(([kind,label])=>{
                  const stack=selectedClip.effects??[],effect=stack.find(item=>item.kind===kind);
                  return <label className="hv-source-favorite" key={kind}><input type="checkbox" checked={!!effect?.enabled}
                    disabled={kind==='video-deflicker'&&selectedAsset?.kind!=='video'} onChange={event=>{
                      setRetouchBypass(undefined);
                      updateEffects(effect?stack.map(item=>item.id===effect.id?{...item,enabled:event.target.checked}:item)
                        :[...stack,createLibraryVideoEffect(kind)]);
                    }}/>{label}</label>;
                })}
                <button type="button" aria-pressed={retouchBypass===selectedClip.id}
                  onClick={()=>setRetouchBypass(retouchBypass===selectedClip.id?undefined:selectedClip.id)}>
                  {retouchBypass===selectedClip.id?'Show retouch':'Compare before'}
                </button>
              </div>
            </fieldset>}
          </>}
          {activeInspector==='Audio'&&<VideoAudioControls clip={selectedClip} asset={selectedAsset} clock={clipClock}
            disabled={!!selectedTrack?.locked} dialogue={selectedTrack?.purpose==='dialogue'} onChange={updateClip} onCommit={finishGesture}
            onSeparate={separateAudio} onDialogue={toggleDialogue} onDetect={()=>void detectBeats()} analyzing={beatBusy}
            onMatchLoudness={isNativeMediaDesktop()&&selectedAsset?.hasAudio!==false&&selectedClip.holdFrame===undefined&&selectedClip.assetId
              ?()=>{setPlaying(false);setSourceAnalysis('loudness');}:undefined}/>}
          {activeInspector==='Speed'&&<fieldset disabled={!!selectedTrack?.locked}>
            <VideoAdvancedClipControls section="speed" clip={selectedClip} asset={selectedAsset} time={head} fps={project.fps}
              visual={selectedTrack?.kind!=='audio'} onChange={updateClip} onCommit={finishGesture} onError={setError}
              onAnalyzeScenes={isNativeMediaDesktop()&&selectedAsset?.kind==='video'&&selectedClip.holdFrame===undefined
                ?()=>{setPlaying(false);setSourceAnalysis('scene');}:undefined}
              onPreservePitch={isNativeMediaDesktop()&&!busy&&selectedAsset?.hasAudio!==false?()=>void preservePitch():undefined}/>
          </fieldset>}
          {activeInspector==='Animation'&&<>
            <VideoClipAnimation clip={selectedClip} fps={project.fps} disabled={!!selectedTrack?.locked} onChange={updateClip}
              onPreview={(start,end)=>{if(end>start){setTailPreview(undefined);setLoop({start,end});setHead(start);setDirection(1);setPlaying(true);}}}/>
            <details className="hv-inspector-section"><summary>Keyframe curves</summary>
              <fieldset disabled={!!selectedTrack?.locked}>
                <VideoMotionControls clip={selectedClip} time={clipClock.time} fps={project.fps} onChange={updateClip}
                  onCommit={finishGesture} onSeek={seekTo} keyframesOnly/>
              </fieldset>
            </details>
          {selectedTrack?.kind!=='audio'&&!selectedTrack?.locked&&!selectedClip.adjustment&&<details className="hv-inspector-section">
            <summary>Tracking and beat animation</summary>
            <label className="hv-field">Pin overlay to tracked subject<select value="" onChange={event=>{
              const source=timeline.clips.find(clip=>clip.id===event.target.value),asset=source&&assetOf(source);
              if(source&&asset)try{updateClip({keyframes:pinOverlay(selectedClip,source,asset,project.width,project.height)});}catch(error){setError(String(error));}
            }}><option value="">Choose tracked clip…</option>{timeline.clips.filter(clip=>clip.id!==selectedClip.id&&clip.smart?.track
              &&clip.start<selectedClip.start+selectedClip.duration&&clip.start+clip.duration>selectedClip.start).map(clip=>
              <option key={clip.id} value={clip.id}>{clip.title??assetOf(clip)?.name??'Tracked clip'} · {sec(clip.start)}</option>)}</select></label>
            <button disabled={!beats.length} onClick={()=>animateBeats()}>Pulse scale on beats</button>
            <label className="hv-field">Pulse effect on beats<select value="" disabled={!beats.length} onChange={event=>animateBeats(event.target.value)}>
              <option value="">Choose effect…</option>{selectedClip.effects?.filter(effect=>VIDEO_EFFECT_LOOKUP.has(effect.kind)).map(effect=>
                <option key={effect.id} value={effect.id}>{VIDEO_EFFECT_LOOKUP.get(effect.kind)?.label}</option>)}</select></label>
          </details>}
          </>}
          {activeInspector==='Adjust'&&<VideoGradePanel grade={selectedClip.grade} disabled={!!selectedTrack?.locked} clock={clipClock}
            bypass={gradeBypass===selectedClip.id} onChange={(grade,preview)=>updateClip({grade},preview)} onCommit={finishGesture}
            onBypass={()=>setGradeBypass(gradeBypass===selectedClip.id?undefined:selectedClip.id)} onFrame={gradeFrame} onError={setError}
            onMaskHandles={setGradeMask} onApply={applyGradeToSelection}
            applyCount={editableClips(timeline,selection).filter(clip=>timeline.tracks.find(track=>track.id===clip.trackId)?.kind!=='audio').length}/>}
          {activeInspector==='Stylize'&&<VideoEffectInspector effects={selectedClip.effects??[]} clock={clipClock} time={clipClock.time}
            duration={selectedClip.duration} fps={project.fps} onSeek={clipClock.onSeek} disabled={!!selectedTrack?.locked}
            onChange={updateEffects} onCommit={finishGesture} onError={setError}/>}
        </div>:<div className="hv-project-details"><strong>Project details</strong><dl>
          <dt>Name</dt><dd>{project.name}</dd><dt>Resolution</dt><dd>{project.width} × {project.height}</dd>
          <dt>Frame rate</dt><dd>{project.fps} fps</dd><dt>Duration</dt><dd>{sec(total)}</dd>
          <dt>Color space</dt><dd>Rec. 709 SDR</dd><dt>Media</dt><dd>{timeline.assets.length} assets · {timeline.clips.length} clips</dd>
          <dt>Source files</dt><dd>Referenced media</dd></dl><p>Select a clip to edit its text, transform, audio, effects and animation. Use Canvas to change the project format.</p></div>}
        {!selectedClip&&<div className="hv-inspector-note">
          {isNativeMediaDesktop()&&<button disabled={busy} onClick={()=>void collectProject()}>Collect portable copy</button>}
          Effects are non-destructive. MP4 export uses the same compositor and mixes audible tracks.</div>}
      </aside>
    </div>
    <div className="hv-timeline-resizer" role="separator" aria-label="Resize video timeline" aria-orientation="horizontal" aria-valuenow={Math.round(timelineHeight)} tabIndex={0}
      onPointerDown={e=>{
        const height=timelineSection.current?.getBoundingClientRect().height??timelineHeight;
        resizeTimeline.current={y:e.clientY,height};heightValue.current=height;e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e=>{const drag=resizeTimeline.current;if(drag){const next=boundedTimelineHeight(drag.height+drag.y-e.clientY);heightValue.current=next;setTimelineHeight(next);}}}
      onPointerUp={e=>{resizeTimeline.current=null;e.currentTarget.releasePointerCapture(e.pointerId);saveTimelineSize(heightValue.current);}}
      onPointerCancel={()=>{resizeTimeline.current=null;}}
      onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){
        e.preventDefault();
        const height=timelineSection.current?.getBoundingClientRect().height??timelineHeight;
        const next=boundedTimelineHeight(height+(e.key==='ArrowUp'?16:-16));setTimelineHeight(next);saveTimelineSize(next);
      }}}/>
    <section ref={timelineSection} className="hv-timeline" aria-label="Video timeline" style={{flexBasis:timelineHeight===DEFAULT_STUDIO_LAYOUT.timeline?'clamp(270px, 35.2vh, 465px)':timelineHeight}}>
      <div className="hv-timeline-top">
        <div className="hv-timeline-primary" aria-label="Timeline editing controls">
          <button aria-label="Select clips" aria-pressed={!panTimeline} data-hint="Select clips" onClick={()=>setPanTimeline(false)}><NearMeOutlined/></button>
          <button aria-label="Pan timeline" aria-pressed={panTimeline} data-hint="Pan timeline" onClick={()=>setPanTimeline(true)}><PanToolOutlined/></button>
          <span className="hv-tb-sep"/>
          <button data-hint="Split clip at playhead (Ctrl+B)" onClick={split}><ContentCut/> Split</button>
          <span className="hv-tb-sep"/>
          <button aria-pressed={snap} data-hint="Snap to clip starts, ends, cuts, keyframes and markers. Hold Alt to bypass the magnet."
            onClick={()=>changePreferences({...preferences,magnet:!snap})}><SnapGlyph/> Snap <span className="hv-switch" aria-hidden="true"/></button>
          <button aria-pressed={!!loop} data-hint="Loop the selected clip or range" disabled={!total} onClick={toggleLoop}><Loop/> Loop</button>
          {timelineSpan&&<button type="button" aria-keyshortcuts="Escape" data-hint="Clear the timeline range (Esc)"
            onClick={clearTimelineRange}><Close/>{markedRange?'Clear In/Out':'Clear range'}</button>}
          <span className="hv-tb-sep"/>
          <button data-hint="Previous keyframe (Alt+[)" aria-label="Previous keyframe" onClick={()=>jumpKey(-1)}><FirstPage/></button>
          <button data-hint="Show selected clip keyframes" aria-label="Keyframe lanes" aria-pressed={keyLanesOpen}
            disabled={!selectedClip} onClick={()=>setKeyLanesOpen(value=>!value)}><DiamondOutlined/></button>
          <button data-hint="Next keyframe (Alt+])" aria-label="Next keyframe" onClick={()=>jumpKey(1)}><LastPage/></button>
          <button data-hint={selectedClip?.linkId?'Unlink selected clips':'Link selected clips'} aria-label={selectedClip?.linkId?'Unlink selected clips':'Link selected clips'}
            disabled={!selectedClip?.linkId&&selection.length<2} onClick={()=>{
              try{commit(linkClips(timeline,selection,!!selectedClip?.linkId));}catch(error){setError(String(error));}
            }}>{selectedClip?.linkId?<LinkOff/>:<Link/>}</button>
          <button data-hint="Add marker at playhead" aria-label="Add marker" onClick={()=>addMarker('marker')}><BookmarkAddOutlined/></button>
          <button data-hint="Record voiceover" aria-label="Record voiceover" aria-pressed={voiceover} onClick={()=>setVoiceover(value=>!value)}><MicNone/></button>
          <span className="hv-tb-sep"/>
          <span className="hv-zoom-title" data-hint="Ctrl+wheel or Ctrl+middle drag to zoom around the pointer"><ZoomIn/> Zoom</span>
          <button aria-label="Zoom out" data-hint="Zoom out" onClick={()=>changeZoom(zoomTimeline(zoom,-1,project.fps))}>−</button>
          <input className="hv-studio-range" aria-label="Timeline zoom" aria-valuetext={Math.round(zoom/60*100)+'%'} data-hint={Math.round(zoom/60*100)+'%'} type="range" min={0} max={100} step={1}
            style={{'--hv-range-fill':Math.log(zoom/.04)/Math.log(zoomMax/.04)*100+'%'} as CSSProperties}
            value={Math.round(Math.log(zoom/.04)/Math.log(zoomMax/.04)*100)}
            onChange={event=>changeZoom(.04*(zoomMax/.04)**(event.target.valueAsNumber/100))}/>
          <button aria-label="Zoom in" data-hint="Zoom in" onClick={()=>changeZoom(zoomTimeline(zoom,1,project.fps))}>+</button>
          <button data-hint="Fit selection" aria-label="Fit selection" disabled={!selection.length} onClick={fitSelection}><FitScreen/></button>
        </div>
        <VideoTimelineOverview timeline={timeline} head={head} duration={Math.max(total,1/project.fps)} fps={project.fps} onScrub={setSliderScrubbing}
          viewStart={navigation.viewport.x/PX} viewDuration={navigation.viewport.width/PX}
          onJump={(time,clipId)=>{
            seekTo(time);
            if(clipId)setSelection([clipId]);
            if(navigation.scroll.current)navigation.scroll.current.scrollLeft=Math.max(0,time*PX-navigation.viewport.width*.35);
          }}/>
      </div>
      {timelineTools&&<div className="hv-timeline-tools-popup" aria-label="Timeline tools">
        <div className="hv-timeline-actions">
          <button onClick={()=>{setTimelineTools(false);setPlaying(false);setEditorialOpen(true);}}>Editing tools</button>
          <button onClick={()=>setPreferencesOpen('commands')} data-hint="Find commands and edit shortcuts (Ctrl+K)">Commands</button>
          <button onClick={()=>setPreferencesOpen('layout')}>Workspace</button>
          <button disabled={!selectedClip} onClick={()=>runCommand('trimIn')}>Trim start to playhead</button>
          <button disabled={!selectedClip} onClick={()=>runCommand('trimOut')}>Trim end to playhead</button>
          <button data-hint="Add title" onClick={insertTitle}><TextFields fontSize="small"/> Text</button>
          <button data-hint="Add video track" disabled={timeline.tracks.length>=24} onClick={()=>commit(newTrack(timeline,'video'))}><Add fontSize="small"/> Video</button>
          <button data-hint="Add audio track" disabled={timeline.tracks.length>=24} onClick={()=>commit(newTrack(timeline,'audio'))}><Add fontSize="small"/> Audio</button>
          <button data-hint="Add an adjustment layer above the visual tracks" onClick={insertAdjustment}>Adjustment layer</button>
          <span className="hv-tb-sep"/>
          <button data-hint="Copy selected clips (Ctrl+C)" disabled={!selection.length} onClick={copySelection}>Copy</button>
          <button data-hint="Paste at playhead (Ctrl+V)" disabled={!canPaste} onClick={()=>pasteSelection()}>Paste</button>
          <button data-hint="Duplicate selected clips (Ctrl+D)" disabled={!selection.length} onClick={duplicateSelection}>Duplicate</button>
          <button disabled={selection.length<2} onClick={()=>{try{commit(linkClips(timeline,selection));}catch(error){setError(String(error));}}}>Link clips</button>
          <button disabled={!selectedClip?.linkId} onClick={()=>{try{commit(linkClips(timeline,selection,true));}catch(error){setError(String(error));}}}>Unlink</button>
          <button aria-pressed={rippleTrims} data-hint="Close or extend the gap after a trimmed clip" onClick={()=>setRippleTrims(value=>!value)}>Ripple trim</button>
          <button data-hint="Ripple delete on selected tracks (Shift+Delete)" disabled={!selection.length} onClick={()=>deleteSelected(true)}>Ripple delete</button>
          <button aria-pressed={followHead} onClick={()=>setFollowHead(value=>!value)}>Follow playhead</button>
          <button aria-pressed={showPacing} onClick={()=>setShowPacing(value=>!value)}>Pacing</button>
          <button data-hint="Fit the full timeline" onClick={()=>changeZoom((navigation.viewport.width-24)/Math.max(1/project.fps,total),true)}>Fit</button>
        </div>
      <div className="hv-timeline-meta">
        <VideoSequenceBar project={project} path={compoundPath} selectedCount={selection.length}
          onChange={next=>{finishGesture();commitProject(next);}}
          onUp={()=>changeScene(compoundPath.slice(0,-1))}
          onCompound={()=>{try{const result=makeCompound(timeline,linkedSelection(timeline,selection));commit(result.timeline);setSelected(result.clip.id);}catch(error){setError(String(error));}}}
          onError={setError}/>
      <div className="hv-working-bar hv-inline-actions" aria-label="Timeline tools">
        <button aria-pressed={rangeMode==='box'} onClick={()=>{setRangeMode(rangeMode==='box'?undefined:'box');setRange(undefined);}}>Box select</button>
        <button aria-pressed={rangeMode==='range'} onClick={()=>{setRangeMode(rangeMode==='range'?undefined:'range');setRange(undefined);}}>Time range</button>
        <button disabled={!total} data-hint="Set the start of the timeline range (I)" onClick={()=>markTimelineRange('start')}>Mark In</button>
        <button disabled={!total} data-hint="Set the end of the timeline range (O)" onClick={()=>markTimelineRange('end')}>Mark Out</button>
        <button aria-pressed={filmstrip} onClick={()=>{setFilmstrip(!filmstrip);setSkim(undefined);}}>Filmstrips</button>
        <button onClick={()=>setShelf('markers')}>Chapters</button>
        <button onClick={()=>setShelf('checkpoints')}>Checkpoints</button>
        <button onClick={()=>setShelf('jobs')}>Jobs{jobs.jobs.filter(job=>job.status==='running'||job.status==='queued').length>0?' · '+jobs.jobs.filter(job=>job.status==='running'||job.status==='queued').length:''}</button>
        <button onClick={()=>setShelf('exports')}>Finished exports</button>
        {range&&rangeMode==='range'&&<>
          <span>{range.start.toFixed(2)} – {range.end.toFixed(2)} s</span>
          <button disabled={!selection.length} onClick={()=>editSelectedRange('copy')}>Copy range</button>
          <button disabled={!selection.length} onClick={()=>editSelectedRange('cut')}>Cut range</button>
          <button disabled={!selection.length} onClick={()=>editSelectedRange('move')}>Move to playhead</button>
        </>}
      </div></div></div>}
      {showPacing&&<div className="hv-pacing-bar">
        <button onClick={()=>addMarker('marker')}>Add marker</button>
        <button onClick={()=>addMarker('beat')}>Mark beat</button>
        <button aria-pressed={beatSnap} onClick={()=>setBeatSnap(value=>!value)}>Snap to beats</button>
        <button disabled={beatBusy||!selectedClip||!assetOf(selectedClip)||assetOf(selectedClip)?.kind==='image'} onClick={()=>void detectBeats()}>Detect beats</button>
        <label>Review beat<select aria-label="Review timeline beat" value="" onChange={event=>{if(event.target.value)seekTo(Number(event.target.value));}}>
          <option value="">{timeline.markers?.filter(marker=>marker.kind==='beat').length??0} beats</option>
          {nearbyMarkers.filter(marker=>marker.kind==='beat').map(marker=><option key={marker.id} value={marker.time}>{marker.time.toFixed(3)} s{marker.automatic?' · Detected':''}</option>)}
        </select></label>
        <button disabled={!nearestBeat||!selectedClip||!!selectedTrack?.locked} onClick={()=>{if(nearestBeat&&selectedClip)commit(moveClip(timeline,selectedClip.id,nearestBeat.time));}}>Align clip to beat</button>
        <button disabled={!nearestBeat||!selectedClip||!!selectedTrack?.locked} onClick={()=>cutOnBeat(false)}>Cut on beat</button>
        <button disabled={!nearestBeat||!selectedClip||selectedTrack?.kind!=='video'||!!selectedTrack.locked||!!selectedClip.adjustment} onClick={()=>cutOnBeat(true)}>Dissolve on beat</button>
        <button disabled={!nearbyMarkers.some(marker=>Math.abs(marker.time-head)<1/project.fps)} onClick={()=>{
          commit({...timeline,markers:timeline.markers?.filter(marker=>Math.abs(marker.time-head)>=1/project.fps)});
        }}>Remove marker here</button>
      </div>}
      <div className={`hv-timeline-scroll${panTimeline?' is-pan':''}`} ref={navigation.scroll} onScroll={navigation.measure}
        onPointerDownCapture={event=>{
          if(event.ctrlKey&&event.button===1){
            event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
            zoomDrag.current={id:event.pointerId,y:event.clientY,zoom,anchor:zoomAnchor(event.clientX)};
            return;
          }
          if(!panTimeline||event.button!==0||!(event.target as Element).closest('.hv-ruler-scale,.hv-track-lane'))return;
          const el=event.currentTarget;
          event.preventDefault();event.stopPropagation();el.setPointerCapture(event.pointerId);
          panning.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:el.scrollLeft,top:el.scrollTop};
        }}
        onPointerMove={event=>{
          const zooming=zoomDrag.current;
          if(zooming?.id===event.pointerId){
            changeZoom(zooming.zoom*Math.exp((zooming.y-event.clientY)*.014),false,zooming.anchor);
            return;
          }
          const pan=panning.current;
          if(!pan||pan.id!==event.pointerId)return;
          event.currentTarget.scrollLeft=pan.left+pan.x-event.clientX;
          event.currentTarget.scrollTop=pan.top+pan.y-event.clientY;
        }}
        onLostPointerCapture={event=>{
          if(panning.current?.id===event.pointerId)panning.current=undefined;
          if(zoomDrag.current?.id===event.pointerId)zoomDrag.current=undefined;
        }}
        onAuxClick={event=>{if(event.ctrlKey&&event.button===1)event.preventDefault();}}>
        <div className="hv-time-grid" style={{width:viewportWidth+TRACK_HEADER_WIDTH}}>
        <div className="hv-ruler"><div className="hv-track-name"/>
          <div className="hv-ruler-scale" style={{width:viewportWidth,'--hv-minor-tick':(PX/project.fps>=7?PX/project.fps:Math.max(8,interval*PX/8))+'px'} as CSSProperties}
            tabIndex={-1} {...navigation.pointerHandlers} onPointerDown={event=>navigation.start(event)}>
            {ticks.map(time=><span key={time} style={{left:time*PX}}>{timecode(time,project.fps)}</span>)}
            {visibleMarkers.map(marker=><button key={marker.id} className={`hv-time-marker is-${marker.kind}`}
              data-hint={`${marker.label??(marker.automatic?'Detected ':'')+marker.kind} · ${marker.time.toFixed(3)} s`} aria-label={`Jump to ${marker.label??marker.kind} at ${marker.time.toFixed(3)} seconds`}
              style={{left:marker.time*PX,...marker.color?{'--hv-marker-color':marker.color}:{} } as CSSProperties}
              onPointerDown={event=>event.stopPropagation()} onClick={()=>seekTo(marker.time)} />)}
            <button type="button" className="hv-head-handle" role="slider" aria-label="Timeline playhead"
              aria-valuemin={0} aria-valuemax={length} aria-valuenow={head} aria-valuetext={`${head.toFixed(3)} seconds`}
              style={{left:head*PX,visibility:head*PX<navigation.viewport.x-1&&!navigation.scrubbing?'hidden':undefined}} {...navigation.pointerHandlers} onPointerDown={event=>navigation.start(event,head)}
              onKeyDown={event=>{
                if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
                event.preventDefault();
                if (event.key==='Home'||event.key==='End') seekTo(event.key==='Home'?0:total);
                else stepFrame(event.key==='ArrowLeft'?-1:1,event.shiftKey?10:1);
              }}/>
          </div></div>
        {timeline.tracks.map((track,index)=><Fragment key={track.id}>
          {track.folder&&track.folder!==timeline.tracks[index-1]?.folder&&<div className="hv-track-folder">
            <button aria-expanded={!collapsed.includes(track.folder)} onClick={()=>setCollapsed(items=>items.includes(track.folder!)?items.filter(item=>item!==track.folder):[...items,track.folder!])}>
              {collapsed.includes(track.folder)?'▸':'▾'} {track.folder}</button>
          </div>}
          {(!track.folder||!collapsed.includes(track.folder))&&<div className="hv-track" data-track-id={track.id}
            data-kind={track.kind} data-primary={track.id===primaryVideo||undefined}>
          <div className="hv-track-name" onContextMenu={event=>openContext(event,track)}>
            <div className="hv-track-controls">
              <button data-hint={track.kind==='audio'?(track.muted?'Unmute track':'Mute track'):(track.muted?'Show track':'Hide track')}
                aria-label={`${track.kind==='audio'?(track.muted?'Unmute':'Mute'):(track.muted?'Show':'Hide')} ${track.name} track`}
                onClick={()=>commit({...timeline,tracks:timeline.tracks.map(t=>t.id===track.id?{...t,muted:!t.muted}:t)})}>
                {track.kind==='audio'?(track.muted?<VolumeOff/>:<VolumeUp/>):(track.muted?<VisibilityOffOutlined/>:<VisibilityOutlined/>)}
              </button>
              <button aria-label={`${track.locked?'Unlock':'Lock'} ${track.name} track`} data-hint={track.locked?'Unlock track':'Lock track'} onClick={()=>commit({...timeline,tracks:timeline.tracks.map(t=>t.id===track.id?{...t,locked:!t.locked}:t)})}>
                {track.locked?<LockOutlined/>:<LockOpenOutlined/>}
              </button>
            </div>
            <input className="hv-track-label" aria-label={`Name of ${track.name} track`} key={track.name} defaultValue={track.name} maxLength={64}
              disabled={track.locked} onBlur={event=>{
                const name=event.currentTarget.value.trim()||track.name;
                event.currentTarget.value=name;
                if(name!==track.name)commit({...timeline,tracks:timeline.tracks.map(item=>item.id===track.id?{...item,name}:item)});
              }} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
            <div className="hv-track-secondary"><button aria-label={`Sync lock for ${track.name} track`} data-hint={track.syncLock?'Turn sync lock off':'Sync this track to ripple edits'} aria-pressed={!!track.syncLock}
              onClick={()=>commit({...timeline,tracks:timeline.tracks.map(t=>t.id===track.id?{...t,syncLock:!t.syncLock}:t)})}>↔</button>
              <select className="hv-track-order" aria-label={`Reorder ${track.name} track`} disabled={track.locked} value="" onChange={event=>{
                const tracks=[...timeline.tracks],index=tracks.indexOf(track),target=index+Number(event.target.value);
                if (target<0||target>=tracks.length)return;
                [tracks[index],tracks[target]]=[tracks[target],tracks[index]];
                commit({...timeline,tracks});
              }}><option value="">↕</option><option value="-1" disabled={timeline.tracks[0]===track}>Move up</option><option value="1" disabled={timeline.tracks.at(-1)===track}>Move down</option></select>
              {!track.locked&&!timeline.clips.some(c=>c.trackId===track.id)&&<button aria-label={`Remove empty ${track.name} track`} data-hint={`Remove empty ${track.name} track`} onClick={()=>commit({...timeline,tracks:timeline.tracks.filter(t=>t.id!==track.id)})}><DeleteOutline fontSize="inherit"/></button>}</div></div>
          <div data-lane-id={track.id} className={`hv-track-lane${(drag?.edge==='move'&&drag.targetTrackId===track.id&&!track.locked)||libraryDrag.hover?.target?.kind==='insert'&&libraryDrag.hover.target.trackId===track.id?' is-drop-target':''}`} style={{width:viewportWidth,backgroundSize:`${interval*PX}px 100%`,backgroundImage:"linear-gradient(90deg,transparent calc(100% - 1px),color-mix(in srgb,var(--text,#fff) 8%,transparent))"}}
            tabIndex={-1} onContextMenu={event=>openContext(event,track)} {...navigation.pointerHandlers} onPointerDown={event=>{
              if(selectionStart(event,track.id))return;
              if(event.target===event.currentTarget){setSelection([]);navigation.start(event);}
            }} onPointerMove={event=>{if(!selectionMove(event))navigation.pointerHandlers.onPointerMove(event);}}
            onPointerUp={event=>{if(!selectionEnd(event))navigation.pointerHandlers.onPointerUp(event);}}
            onPointerCancel={event=>{if(!selectionEnd(event))navigation.pointerHandlers.onPointerCancel(event);}}
            onLostPointerCapture={event=>{if(!selectionEnd(event))navigation.pointerHandlers.onLostPointerCapture(event);}}>
            {(clipsByTrack.get(track.id)??[]).filter(c=>drag?.ids.includes(c.id)||c.start+c.duration>=visibleStart&&c.start<=visibleEnd).map(clip=>{
              const asset=assetOf(clip);
              const active=drag&&(drag.edge==='move'?drag.ids.includes(clip.id):drag.id===clip.id);
              const offset=active?(drag.edge==='move'?drag.delta:drag.edge==='left'?drag.delta:0):0;
              const length=active?(drag.edge==='left'?clip.duration-drag.delta:drag.edge==='right'?clip.duration+drag.delta:clip.duration):clip.duration;
              return <div key={clip.id} data-clip-id={clip.id} tabIndex={0} role="button" aria-pressed={selectedIds.has(clip.id)}
                onKeyDown={event=>{
                  if(event.key==='Enter'){event.preventDefault();setSelected(clip.id);}
                  if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)openContext({clientX:0,clientY:0,currentTarget:event.currentTarget,preventDefault:()=>event.preventDefault(),stopPropagation:()=>event.stopPropagation()},track,clip);
                }} onContextMenu={event=>openContext(event,track,clip)} className={`hv-clip hv-clip-${track.kind}${selectedIds.has(clip.id)?' is-selected':''}${track.locked?' is-locked':''}${libraryDrag.hover?.target?.kind==='apply'&&libraryDrag.hover.target.clipId===clip.id?' is-card-drop-target':''}`}
                style={{left:Math.max(0,(clip.start+offset)*PX),width:Math.max(10,length*PX),...clip.labelColor?{'--hv-clip-label':clip.labelColor}:{} } as CSSProperties}
                data-hint={`${clip.title??asset?.name??'Clip'} · ${sec(clip.duration)} · drag to move, edges to trim`}
                onPointerDown={(event:PointerEvent<HTMLDivElement>)=>{setSkim(undefined);if(!selectionStart(event,track.id))pointDown(event,clip,'move');}}
                onPointerMove={event=>{
                  if(selectionMove(event))return;
                  if(filmstrip&&!event.buttons&&!playing&&!drag&&event.pointerType==='mouse'&&track.kind==='video'&&assetOf(clip)?.kind==='video')
                    setSkim(cap(Math.floor(navigation.timeAt(event.clientX)*project.fps)/project.fps,clip.start,Math.max(clip.start,clipEnd(clip)-1/project.fps)));
                  pointMove(event);
                }} onPointerLeave={()=>setSkim(undefined)}
                onPointerUp={event=>{if(!selectionEnd(event))pointUp(event);}} onPointerCancel={event=>{if(!selectionEnd(event))pointUp(event);}}
                onLostPointerCapture={event=>{if(!selectionEnd(event))pointUp(event);}}
                onDoubleClick={event=>{if(clip.compound){event.stopPropagation();changeScene([...compoundPath,clip.id]);}}}>
                <span className="hv-grip hv-grip-left" onPointerDown={(e:PointerEvent<HTMLSpanElement>)=>pointDown(e,clip,'left')}/>
                {filmstrip&&track.kind==='video'&&assetOf(clip)?.kind==='video'&&sources[clip.assetId??'']&&length*PX>=52&&
                  <VideoClipFilmstrip clip={clip} width={length*PX} url={sources[clip.assetId!]}
                    visibleLeft={(visibleStart-clip.start-offset)*PX} visibleRight={(visibleEnd-clip.start-offset)*PX}
                    fps={assetOf(clip)?.frameRate??project.fps}/>}
                {assetOf(clip)?.kind==='image'&&sources[clip.assetId??'']&&!assetOf(clip)?.crop&&!/\.tga$/i.test(assetOf(clip)?.name??'')&&<span className="hv-timeline-clip-thumb" style={{backgroundImage:`url("${sources[clip.assetId??'']}")`}}/>}
                {!!asset?.waveform?.length&&<VideoClipWaveform asset={asset} clip={clip} url={sources[asset.id]}
                  zoom={PX} visibleStart={visibleStart} visibleEnd={visibleEnd} duration={length} offset={offset}
                  trim={active&&drag.edge==='left'?offset:0} playing={playing}/>}
                {!!(clip.keyframes?.length||clip.volumeKeys?.length)&&<span className="hv-timeline-keys" aria-hidden="true">
                  {[...new Set([...(clip.keyframes??[]),...(clip.volumeKeys??[])].map(key=>key.time))].filter(time=>time<=clip.duration).slice(0,300)
                    .map(time=><i key={time} style={{left:`${time/clip.duration*100}%`}}/>)}
                </span>}
                <span className="hv-clip-content">{track.kind==='audio'?<Audiotrack fontSize="inherit"/>:track.kind==='title'?<TextFields fontSize="inherit"/>:<MovieOutlined fontSize="inherit"/>}<b>{clip.title??assetOf(clip)?.name??'Clip'}</b></span>
                {selectedClip?.id===clip.id&&track.kind==='audio'&&length*PX>=50&&<VideoAudioHandles clip={clip} disabled={track.locked}
                  onChange={updateClip} onEnd={cancel=>cancel?cancelGesture():finishGesture()}/>}
                <span className="hv-grip hv-grip-right" onPointerDown={(e:PointerEvent<HTMLSpanElement>)=>pointDown(e,clip,'right')}/>
              </div>;
            })}
            {transitionSpans.filter(span=>(span.to??span.from)?.trackId===track.id&&span.end>=visibleStart&&span.start<=visibleEnd).map(span=>
              <span key={(span.to??span.from)!.id+':'+span.transition.placement} className="hv-transition-strip"
                style={{left:span.start*PX,width:Math.max(5,(span.end-span.start)*PX)}}
                aria-hidden="true"><VideoTransitionGlyph/></span>)}
            {libraryDrag.hover?.target?.trackId===track.id&&libraryDrag.hover.target.transition&&(()=>{
              const place=libraryDrag.hover.target.transition;
              return <span className="hv-transition-strip is-preview" style={{left:place.start*PX,width:Math.max(12,(place.end-place.start)*PX)}}
                aria-hidden="true"><VideoTransitionGlyph/><span>{place.placement==='middle'?'Split and transition':place.placement==='cut'?'At cut':place.placement==='start'?'Clip start':'Clip end'}</span></span>;
            })()}
          </div></div>}
          {keyLanesOpen&&selectedClip?.trackId===track.id&&(!track.folder||!collapsed.includes(track.folder))&&
            <VideoKeyframeLanes key={selectedClip.id} clip={selectedClip} fps={project.fps} zoom={PX} width={viewportWidth} head={head}
              visibleStart={visibleStart} visibleEnd={visibleEnd} locked={!!track.locked}
              onChange={updateClip} onSeek={seekTo} onCommit={finishGesture} onCancel={cancelGesture}/>}
        </Fragment>)}
        {drag?.guide!==undefined&&<i aria-hidden="true" className="hv-magnet-guide" style={{left:TRACK_HEADER_WIDTH+drag.guide*PX}}/>}
        {navigation.stop&&<i aria-hidden="true" className="hv-magnet-guide hv-playhead-snap"
          style={{left:TRACK_HEADER_WIDTH+navigation.stop.frame/project.fps*PX}}><span>{navigation.stop.label}</span></i>}
        {transitionGuide!==undefined&&<i aria-hidden="true" className="hv-transition-guide" style={{left:TRACK_HEADER_WIDTH+transitionGuide*PX}}/>}
        {timelineSpan&&<div className={`hv-timeline-span${markedRange?' is-marked':loop&&!range?' is-loop':''}`} aria-hidden="true"
          style={{left:TRACK_HEADER_WIDTH+timelineSpan.start*PX,width:Math.max(1,(timelineSpan.end-timelineSpan.start)*PX)}}/>}
        <div className="hv-head-marker" style={{left:TRACK_HEADER_WIDTH+head*PX,visibility:head*PX<navigation.viewport.x-1&&!navigation.scrubbing?'hidden':undefined}} aria-hidden="true"
          {...navigation.pointerHandlers} onPointerDown={event=>navigation.start(event,head)} />
        </div></div>
    </section>
    <div className="hv-statusbar">
      <span className="hv-status-format" data-hint={`${project.width} × ${project.height} · ${capabilities?.backend??'Checking media'}`}>
        <MonitorOutlined/> {project.height}p · {project.fps} fps
      </span>
      <button type="button" className="hv-status-preview" disabled={!total} onClick={togglePlayback}>{playing?<Pause/>:<PlayArrow/>}{playing?'Pause':'Preview'}</button>
      <span className="hv-status-message" data-hint={error||progress||notice}>{error?<b className="hv-error" role="alert">{error}</b>:progress||notice||
        (lastExport?`Exported ${lastExport.framesWritten} frames`:'')}</span>
      <button type="button" data-hint="More timeline tools" aria-expanded={timelineTools} onClick={()=>setTimelineTools(value=>!value)}><Tune/> Timeline tools</button>
    </div>
    {editorialOpen&&<VideoEditorialTools timeline={timeline} selected={selectedClip} head={head} fps={project.fps} width={project.width} height={project.height}
      onSeek={seekTo} onChange={commit} onClose={()=>setEditorialOpen(false)} onHighlights={makeHighlights} onOtio={isNativeMediaDesktop()?interchange:undefined}
      meters={meters} playing={playing} onPlay={togglePlayback}
      onMulticam={makeMulticam} selectionCount={selection.length} nativeTimecode={isNativeMediaDesktop()} onCommit={finishGesture} onMixer={(id,patch,preview)=>{
        const current=latestModel.current.timeline;
        const next={...current,tracks:current.tracks.map(track=>track.id===id&&!track.locked?{...track,...patch}:track)};
        if(preview)previewTimeline(next);else commit(next);
      }}/>}
    {sourceAnalysis&&selectedClip&&assetOf(selectedClip)&&<VideoSourceAnalysis key={selectedClip.id+sourceAnalysis} mode={sourceAnalysis}
      clip={selectedClip} asset={assetOf(selectedClip)!} fps={project.fps} timeline={timeline} width={project.width} height={project.height}
      onClose={()=>setSourceAnalysis(undefined)} onSeek={seekTo} onGain={gain=>{
        const keys=selectedClip.volumeKeys;
        const ratio=keys?.length?gain/Math.max(.0001,...keys.map(key=>key.value)):1;
        updateClip({volume:gain,volumeKeys:keys?.map(key=>({...key,value:Math.min(2,key.value*ratio)}))});
      }} onCuts={times=>{
        let next=latestModel.current.timeline,id=selectedClip.id;
        const frame=1/project.fps;
        for(const time of times){
          const result=splitLinkedClips(next,[id],time,frame);
          const right=result.timeline.clips.find(clip=>result.ids.includes(clip.id)&&clip.trackId===selectedClip.trackId);
          if(!right)throw Error('A selected cut is too close to a boundary or a linked track is locked.');
          next=result.timeline;id=right.id;
        }
        commit(next);seekTo(times[0]);setSelection([id]);setNotice(times.length+' reviewed cuts applied.');
      }}/>}
    {preferencesOpen&&<VideoWorkspacePreferences commands={preferencesOpen==='commands'} value={preferences} onChange={changePreferences}
      onRun={command=>{setPreferencesOpen(undefined);runCommand(command);}} onClose={()=>setPreferencesOpen(undefined)}
      onMonitor={isNativeMediaDesktop()?()=>{void openMonitor().then(()=>setPreferencesOpen(undefined)).catch(error=>setError(String(error)));}:undefined}/>}
    <Menu open={!!contextMenu} onClose={()=>setContextMenu(undefined)} anchorReference="anchorPosition"
      anchorPosition={contextMenu?{left:contextMenu.x,top:contextMenu.y}:undefined}>
      {contextMenu?.clip&&<MenuItem disabled={contextMenu.track.locked} onClick={()=>contextAction(()=>{
        const clip=contextMenu.clip!,time=Math.round(contextMenu.time*project.fps)/project.fps;
        const result=splitLinkedClips(timeline,[clip.id],time,1/project.fps);commit(result.timeline);
        if(result.ids.length){setSelection(result.ids);seekTo(time);}
      })}>Split here</MenuItem>}
      {contextMenu?.clip?.assetId&&<MenuItem disabled={contextMenu.track.locked||!!contextMenu.clip.linkId}
        onClick={()=>contextAction(()=>setReplaceId(contextMenu.clip!.id))}>Replace footage…</MenuItem>}
      {contextMenu?.clip&&<MenuItem onClick={()=>contextAction(()=>{
        setAttributeSource(contextMenu.clip);setNotice('Clip settings copied. Select the destination clips and open Paste settings.');
      })}>Copy clip settings</MenuItem>}
      {contextMenu?.clip&&<MenuItem disabled={!attributeSource||contextMenu.track.locked} onClick={()=>contextAction(()=>setAttributesOpen(true))}>Paste clip settings…</MenuItem>}
      {contextMenu?.clip&&<MenuItem onClick={()=>contextAction(()=>{
        const next=loopSpan(timeline,[contextMenu.clip!.id],undefined,project.fps);
        if(next){setLoop(next);seekTo(next.start);}
      })}>Loop this clip</MenuItem>}
      {contextMenu&&!contextMenu.clip&&gapAt(timeline,contextMenu.track.id,contextMenu.time)&&
        <MenuItem disabled={contextMenu.track.locked} onClick={()=>contextAction(()=>commit(closeGap(timeline,contextMenu.track.id,contextMenu.time)))}>Close gap</MenuItem>}
      {contextMenu?.clip&&VIDEO_LABEL_COLORS.map((color,index)=><MenuItem key={color} disabled={contextMenu.track.locked}
        onClick={()=>contextAction(()=>labelClip(contextMenu.clip!,contextMenu.clip?.labelColor===color?undefined:color))}>
        <i className="hv-label-swatch" style={{backgroundColor:color}}/> {['Blue','Mint','Lilac','Gold','Coral'][index]} label
      </MenuItem>)}
      {contextMenu&&!contextMenu.clip&&<MenuItem disabled={contextMenu.track.locked} onClick={()=>contextAction(()=>{
        setFolderName(contextMenu.track.folder??'');setFolderTarget(contextMenu.track);
      })}>Set track folder…</MenuItem>}
    </Menu>
    {starter&&<StartFromFootage assets={timeline.assets.filter(asset=>!offline[asset.id]&&!asset.sticker)} sources={sources}
      onClose={()=>setStarter(false)} onStart={startEdit} onImport={()=>{
        importMode.current='media';
        if(isNativeMediaDesktop())void addDesktopFiles('media');else fileInput.current?.click();
      }}/>}
    {replacementClip&&<ReplaceFootage assets={timeline.assets.filter(asset=>asset.id!==replacementClip.assetId&&!offline[asset.id]&&
      (assetOf(replacementClip)?.kind==='audio'?asset.kind==='audio':asset.kind!=='audio'))} sources={sources} clip={replacementClip}
      onClose={()=>setReplaceId(undefined)} onApply={patch=>{
        const current=latestModel.current.timeline;
        const target=current.clips.find(clip=>clip.id===replacementClip.id);
        if(target&&!target.linkId&&!current.tracks.find(track=>track.id===target.trackId)?.locked)
          commit({...current,clips:current.clips.map(clip=>clip===target?{...clip,...patch}:clip)});
        setReplaceId(undefined);
      }}/>}
    {attributesOpen&&attributeSource&&<PasteClipSettings source={attributeSource.title??assetOf(attributeSource)?.name??'Copied clip'}
      count={editableClips(timeline,selection).filter(clip=>clip.id!==attributeSource.id).length} onClose={()=>setAttributesOpen(false)}
      onPaste={groups=>{commit(pasteAttributes(timeline,attributeSource,selection,groups));setAttributesOpen(false);}}/>}
    {folderTarget&&<Dialog open maxWidth="xs" fullWidth onClose={()=>setFolderTarget(undefined)}>
      <DialogTitle>Track folder</DialogTitle><DialogContent><label className="hv-field">Folder for {folderTarget.name}
        <input autoFocus maxLength={64} value={folderName} onChange={event=>setFolderName(event.target.value)} list="hv-track-folders"/>
        <datalist id="hv-track-folders">{[...new Set(timeline.tracks.flatMap(track=>track.folder?[track.folder]:[]))].map(folder=><option key={folder}>{folder}</option>)}</datalist>
      </label></DialogContent><DialogActions><Button onClick={()=>setFolderTarget(undefined)}>Cancel</Button><Button variant="contained" onClick={()=>{
        commit({...timeline,tracks:timeline.tracks.map(track=>track.id===folderTarget.id&&!track.locked?{...track,folder:folderName.trim()||undefined}:track)});
        setFolderTarget(undefined);
      }}>Save folder</Button></DialogActions>
    </Dialog>}
    {relinkReview&&<Dialog open maxWidth="sm" fullWidth onClose={()=>setRelinkReview(undefined)}><DialogTitle>Review relink matches</DialogTitle>
      <DialogContent><p>{relinkReview.length} source matches. Unmatched files stay on the offline list.</p>
        {relinkReview.map(item=><p key={item.asset.id} data-hint={item.replacement.path}>{item.asset.name} → {item.replacement.path}</p>)}</DialogContent>
      <DialogActions><Button onClick={()=>setRelinkReview(undefined)}>Cancel</Button><Button variant="contained" onClick={()=>{
        const current=latestModel.current.timeline;
        const matches=new Map(relinkReview.map(item=>[item.asset.id,item]));
        const valid=relinkReview.filter(item=>current.assets.some(asset=>asset===item.asset));
        const accepted=new Set(valid.map(item=>item.asset.id));
        for(const item of valid)forgetMediaUrl(item.asset.id);
        commit({...current,assets:current.assets.map(asset=>accepted.has(asset.id)?matches.get(asset.id)!.replacement:asset)});
        setSources(previous=>({...previous,...Object.fromEntries(valid.map(item=>[item.asset.id,item.url]))}));
        setNotice(valid.length+' media sources relinked.');setRelinkReview(undefined);
      }}>Relink matching files</Button></DialogActions></Dialog>}
    {shelf&&<VideoWorkspaceShelf tab={shelf} project={project} timeline={timeline} markers={markers} head={head}
      jobs={jobs.jobs} exports={exports} onTab={setShelf} onClose={()=>setShelf(undefined)}
      onMarkers={next=>commit({...timeline,markers:next})} onSeek={seekTo} onCopy={next=>{setShelf(undefined);(onOpenCopy??onChange)(next);}}
      onCancel={jobs.cancel} onRetry={jobs.retry}/>}
    {voiceover&&<VideoVoiceover onClose={()=>{setVoiceover(false);setPlaying(false);}} onStart={()=>{
      voiceStart.current=Math.min(head,Math.max(0,total));setLoop(undefined);setHead(voiceStart.current);setDirection(1);setPlaying(total>voiceStart.current);
    }} onStop={()=>setPlaying(false)} onTake={acceptVoice}/>}
    {soundtrack&&<AuditionSoundtrack timeline={{...timeline,tracks:[soundtrack.track],clips:soundtrack.parts}}
      sources={sources} start={soundtrack.span.start} end={soundtrack.span.end} count={soundtrack.parts.length} onClose={()=>setSoundtrack(undefined)}
      onApply={()=>{
        if(!timeline.clips.includes(soundtrack.original)){setError('The source clip changed. Make a new music preview.');return;}
        commit({...timeline,tracks:timeline.tracks.some(track=>track.id===soundtrack.track.id)?timeline.tracks:[...timeline.tracks,soundtrack.track],
          clips:[...timeline.clips.filter(clip=>clip!==soundtrack.original),...soundtrack.parts]});
        setSelection(soundtrack.parts.map(clip=>clip.id));setSoundtrack(undefined);seekTo(soundtrack.span.start);
      }}/>}
    <VideoExportDialog open={exportOpen} name={project.sequence?`${project.name} - ${project.sequence.name}`:project.name} credits={credits} width={project.width} height={project.height} fps={project.fps}
      ranges={timeline.ranges?.filter(range=>range.end<=total+1e-7)} sequences={compoundPath.length?undefined:project.sequences} onClose={()=>setExportOpen(false)}
      onQueue={queueExports} issues={issues} onReview={issue=>{setExportOpen(false);seekTo(issue.time);if(issue.clipId)setSelected(issue.clipId);}}/>
  </main>;
}
