export type StudioLayout={library:number;inspector:number;timeline:number;swap:boolean};
export const DEFAULT_STUDIO_LAYOUT:StudioLayout={library:230,inspector:240,timeline:292,swap:false};
export const VIDEO_COMMANDS=[
  ['reverse','Play backwards','KeyJ'],['pause','Pause','KeyK'],['forward','Play forwards','KeyL'],
  ['previous','Previous cut','BracketLeft'],['next','Next cut','BracketRight'],
  ['trimIn','Trim In to playhead','KeyQ'],['trimOut','Trim Out to playhead','KeyW'],
  ['split','Split at playhead','KeyS'],
] as const;
export type StudioCommand=typeof VIDEO_COMMANDS[number][0];
export type StudioKeys=Record<StudioCommand,string>;
export type StudioPreferences={layout:StudioLayout;presets:{name:string;layout:StudioLayout}[];keys:StudioKeys;proxyLimitMb:number;magnet:boolean};
const storage='huelith-video-workspace-v2';
const keys=Object.fromEntries(VIDEO_COMMANDS.map(([id,,key])=>[id,key])) as StudioKeys;
const bounded=(value:unknown,fallback:number,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const layout=(value?:Partial<StudioLayout>):StudioLayout=>({
  library:bounded(value?.library,230,175,500),inspector:bounded(value?.inspector,240,180,460),
  timeline:bounded(value?.timeline,292,180,850),swap:value?.swap===true,
});
export const validStudioKey=(code:string)=>/^(?:Key[A-Z]|Digit\d|BracketLeft|BracketRight|Comma|Period|Semicolon|Slash|Backslash|Minus|Equal|Backquote)$/.test(code);

export function readStudioPreferences():StudioPreferences{
  try{
    const saved=JSON.parse(localStorage.getItem(storage)??'null') as Partial<StudioPreferences>|null;
    if(saved){
      const stored={...keys,...Object.fromEntries(VIDEO_COMMANDS.map(([id])=>[id,saved.keys?.[id]??keys[id]]).filter(([,key])=>validStudioKey(key)))};
      return {layout:layout(saved.layout),keys:new Set(Object.values(stored)).size===VIDEO_COMMANDS.length?stored:keys,
        proxyLimitMb:Math.round(bounded(saved.proxyLimitMb,4096,256,32768)),magnet:saved.magnet!==false,
        presets:Array.isArray(saved.presets)?saved.presets.filter(item=>typeof item?.name==='string'&&item.name.length<=42)
          .slice(0,12).map(item=>({name:item.name,layout:layout(item.layout)})):[]};
    }
    const timeline=Number(localStorage.getItem('huelith-video-timeline-height')??292);
    return {layout:layout({timeline}),keys,presets:[],proxyLimitMb:4096,magnet:true};
  }catch{return {layout:DEFAULT_STUDIO_LAYOUT,keys,presets:[],proxyLimitMb:4096,magnet:true};}
}

export function saveStudioPreferences(value:StudioPreferences):void{
  try{localStorage.setItem(storage,JSON.stringify(value));}catch{/* Storage can be unavailable. */}
}
