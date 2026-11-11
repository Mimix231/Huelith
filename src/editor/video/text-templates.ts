import type {VideoTextStyle} from './studio-types';
export interface TextTemplate {id:string;name:string;category:string;text:string;x:number;y:number;style:VideoTextStyle}
const styles:Array<{id:string;name:string;category:string;style:VideoTextStyle}>=[
 {id:'clean',name:'Clean story',category:'Essentials',style:{fontSize:74,fontWeight:700,color:'#ffffff'}},
 {id:'bold',name:'Big statement',category:'Essentials',style:{fontSize:88,fontWeight:900,color:'#ffffff',letterSpacing:-1}},
 {id:'quiet',name:'Quiet type',category:'Essentials',style:{fontSize:54,fontWeight:400,color:'#e4e4e7',letterSpacing:3}},
 {id:'ink',name:'Ink headline',category:'Editorial',style:{fontFamily:'Georgia',fontSize:80,fontWeight:700,color:'#fff5df',italic:true}},
 {id:'serif',name:'Magazine',category:'Editorial',style:{fontFamily:'Georgia',fontSize:72,fontWeight:400,color:'#fff7e8',decoration:'underline'}},
 {id:'mono',name:'Typewriter',category:'Editorial',style:{fontFamily:'Consolas',fontSize:62,fontWeight:400,color:'#f1eee6',letterSpacing:2}},
 {id:'outline',name:'Outline',category:'Essentials',style:{fontSize:82,fontWeight:900,color:'#26272b',stroke:'#ffffff',strokeWidth:2}},
 {id:'shadow',name:'Soft shadow',category:'Essentials',style:{fontSize:76,fontWeight:800,color:'#ffffff',shadowColor:'#000000',shadowBlur:15}},
 {id:'violet',name:'Violet glow',category:'Neon',style:{fontSize:76,fontWeight:700,color:'#f7edff',stroke:'#b276ff',strokeWidth:1,shadowColor:'#9659ff',shadowBlur:25}},
 {id:'cyan',name:'Electric cyan',category:'Neon',style:{fontSize:76,fontWeight:800,color:'#c9ffff',shadowColor:'#00d9df',shadowBlur:22}},
 {id:'rose',name:'Rose light',category:'Neon',style:{fontFamily:'Georgia',fontSize:72,italic:true,color:'#ffdaec',shadowColor:'#ff4aab',shadowBlur:24}},
 {id:'gold',name:'Golden',category:'Film',style:{fontFamily:'Georgia',fontSize:74,fontWeight:700,color:'#fff3b8',secondaryColor:'#b57525',gradient:true,shadowColor:'#2c1709',shadowBlur:7}},
 {id:'silver',name:'Silver screen',category:'Film',style:{fontSize:76,fontWeight:800,color:'#ffffff',secondaryColor:'#929ca9',gradient:true,letterSpacing:4}},
 {id:'amber',name:'Amber cinema',category:'Film',style:{fontFamily:'Bahnschrift',fontSize:78,fontWeight:600,color:'#f3bd76',letterSpacing:7}},
 {id:'brackets',name:'Bracket title',category:'Editorial',style:{fontSize:66,fontWeight:600,color:'#ffffff',secondaryColor:'#42ded4',decoration:'brackets',padding:22}},
 {id:'sidebar',name:'News label',category:'Social',style:{fontSize:60,fontWeight:800,color:'#ffffff',background:'#192e38',secondaryColor:'#3adbd1',decoration:'side-bar',padding:18}},
 {id:'pill',name:'Soft pill',category:'Social',style:{fontSize:58,fontWeight:700,color:'#20242b',background:'#e4f7e9',padding:20,radius:40}},
 {id:'paper',name:'Paper note',category:'Editorial',style:{fontFamily:'Georgia',fontSize:60,color:'#342d3e',background:'#f7eed9',padding:22,radius:2}},
 {id:'tape',name:'Black tape',category:'Social',style:{fontSize:64,fontWeight:900,color:'#ffffff',background:'#17171c',padding:18,radius:0}},
 {id:'sunshine',name:'Sunshine',category:'Social',style:{fontSize:70,fontWeight:900,color:'#2c2542',background:'#ffe57c',padding:20,radius:12}},
 {id:'mint',name:'Mint label',category:'Social',style:{fontSize:64,fontWeight:700,color:'#092b2b',background:'#77e6c6',padding:20,radius:8}},
 {id:'lavender',name:'Lavender note',category:'Social',style:{fontSize:64,fontWeight:600,color:'#392b59',background:'#dfcaff',padding:22,radius:16}},
 {id:'bubble',name:'Bubblegum',category:'Playful',style:{fontFamily:'Arial Rounded MT Bold',fontSize:74,fontWeight:900,color:'#ffb3d8',stroke:'#702b66',strokeWidth:3,shadowColor:'#50244c',shadowBlur:7}},
 {id:'comic',name:'Comic shout',category:'Playful',style:{fontFamily:'Impact',fontSize:86,fontWeight:900,italic:true,color:'#ffe882',stroke:'#201b32',strokeWidth:5}},
 {id:'chalk',name:'Chalk note',category:'Playful',style:{fontFamily:'Comic Sans MS',fontSize:62,color:'#f4f4e9',stroke:'#fffef1',strokeWidth:.5}},
 {id:'rainbow',name:'Sunset gradient',category:'Playful',style:{fontSize:78,fontWeight:900,color:'#ffe675',secondaryColor:'#ff5ac9',gradient:true,stroke:'#39213f',strokeWidth:2}},
 {id:'condensed',name:'Condensed',category:'Essentials',style:{fontFamily:'Bahnschrift',fontSize:82,fontWeight:700,color:'#ffffff',letterSpacing:6}},
 {id:'slate',name:'Slate card',category:'Film',style:{fontFamily:'Consolas',fontSize:54,fontWeight:700,color:'#e8e9ee',background:'#343740',padding:22,radius:3,letterSpacing:2}},
 {id:'caption',name:'Caption classic',category:'Captions',style:{fontSize:48,fontWeight:800,color:'#ffffff',stroke:'#111111',strokeWidth:4,width:.78}},
 {id:'caption-box',name:'Caption box',category:'Captions',style:{fontSize:46,fontWeight:700,color:'#ffffff',background:'#17191e',padding:13,radius:7,width:.78}},
 {id:'caption-yellow',name:'Caption emphasis',category:'Captions',style:{fontSize:50,fontWeight:900,color:'#ffe778',stroke:'#13141a',strokeWidth:4,width:.8}},
 {id:'caption-violet',name:'Caption violet',category:'Captions',style:{fontSize:48,fontWeight:800,color:'#f8edff',stroke:'#34194a',strokeWidth:3,shadowColor:'#8241ad',shadowBlur:7,width:.78}},
];
const layouts=[
 {id:'headline',name:'Headline',text:'YOUR STORY\nSTARTS HERE',x:0,y:-.08,align:'center' as const},
 {id:'lower-third',name:'Lower third',text:'A new perspective',x:-.24,y:.28,align:'left' as const},
 {id:'caption',name:'Caption',text:'Make every moment count.',x:0,y:.35,align:'center' as const},
];
export const TEXT_TEMPLATES:readonly TextTemplate[]=styles.flatMap(s=>layouts.map(l=>({id:`${s.id}-${l.id}`,name:`${s.name} · ${l.name}`,category:s.category,text:l.text,x:l.x,y:l.y,
 style:{width:l.id==='lower-third'?.45:.85,lineHeight:1.14,...s.style,align:l.align}})));
export const TEXT_TEMPLATE_LOOKUP=new Map(TEXT_TEMPLATES.map(t=>[t.id,t]));
export const CAPTION_STYLES=TEXT_TEMPLATES.filter(t=>t.category==='Captions'&&t.id.endsWith('-caption'));
