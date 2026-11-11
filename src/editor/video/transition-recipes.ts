import type {EffectKind} from '../types';

export const TRANSITION_GROUPS=['Fade In','Fade Out','Combo'] as const;
export type TransitionGroup=typeof TRANSITION_GROUPS[number];
export type RevealMask='luma'|'inverse-luma'|'dither'|'horizontal'|'vertical'|'diagonal'|'split'|'corner'|'clock'
  |'iris'|'diamond'|'ring'|'blinds'|'tiles'|'star'|'paper';
type Motion={x?:number;y?:number;zoom?:number;rotation?:number;foldX?:boolean;foldY?:boolean;bounce?:number;blur?:number};
export type Reveal={
  id:string;enter:string;exit:string;combo:string;family:string;duration:number;
  mask?:RevealMask;motion?:Motion;tint?:string;flash?:number;pulse?:number;linear?:boolean;
  fx?:{kind:EffectKind;amount:number};
};

const REVEALS:readonly Reveal[]=[
  {id:'dissolve',enter:'Fade In',exit:'Fade Out',combo:'Crossfade',family:'Dissolve',duration:.5,linear:true},
  {id:'luma',enter:'Highlights First',exit:'Highlights Last',combo:'Luma Exchange',family:'Dissolve',duration:.66,mask:'luma'},
  {id:'inverse-luma',enter:'Shadows First',exit:'Shadows Last',combo:'Shadow Exchange',family:'Dissolve',duration:.66,mask:'inverse-luma'},
  {id:'dither',enter:'Dither Appear',exit:'Dither Away',combo:'Dither Exchange',family:'Dissolve',duration:.56,mask:'dither'},
  {id:'dip',enter:'Lift from Black',exit:'Dip to Black',combo:'Black Dip',family:'Dissolve',duration:.7,tint:'#08060d',flash:.88},
  {id:'white-dip',enter:'Lift from White',exit:'Dip to White',combo:'White Dip',family:'Dissolve',duration:.62,tint:'#ffffff',flash:.82},

  {id:'horizontal',enter:'Side Wipe',exit:'Side Sweep',combo:'Side Exchange',family:'Wipe',duration:.54,mask:'horizontal'},
  {id:'vertical',enter:'Top Wipe',exit:'Down Sweep',combo:'Vertical Exchange',family:'Wipe',duration:.55,mask:'vertical'},
  {id:'diagonal',enter:'Diagonal Wipe',exit:'Diagonal Sweep',combo:'Diagonal Exchange',family:'Wipe',duration:.52,mask:'diagonal'},
  {id:'split',enter:'Split Open',exit:'Split Close',combo:'Split Exchange',family:'Wipe',duration:.68,mask:'split'},
  {id:'corner',enter:'Corner Reveal',exit:'Corner Close',combo:'Corner Exchange',family:'Wipe',duration:.62,mask:'corner'},
  {id:'clock',enter:'Clock Reveal',exit:'Clock Close',combo:'Clock Exchange',family:'Wipe',duration:.74,mask:'clock'},

  {id:'iris',enter:'Iris Open',exit:'Iris Close',combo:'Iris Exchange',family:'Mask',duration:.66,mask:'iris'},
  {id:'diamond',enter:'Diamond Open',exit:'Diamond Close',combo:'Diamond Exchange',family:'Mask',duration:.7,mask:'diamond'},
  {id:'ring',enter:'Ring Open',exit:'Ring Close',combo:'Ring Exchange',family:'Mask',duration:.71,mask:'ring'},
  {id:'blinds',enter:'Blinds Open',exit:'Blinds Close',combo:'Venetian Cut',family:'Mask',duration:.6,mask:'blinds'},
  {id:'tiles',enter:'Tile Reveal',exit:'Tile Clear',combo:'Tile Exchange',family:'Mask',duration:.58,mask:'tiles'},
  {id:'star',enter:'Star Open',exit:'Star Close',combo:'Star Exchange',family:'Mask',duration:.66,mask:'star'},

  {id:'push-left',enter:'Slide from Left',exit:'Slide to Right',combo:'Push Across',family:'Slide',duration:.48,motion:{x:-1}},
  {id:'push-right',enter:'Slide from Right',exit:'Slide to Left',combo:'Reverse Push',family:'Slide',duration:.48,motion:{x:1}},
  {id:'lift',enter:'Lift Up',exit:'Drop Down',combo:'Lift Exchange',family:'Slide',duration:.55,motion:{y:1}},
  {id:'drop',enter:'Drop In',exit:'Lift Out',combo:'Drop Exchange',family:'Slide',duration:.52,motion:{y:-1}},
  {id:'corner-slide',enter:'Corner Slide',exit:'Corner Glide',combo:'Diagonal Push',family:'Slide',duration:.6,motion:{x:-.9,y:.9,zoom:.12}},
  {id:'elastic',enter:'Elastic Slide',exit:'Elastic Exit',combo:'Spring Switch',family:'Slide',duration:.72,motion:{x:.85,bounce:.18}},

  {id:'pull',enter:'Pull In',exit:'Pull Away',combo:'Pull Through',family:'Zoom',duration:.6,motion:{zoom:.85}},
  {id:'punch',enter:'Punch In',exit:'Punch Away',combo:'Punch Cut',family:'Zoom',duration:.42,motion:{zoom:-.78,bounce:.16}},
  {id:'wide',enter:'Wide Open',exit:'Wide Close',combo:'Wide Switch',family:'Zoom',duration:.59,motion:{zoom:.48,foldY:true}},
  {id:'bounce',enter:'Bounce In',exit:'Bounce Out',combo:'Bounce Switch',family:'Zoom',duration:.75,motion:{zoom:-.56,bounce:.32,y:.15}},
  {id:'tunnel',enter:'Tunnel In',exit:'Tunnel Out',combo:'Tunnel Cut',family:'Zoom',duration:.61,motion:{zoom:1.65,blur:10},mask:'iris'},
  {id:'fold',enter:'Fold Open',exit:'Fold Shut',combo:'Fold Switch',family:'Zoom',duration:.62,motion:{zoom:.1,foldX:true,foldY:true}},

  {id:'twist',enter:'Twist In',exit:'Twist Out',combo:'Twist Through',family:'Spin',duration:.56,motion:{rotation:-90,zoom:.18}},
  {id:'flip-x',enter:'Horizontal Flip In',exit:'Horizontal Flip Out',combo:'Horizontal Flip Cut',family:'Spin',duration:.62,motion:{foldX:true,rotation:-8}},
  {id:'flip-y',enter:'Vertical Flip In',exit:'Vertical Flip Out',combo:'Vertical Flip Cut',family:'Spin',duration:.62,motion:{foldY:true,rotation:12}},
  {id:'roll',enter:'Roll In',exit:'Roll Away',combo:'Roll Through',family:'Spin',duration:.67,motion:{rotation:180,x:.28,zoom:.22}},
  {id:'pinwheel',enter:'Pinwheel In',exit:'Pinwheel Out',combo:'Pinwheel Cut',family:'Spin',duration:.77,motion:{rotation:360,zoom:-.52},mask:'clock'},
  {id:'tilt',enter:'Tilt In',exit:'Tilt Out',combo:'Tilt Exchange',family:'Spin',duration:.58,motion:{rotation:40,y:-.32,bounce:.1}},

  {id:'defocus',enter:'Focus In',exit:'Defocus Out',combo:'Soft Focus Cut',family:'Focus',duration:.64,motion:{blur:23}},
  {id:'whip',enter:'Whip In',exit:'Whip Out',combo:'Whip Pan',family:'Focus',duration:.39,motion:{x:.34,blur:6},fx:{kind:'motionblur',amount:54}},
  {id:'radial',enter:'Radial Focus In',exit:'Radial Focus Out',combo:'Radial Rush Cut',family:'Focus',duration:.56,fx:{kind:'radialblur',amount:46}},
  {id:'zoom-blur',enter:'Zoom Focus In',exit:'Zoom Focus Out',combo:'Zoom Blur Cut',family:'Focus',duration:.48,motion:{zoom:.35},fx:{kind:'zoomblur',amount:39}},
  {id:'bloom',enter:'Bloom In',exit:'Bloom Out',combo:'Bloom Exchange',family:'Focus',duration:.69,tint:'#c8a3ff',flash:.25,fx:{kind:'sig_3',amount:93}},
  {id:'lens',enter:'Lens Resolve',exit:'Lens Falloff',combo:'Lens Shift',family:'Focus',duration:.7,motion:{zoom:-.12},fx:{kind:'lensblur',amount:35}},

  {id:'flash',enter:'Flash In',exit:'Flash Out',combo:'Flash Cut',family:'Light',duration:.34,tint:'#ffffff',flash:1,motion:{zoom:.1}},
  {id:'prism',enter:'Prism In',exit:'Prism Out',combo:'Prism Cut',family:'Light',duration:.46,tint:'#c18cff',flash:.38,fx:{kind:'chromatic',amount:54}},
  {id:'gold',enter:'Gold Flare In',exit:'Gold Flare Out',combo:'Gold Flare Cut',family:'Light',duration:.62,tint:'#ffb55e',flash:.72,mask:'luma'},
  {id:'ice',enter:'Ice Flare In',exit:'Ice Flare Out',combo:'Ice Flare Cut',family:'Light',duration:.61,tint:'#84dfff',flash:.65,mask:'corner'},
  {id:'neon',enter:'Neon Sweep In',exit:'Neon Sweep Out',combo:'Neon Sweep Cut',family:'Light',duration:.57,tint:'#a762ff',flash:.5,mask:'diagonal',fx:{kind:'neonedge',amount:56}},
  {id:'pulse',enter:'Light Pulse In',exit:'Light Pulse Out',combo:'Pulse Cut',family:'Light',duration:.47,tint:'#f3c2ff',flash:.8,pulse:3},

  {id:'pixel',enter:'Pixel Resolve In',exit:'Pixel Break Out',combo:'Pixel Exchange',family:'Art & Digital',duration:.55,mask:'tiles',fx:{kind:'pixelate',amount:28}},
  {id:'signal',enter:'Signal In',exit:'Signal Loss',combo:'Signal Exchange',family:'Art & Digital',duration:.45,mask:'blinds',fx:{kind:'vhs',amount:88}},
  {id:'shards',enter:'Glass Shards In',exit:'Glass Shards Out',combo:'Glass Exchange',family:'Art & Digital',duration:.64,mask:'diamond',fx:{kind:'glass',amount:87}},
  {id:'ink',enter:'Ink Spread',exit:'Ink Retreat',combo:'Ink Exchange',family:'Art & Digital',duration:.74,mask:'inverse-luma',fx:{kind:'inkwash',amount:92}},
  {id:'paper',enter:'Paper Tear In',exit:'Paper Tear Out',combo:'Paper Tear Cut',family:'Art & Digital',duration:.63,mask:'paper',tint:'#dfd1eb',flash:.38},
  {id:'glitch',enter:'Glitch Lock In',exit:'Glitch Cut Out',combo:'Glitch Exchange',family:'Art & Digital',duration:.43,motion:{x:.14},mask:'dither',fx:{kind:'glitch',amount:84}},
];

export type AuthoredTransition={id:string;name:string;group:TransitionGroup;family:string;duration:number;reveal:Reveal;leave?:Reveal};
export const AUTHORED_TRANSITIONS:readonly AuthoredTransition[]=TRANSITION_GROUPS.flatMap((group,category)=>REVEALS.map((reveal,index)=>({
  id:`${['in','out','combo'][category]}-${reveal.id}`,name:group==='Fade In'?reveal.enter:group==='Fade Out'?reveal.exit:reveal.combo,
  group,family:reveal.family,duration:reveal.duration,reveal,
  leave:group==='Combo'&&index!==0?REVEALS[(index*5+7)%REVEALS.length]:undefined,
})));
export const AUTHORED_TRANSITION_LOOKUP=new Map(AUTHORED_TRANSITIONS.map(recipe=>[recipe.id,recipe]));
