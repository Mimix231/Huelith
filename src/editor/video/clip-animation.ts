export const ANIMATION_GROUPS=['In','Out','Combo'] as const;
export type AnimationGroup=typeof ANIMATION_GROUPS[number];
type Motion = {x?:number;y?:number;zoom?:number;rotation?:number;fade?:number;bounce?:number;shake?:number};
type AnimationPreset={id:string;name:string;group:AnimationGroup;motion:Motion};
export const CLIP_ANIMATIONS:readonly AnimationPreset[]=[
  {id:'soft-appear',name:'Soft appear',group:'In',motion:{fade:1}},
  {id:'lift',name:'Lift in',group:'In',motion:{y:.19,fade:1}},
  {id:'drop',name:'Drop in',group:'In',motion:{y:-.26,bounce:.034,fade:1}},
  {id:'slide-in',name:'Slide in',group:'In',motion:{x:-.45,fade:1}},
  {id:'pop',name:'Pop in',group:'In',motion:{zoom:-.45,bounce:.19,fade:1}},
  {id:'swing-in',name:'Swing in',group:'In',motion:{rotation:-48,x:-.18,fade:1}},
  {id:'pull-focus',name:'Push in',group:'In',motion:{zoom:.64,fade:1}},
  {id:'quake-in',name:'Quake in',group:'In',motion:{shake:.052,fade:1}},
  {id:'soft-disappear',name:'Soft disappear',group:'Out',motion:{fade:1}},
  {id:'float-away',name:'Float away',group:'Out',motion:{y:-.28,fade:1}},
  {id:'fall-away',name:'Fall away',group:'Out',motion:{y:.42,rotation:12,fade:1}},
  {id:'slide-out',name:'Slide out',group:'Out',motion:{x:.48,fade:1}},
  {id:'shrink',name:'Shrink away',group:'Out',motion:{zoom:-.72,fade:1}},
  {id:'swing-out',name:'Swing out',group:'Out',motion:{rotation:58,x:.24,fade:1}},
  {id:'rush-away',name:'Rush away',group:'Out',motion:{zoom:.8,fade:1}},
  {id:'quake-out',name:'Quake out',group:'Out',motion:{shake:.08,fade:1}},
  {id:'slow-pulse',name:'Slow pulse',group:'Combo',motion:{zoom:.22}},
  {id:'orbit',name:'Orbit',group:'Combo',motion:{rotation:16,x:.12,y:.05}},
  {id:'sweep',name:'Sweep',group:'Combo',motion:{x:.26,y:-.08}},
  {id:'tilt-return',name:'Tilt and return',group:'Combo',motion:{rotation:-28,zoom:.12}},
  {id:'float',name:'Float',group:'Combo',motion:{y:-.14,zoom:.06}},
  {id:'impact',name:'Impact',group:'Combo',motion:{shake:.065,zoom:.25}},
  {id:'drift',name:'Diagonal drift',group:'Combo',motion:{x:-.18,y:.12,rotation:9}},
  {id:'flash-pulse',name:'Flash pulse',group:'Combo',motion:{zoom:.3,fade:.4}},
];
const presets=new Map(CLIP_ANIMATIONS.map(preset=>[preset.id,preset]));
export type AnimationSpan={id:string;start:number;duration:number};
export type ClipAnimation=Partial<Record<AnimationGroup,AnimationSpan>>;

export function makeAnimationSpan(id:string,duration:number,clipDuration:number):AnimationSpan {
  const preset=presets.get(id);
  if(!preset)throw Error('Unknown clip animation.');
  const span=Math.min(clipDuration,Math.max(1/240,duration));
  return {id,start:preset.group==='Out'?clipDuration-span:0,duration:span};
}

export function validClipAnimation(value:unknown):value is ClipAnimation {
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([group,span])=>
    span&&presets.get(span.id)?.group===group&&Number.isFinite(span.start)&&Math.abs(span.start)<=21600
    &&Number.isFinite(span.duration)&&span.duration>0&&span.duration<=21600);
}

export function mapAnimation(clipAnimation:ClipAnimation|undefined,offset:number,stretch=1):ClipAnimation|undefined {
  if(!clipAnimation)return undefined;
  return Object.fromEntries(Object.entries(clipAnimation).map(([group,span])=>
    [group,{...span,start:(span.start-offset)*stretch,duration:span.duration*stretch}]));
}

export function animationPoseAt(animation:ClipAnimation|undefined,time:number){
  const pose={x:0,y:0,scale:1,rotation:0,opacity:1};
  if(!animation)return pose;
  for(const group of ANIMATION_GROUPS){
    const span=animation[group],motion=span&&presets.get(span.id)?.motion;
    if(!span||!motion)continue;
    const progress=Math.max(0,Math.min(1,(time-span.start)/span.duration));
    const eased=progress*progress*(3-2*progress);
    const weight=group==='In'?1-eased:group==='Out'?eased:Math.sin(Math.PI*progress);
    const bounce=Math.sin(Math.PI*progress*2)*(motion.bounce??0);
    const shake=Math.sin(26*progress*Math.PI)*weight*(motion.shake??0);
    pose.x+=weight*(motion.x??0)+shake;
    pose.y+=weight*(motion.y??0)+bounce*.5;
    pose.rotation+=weight*(motion.rotation??0)+shake*32;
    pose.scale*=1+weight*(motion.zoom??0)+bounce;
    pose.opacity*=1-weight*(motion.fade??0);
  }
  return pose;
}
