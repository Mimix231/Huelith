import { CREATIVITY_FILTERS, LAYER_EFFECTS } from './studio-catalog';
import { FX_PRESETS } from './fx';

/** Each Huelith mini-app owns a coherent creative workflow. The effect engine
 * remains shared: app navigation changes discovery, never processing quality. */
export interface HuelithStudioApp {
  id: string;
  name: string;
  summary: string;
  symbol: string;
  accent: string;
  groups: readonly string[];
  destination: 'creativity' | 'effects' | 'fx';
}
export const STUDIO_APPS: readonly HuelithStudioApp[] = [
  {id:'colors',name:'Chromatica',summary:'Grade, balance and shape every hue.',symbol:'◉',accent:'rose',groups:['Color & light','Color Science'],destination:'creativity'},
  {id:'light',name:'Luminara',summary:'Lighting, atmosphere and dramatic rays.',symbol:'☼',accent:'amber',groups:['Lighting & Atmosphere'],destination:'creativity'},
  {id:'detail',name:'Detailworks',summary:'Texture, clarity, sharpening and grain.',symbol:'▦',accent:'sky',groups:['Detail & texture'],destination:'creativity'},
  {id:'styles',name:'Styleforge',summary:'Classic illustration and stylization.',symbol:'✦',accent:'lavender',groups:['Stylize'],destination:'creativity'},
  {id:'painting',name:'Paintoria',summary:'Ink, charcoal, brush and fine art.',symbol:'✎',accent:'peach',groups:['Artistic Painting'],destination:'creativity'},
  {id:'distort',name:'Warpworks',summary:'Distort, twist and reshape geometry.',symbol:'⟲',accent:'cyan',groups:['Distortion & Geometry'],destination:'creativity'},
  {id:'anime',name:'Manga Lab',summary:'Comic tone, cel shading and manga ink.',symbol:'✧',accent:'pink',groups:['Anime & Comics'],destination:'creativity'},
  {id:'materials',name:'Materialia',summary:'Metal, fabric, stone and surfaces.',symbol:'◇',accent:'mint',groups:['Materials & Surfaces'],destination:'creativity'},
  {id:'digital',name:'Signalworks',summary:'Digital damage, pixels and signals.',symbol:'⌁',accent:'violet',groups:['Digital & Experimental'],destination:'creativity'},
  {id:'cinematic',name:'Optica',summary:'Lens treatments and cinematic finishing.',symbol:'◎',accent:'blue',groups:['Cinematic & Optical'],destination:'creativity'},
  {id:'layerfx',name:'Layer Effects',summary:'Outlines, glows, shadows, cutout and backdrops.',symbol:'◈',accent:'mint',groups:['Stylize','Creative effects'],destination:'effects'},
  {id:'signature',name:'Signature FX',summary:'Huelith Originals: independent, editable visual FX.',symbol:'✷',accent:'rainbow',groups:['Signature FX'],destination:'fx'},
  {id:'favorites',name:'Your Favorites',summary:'Your personally starred creative tools.',symbol:'★',accent:'amber',groups:[],destination:'creativity'},
  {id:'recent',name:'Recently Used',summary:'Return to the tools you used last.',symbol:'↺',accent:'sky',groups:[],destination:'creativity'},
];
export const STUDIO_APP_BY_ID = new Map(STUDIO_APPS.map(app=>[app.id,app]));
export function appOperationCount(app:HuelithStudioApp,favorites:readonly string[]=[],recent:readonly string[]=[]):number {
  if(app.id==='favorites')return favorites.length;
  if(app.id==='recent')return recent.length;
  if(app.destination==='fx')return Object.keys(FX_PRESETS).length;
  const catalog=app.destination==='effects'?LAYER_EFFECTS:CREATIVITY_FILTERS;
  return catalog.filter(item=>app.groups.includes(item.group)).length;
}
export function appContainsKind(app:HuelithStudioApp,kind:string,favorites:readonly string[]=[],recent:readonly string[]=[]):boolean{
  if(app.id==='favorites')return favorites.includes(kind);
  if(app.id==='recent')return recent.includes(kind);
  const catalog=app.destination==='effects'?LAYER_EFFECTS:CREATIVITY_FILTERS;
  return catalog.some(item=>item.kind===kind && app.groups.includes(item.group));
}
