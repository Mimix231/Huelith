import { createSurface } from './canvas-surface';
import type { Effect } from './types';

/** Curated non-destructive additions: each key owns one specific math/geometry
 * path. They share low-level sampling utilities, not other named filter recipes. */
const sections = [
  ['Color Science', ['Chromatic Adaptation','Shadow Chromaticity','Highlight Chromaticity','Three-Way Grade','Cross Process','Bleach Bypass','Teal & Amber','Channel Compression','Luma-Chroma Separation','Filmic Shoulder','Filmic Toe','Logarithmic Grade','Selective Chromaticity','Gamut Soft Clip','Palette Quantizer','Split Tone Spectrum']],
  ['Lighting & Atmosphere', ['Directional Light Shafts','Specular Glints','Light Scattering','Silhouette Rimlight','Sunburst Rays','Atmospheric Fog','Cinematic Haze','Underwater Caustics','Lightning Flash','Ambient Wrap Lighting','Sparkling Highlights','Sunrise Illumination','Moonlight Casting','Shadowed Mist']],
  ['Artistic Painting', ['Charcoal Drawing','Sidewalk Chalk','Soft Pastel','Opaque Gouache','Woodcut Engraving','Copper Etching','Charcoal Hatching','Ink Stippling','Colored Pencils','Oil Impasto','Watercolor Bleeding','Lithographic Press','Felt-Tip Drawing','Wax Crayon','Airbrush Spray','Stained Glass','Graphite Shading','Dry Brush Painting']],
  ['Distortion & Geometry', ['Polar Warp','Pinch Lens','Barrel Distortion','Pincushion Distortion','Oblique Shear','Noise Displacement','Sine Fold','Quadrant Kaleidoscope','Warped Waves','Spiral Vortex','Crystal Shatter','Mirror Slices','Pixel Sorting','Curved Glass']],
  ['Anime & Comics', ['Manga Screentones','Diagonal Screentone','Crosshatch Ink','Impact Speedlines','Black Ink Shadows','Cel Highlight Bands','Color Registration','Energy Eyes','Manga Shadow Bands','Sharp Contour Ink','Two-Tone Comic Ink','Panel Perspective','Anime Energy Lines','Flat Anime Colors','Scratch Ink','Retro Comic Misprint']],
  ['Materials & Surfaces', ['Brushed Aluminum','Gold Foil','Reflective Chrome','Ceramic Glaze','Frosted Acrylic','Woven Linen','Aged Parchment','Sandstone Grain','Leather Texture','Carbon Fiber','Iridescent Film','Concrete Pores','Gemstone Facets','Polished Wood']],
  ['Digital & Experimental', ['Databent Stripes','Bitplane Crush','Chromatic Ghost','Damaged Data Blocks','Tracking Roll','Codec Mosaic','Pixel Rearrangement','Broken LCD','Signal Static','Green Phosphor','RGB Subpixel Mask','Color Data Tears','Corrupted Sectors','Dot Matrix Display']],
  ['Cinematic & Optical', ['Film Halation','Anamorphic Streak','Lens Ghost','Edge Focus Vignette','Prismatic Lens','Star Filter','Cinematic Contrast Curve','Film Negative','Silver Retention','Lens Curvature','Rolling Shutter','Split Diopter','Optical Color Fringe','Golden Lens Flare']],
] as const;
export type ExpandedEffect = { kind:`atelier_${number}_${number}`;label:string;group:string;initial:number;min:number;max:number;unit:'%';step:1;section:number;variant:number };
export const EXPANSION_120: readonly ExpandedEffect[] = sections.flatMap(([group,names],section) =>
  names.map((label,variant)=>({kind:`atelier_${section}_${variant}` as `atelier_${number}_${number}`,label,group,initial:70,min:0,max:100,unit:'%' as const,step:1 as const,section,variant}))) ;
export const EXPANSION_LOOKUP: ReadonlyMap<string,ExpandedEffect> = new Map(EXPANSION_120.map(item=>[item.kind,item]));
if(EXPANSION_120.length!==120||new Set(EXPANSION_120.map(i=>i.kind)).size!==120) throw Error('Expected 120 independent operations');

const clip=(v:number)=>Math.max(0,Math.min(255,Number.isFinite(v)?v:0));
const sat=(v:number)=>Math.min(1,Math.max(0,v));
const blend=(a:number,b:number,t:number)=>a+(b-a)*sat(t);
const hash=(x:number,y:number,s:number)=>{let v=Math.imul(x+97,374761393)^Math.imul(y+71,668265263)^Math.imul(s+1,1274126177);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;};
const lum=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b;
const smooth=(a:number,b:number,x:number)=>{const t=sat((x-a)/(b-a||1));return t*t*(3-2*t);};
const wave=(a:number)=>Math.sin(a*Math.PI*2);
/** A 2D summed-area table allows physically meaningful, spatially spread
 * highlights without repeated large-radius blur passes at every pixel. */
function brightField(data:Uint8ClampedArray,w:number,h:number):Float64Array {
  const stride=w+1,integral=new Float64Array((w+1)*(h+1));
  for(let y=0;y<h;y++){
    let row=0;
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      const light=Math.max(0,(lum(data[i],data[i+1],data[i+2])-143)/112);
      row+=light*(data[i+3]/255);
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    }
  }
  return integral;
}
function areaLight(field:Float64Array,w:number,h:number,x:number,y:number,radius:number):number {
  const x0=Math.max(0,Math.floor(x-radius)),x1=Math.min(w,Math.ceil(x+radius+1));
  const y0=Math.max(0,Math.floor(y-radius)),y1=Math.min(h,Math.ceil(y+radius+1));
  const stride=w+1;
  return (field[y1*stride+x1]-field[y0*stride+x1]-field[y1*stride+x0]+field[y0*stride+x0])/
    Math.max(1,(x1-x0)*(y1-y0));
}
/** Pixel sorting is a *reordering* of existing pixels, not a displacement.
 * Sort only uninterrupted luminance-selected row runs, retaining alpha. */
function sortedRowPixels(input:Uint8ClampedArray,w:number,h:number,strength:number,thresholdControl:number):Uint8ClampedArray {
  const sorted=new Uint8ClampedArray(input);
  const threshold=30+sat(thresholdControl/100)*160;
  for(let y=0;y<h;y++){
    let x=0;
    while(x<w){
      const eligible=(at:number)=>input[(y*w+at)*4+3]>0 && lum(input[(y*w+at)*4],input[(y*w+at)*4+1],input[(y*w+at)*4+2])>threshold;
      if(!eligible(x)){x++;continue;}
      const start=x;while(x<w && eligible(x))x++;
      if(x-start<2)continue;
      const run:Array<[number,number,number,number,number]>=[];
      for(let p=start;p<x;p++){
        const i=(y*w+p)*4;run.push([input[i],input[i+1],input[i+2],input[i+3],lum(input[i],input[i+1],input[i+2])]);
      }
      run.sort((a,b)=>y%2 ? b[4]-a[4] : a[4]-b[4]);
      for(let p=start;p<x;p++)sorted.set(run[p-start].slice(0,4),(y*w+p)*4);
    }
  }
  return sorted;
}
export interface Expansion120Job {
  /** Run at most this many scanlines; true only when the EXACT output is ready. */
  runRows(rows:number):boolean;
  output():HTMLCanvasElement;
}
export function createExpansion120Job(source:HTMLCanvasElement,effect:Effect):Expansion120Job {
  const descriptor=EXPANSION_LOOKUP.get(effect.kind);
  if(!descriptor)return {runRows:()=>true,output:()=>source};
  const {width:w,height:h}=source;
  const src=source.getContext('2d',{willReadFrequently:true});if(!src)throw Error('Canvas unavailable');
  const original=src.getImageData(0,0,w,h);
  const input=original.data;
  const output=createSurface();output.width=w;output.height=h;
  const canvas=output.getContext('2d',{willReadFrequently:true});if(!canvas)throw Error('Canvas unavailable');
  const result=canvas.createImageData(w,h),data=result.data;
  const strength=sat(effect.amount/100),params=effect.parameters;
  const cx=w*(params?.centerX??50)/100,cy=h*(params?.centerY??50)/100;
  const scale=Math.max(1,Math.min(w,h));
  const wavelength=Math.max(.1,(params?.frequency??50)/50);
  const orientation=(params?.angle??0)*Math.PI/180;
  const cos=Math.cos(orientation),sin=Math.sin(orientation);
  const chroma=(params?.colorMix??50)/50;
  const {section,variant:v}=descriptor;
  const sample=(x:number,y:number,ch:number)=>input[(Math.min(h-1,Math.max(0,Math.round(y)))*w+Math.min(w-1,Math.max(0,Math.round(x))))*4+ch];
  const Y=(x:number,y:number)=>lum(sample(x,y,0),sample(x,y,1),sample(x,y,2));
  const gradient=(x:number,y:number)=>Math.abs(Y(x+1,y)-Y(x-1,y))+Math.abs(Y(x,y+1)-Y(x,y-1));
  const seed=v*43+section*103+Math.round(params?.seed??0);
  const usesNoise=section===2||section===3||section===4||section===5||section===6;
  const highlights=(((section===7 && [0,1,2,5,13].includes(v)) ||
      (section===1 && [0,1,2,4,10].includes(v))) && strength>0) ? brightField(input,w,h) : null;
  const sortedPixels=section===3&&v===12&&strength>0?sortedRowPixels(input,w,h,strength,params?.threshold??45):null;
  const haloRadius=Math.max(2,Math.round(scale*(.025+.070*wavelength)));
  const haloAt=(x:number,y:number,r:number)=>highlights?areaLight(highlights,w,h,x,y,r):0;
  const usesGeometry=section===1||section===3||section===4||section===5||section===7;
  const usesEdge=section===1||section===2||section===4||section===5;
  const renderRows=(fromY:number,toY:number):void=>{
  for(let y=fromY;y<toY;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,r=input[i],g=input[i+1],b=input[i+2],alpha=input[i+3];
    // Sample geometric effects through transparent destination pixels too:
    // inverse warps may legitimately move an opaque silhouette into them.
    // Tone/pigment effects remain clipped to the source alpha.
    const glowOutside = !alpha && ((section===7 && [0,1,2,5,13].includes(v)) || (section===1 && [0,2,4].includes(v)));
    if(!alpha && section!==3 && !(section===4&&v===11) && !glowOutside){data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=0;continue;}
    // Center / direction / spatial frequency controls influence the actual
    // underlying procedural geometry rather than only a visual overlay.
    const xx=x-cx,yy=y-cy;
    const tx=cx+(xx*cos-yy*sin)*wavelength,ty=cy+(xx*sin+yy*cos)*wavelength;
    const L=lum(r,g,b),n=usesNoise?hash(Math.floor(tx),Math.floor(ty),seed):0,edge=usesEdge?gradient(x,y)/255:0;
    const X=usesGeometry?(tx-cx)/scale:0,Z=usesGeometry?(ty-cy)/scale:0;
    const R=usesGeometry?Math.hypot(X,Z):0,theta=usesGeometry?Math.atan2(Z,X):0;
    let rr=r,gg=g,bb=b,aa=alpha;
    let emittedAlpha=0;
    if(section===0){ // Color Science — 16 color-transfer operations.
      switch(v){
        case 0: rr=r*1.07;gg=g*.995;bb=b*.91;break; // Bradford-inspired warm/chromatic balance
        case 1: {const t=(1-L/255)**2;rr=r+47*t;gg=g+10*t;bb=b+61*t;break;}
        case 2: {const t=(L/255)**2;rr=r+35*t;gg=g+16*t;bb=b-37*t;break;}
        case 3: {const t=L/255;rr=r+28*(1-t)-8*t;gg=g+17*t-9*(1-t);bb=b+24*t-34*(1-t);break;}
        case 4: rr=255*Math.pow(r/255,.81);gg=255*Math.pow(g/255,1.08);bb=255*Math.pow(b/255,1.22);break;
        case 5: rr=blend(L,r,0.38)*1.09;gg=blend(L,g,.38)*1.09;bb=blend(L,b,.38)*1.09;break;
        case 6: {const t=L/255;rr=r+38*t;gg=g+15*(1-t);bb=b+35*(1-t)-22*t;break;}
        case 7: rr=L+(r-L)*.6;gg=L+(g-L)*1.16;bb=L+(b-L)*1.35;break;
        case 8: {const sat0=(Math.max(r,g,b)-Math.min(r,g,b))/255;rr=L+(r-L)*(1.6-.6*sat0);gg=L+(g-L)*(1.1-.3*sat0);bb=L+(b-L)*.75;break;}
        case 9: {const f=L/255;const shoulder=(f/(f+.24))*.82;rr=r*shoulder/(f+.001);gg=g*shoulder/(f+.001);bb=b*shoulder/(f+.001);break;}
        case 10:{const t=(L/255)**.6;const gain=t/(L/255+.001);rr=r*gain;gg=g*gain;bb=b*gain;break;}
        case 11:rr=Math.log1p(r/31)*72;gg=Math.log1p(g/31)*72;bb=Math.log1p(b/31)*72;break;
        case 12:{const chroma=(r-g)/255;const m=smooth(.05,.25,Math.abs(chroma));rr=blend(L,r,m);gg=blend(L,g,m);bb=blend(L,b,m);break;}
        case 13:{const compress=(c:number)=>128+127*Math.tanh((c-128)/112);rr=compress(r);gg=compress(g);bb=compress(b);break;}
        case 14:{const colors=[30,85,160,226];rr=colors[Math.min(3,Math.floor(r/64))];gg=colors[Math.min(3,Math.floor(g/64))];bb=colors[Math.min(3,Math.floor(b/64))];break;}
        case 15:{const t=L/255;rr=r+Math.sin(t*Math.PI)*35;gg=g-14*(1-t);bb=b+40*(1-t)-25*t;break;}
      }
    } else if(section===1){ // Lighting & Atmosphere — sourced from physical direction or highlight masks.
      let mask=0,color:[number,number,number]=[250,215,156];
      switch(v){
        case 0:{ // Rays behind bright regions: integrate along the chosen light direction.
          const dx=Math.cos(orientation),dy=Math.sin(orientation);let transmitted=0;
          for(let j=1;j<=6;j++)transmitted+=haloAt(x-dx*j*haloRadius*.8,y-dy*j*haloRadius*.8,haloRadius*.3);
          mask=sat(transmitted/6)*Math.exp(-R*.30);break;
        }
        case 1:{const shiny=haloAt(x,y,Math.max(1,haloRadius/3));
          mask=Math.pow(sat(edge+.45*shiny),1.2)*Math.pow(Math.max(0,wave((X+Z)*7)),12);break;}
        case 2:{ // Radial in-scattering from bright source samples, not just tinting its pixels.
          const dx=x-cx,dy=y-cy;let scatter=0;
          for(let j=1;j<=8;j++){const t=j/10;scatter+=haloAt(x-dx*t,y-dy*t,Math.max(1,haloRadius/3));}
          mask=sat(scatter/8)*.95;break;
        }
        case 3:mask=sat(edge*.8)*Math.pow(sat(1-L/255),.7);color=[73,196,255];break;
        case 4:mask=Math.pow(Math.abs(wave(theta*11)),19)*Math.exp(-R*2)*(.24+.76*haloAt(x,y,haloRadius));break;
        case 5:mask=smooth(0,1,y/h)*.65;color=[180,201,215];break;
        case 6:mask=(1-smooth(.16,.93,L/255))*.28+Math.exp(-R*2)*.20;color=[222,191,182];break;
        case 7:mask=Math.pow(Math.max(0,wave(X*18+wave(Z*4)*.3)*wave(Z*14-X*7)),2)*.65;color=[75,203,238];break;
        case 8:mask=Math.pow(Math.max(0,wave(X*7-Z*9)),18)*Math.pow(sat(1-R),2);color=[196,231,255];break;
        case 9:mask=Math.pow(sat((x+y)/(w+h)),2)*.55;color=[243,167,124];break;
        case 10:{ // Deterministic, sparse star glints at bright source highlights.
          const intense=sat((L-145)/110);
          const grid=12/wavelength;
          const gx=(tx%grid+grid)%grid-grid/2,gy=(ty%grid+grid)%grid-grid/2;
          const pattern=hash(Math.floor(tx/grid),Math.floor(ty/grid),seed);
          const star=Math.pow(sat(1-Math.min(Math.abs(gx),Math.abs(gy))/Math.max(1,grid*.15)),4);
          mask=intense*(pattern>.55 ? (.35+.65*star) : .025);
          color=[255,247,190];break;
        }
        case 11:mask=(1-y/h)*.7;color=[255,163,86];break;
        case 12:mask=(1-y/h)*.35+.2*(1-L/255);color=[97,136,255];break;
        case 13:mask=Math.pow(sat(1-L/255),2)*(.3+.2*wave(Z*5+X));color=[85,91,129];break;
      }
      const t=sat(strength*mask);
      if(glowOutside)emittedAlpha=t*230;
      rr=blend(r,color[0],t);gg=blend(g,color[1],t);bb=blend(b,color[2],t);
    } else if(section===2){ // 18 named physical media mark models, each with its own marks.
      let ink=0;let paper:[number,number,number]=[240,229,205];
      switch(v){
        case 0:ink=(1-L/255)*(.68+.32*n);paper=[225,218,208];break;
        case 1:ink=(1-L/255)*(n>.12?1:0);paper=[72,86,116];break;
        case 2:ink=(1-L/255)*(.45+.55*Math.sin((tx+ty)*.31)**2);paper=[248,213,204];break;
        case 3:ink=Math.floor((1-L/255)*5)/5;paper=[235,198,156];break;
        case 4:ink=(L<140?1:0)*(Math.sin(ty*.83+tx*.12)>.08?1:.25);paper=[239,211,161];break;
        case 5:ink=(1-L/255)*((tx*3+ty)%7<3?1:.22);paper=[240,219,174];break;
        case 6:ink=(1-L/255)*(Math.sin((tx+ty)*1.0)>.65?1:.16);break;
        case 7:ink=(1-L/255)*(hash(Math.floor(tx/3),Math.floor(ty/3),seed)>.65?1:0);break;
        case 8:ink=(1-L/255)*(.25+.75*Math.abs(wave((tx+ty)*.16)));paper=[245,232,211];break;
        case 9:ink=(1-L/255)*(.78+.22*wave(tx*.4+ty*.06));paper=[235,184,120];break;
        case 10:ink=(1-L/255)*(.3+.7*hash(Math.floor(tx/5),Math.floor(ty/5),seed));paper=[230,226,211];break;
        case 11:ink=(1-L/255)*(Math.sin(tx*.48)*Math.sin(ty*.48)>.3?1:.08);break;
        case 12:ink=(1-L/255)*(Math.abs(Math.sin((tx-ty)*.37))>.5?1:.05);break;
        case 13:ink=(1-L/255)*(Math.sin(tx*.27+ty*.27)*n>.09?1:.15);paper=[232,199,148];break;
        case 14:ink=(1-L/255)*(.6+.4*hash(Math.floor(tx/8),Math.floor(ty/8),seed));paper=[217,220,226];break;
        case 15:{ // Voronoi glass panes, colored by pixels near their seed centers.
          const size=Math.max(7,Math.round(16/wavelength));
          const cellX=Math.floor(tx/size),cellY=Math.floor(ty/size);
          let closest=Infinity,second=Infinity,centerX=tx,centerY=ty;
          for(let yy=cellY-1;yy<=cellY+1;yy++)for(let xx=cellX-1;xx<=cellX+1;xx++){
            const px=(xx+.18+.64*hash(xx,yy,seed))*size;
            const py=(yy+.18+.64*hash(xx,yy,seed+37))*size;
            const d=(px-tx)**2+(py-ty)**2;
            if(d<closest){second=closest;closest=d;centerX=px;centerY=py;}
            else if(d<second)second=d;
          }
          const pane=[sample(centerX,centerY,0),sample(centerX,centerY,1),sample(centerX,centerY,2)];
          const lead=(Math.sqrt(second)-Math.sqrt(closest))<Math.max(.7,size*.065);
          rr=blend(r,lead?23:Math.min(255,pane[0]*1.10),strength);
          gg=blend(g,lead?27:Math.min(255,pane[1]*1.10),strength);
          bb=blend(b,lead?34:Math.min(255,pane[2]*1.10),strength);
          break;
        }
        case 16:ink=(1-L/255)*(.35+.65*n)*(Math.cos((tx+ty)*.1)**2);break;
        case 17:ink=(1-L/255)*(Math.sin(ty*.57+Math.sin(tx*.2))>.1?1:.15);paper=[235,208,186];break;
      }
      if(v!==15){const medium=255*sat(1-ink);rr=blend(r,blend(medium,paper[0],.26),strength*.94);
      gg=blend(g,blend(medium,paper[1],.26),strength*.94);bb=blend(b,blend(medium,paper[2],.26),strength*.94);}
    } else if(section===3){ // Distortion & Geometry: inverse sample coordinates.
      let u=tx,z=ty;const power=strength*scale*.15;
      switch(v){
        case 0:{const a=theta+strength*Math.exp(-R*2)*2;u=cx+Math.cos(a)*R*scale;z=cy+Math.sin(a)*R*scale;break;}
        case 1:{const f=1+strength*Math.exp(-R*4)*.9;u=cx+(tx-cx)/f;z=cy+(ty-cy)/f;break;}
        case 2:{const f=1+strength*R*R*.9;u=cx+(tx-cx)/f;z=cy+(ty-cy)/f;break;}
        case 3:{const f=1-strength*R*R*.7;u=cx+(tx-cx)/f;z=cy+(ty-cy)/f;break;}
        case 4:u=tx+Math.sin(ty/scale*Math.PI)*power;break;
        case 5:u=tx+(n-.5)*power;z=ty+(hash(tx,ty,seed+1)-.5)*power;break;
        case 6:u=tx+power*wave(ty/scale*7);break;
        case 7:{const k=Math.round((theta+Math.PI)/(Math.PI/2));const a=(k%2? -theta:theta);u=cx+Math.cos(a)*R*scale;z=cy+Math.sin(a)*R*scale;break;}
        case 8:z=ty+power*wave(tx/scale*4+Z);break;
        case 9:{const a=theta+strength*R*5;u=cx+Math.cos(a)*R*scale;z=cy+Math.sin(a)*R*scale;break;}
        case 10:u=tx+Math.floor(ty/22)%2*power;z=ty+Math.floor(tx/31)%2*power*.35;break;
        case 11:u=Math.floor(tx/22)%2?cx-(tx-cx):tx;break;
        case 12:u=x;z=y;break; // The precomputed, luminance-sorted runs are sampled below.
        case 13:u=tx+power*(1-Z*Z)*Math.sin(ty/scale*5);break;
      }
      if(sortedPixels && v===12){rr=sortedPixels[i];gg=sortedPixels[i+1];bb=sortedPixels[i+2];aa=sortedPixels[i+3];}
      else {rr=sample(u,z,0);gg=sample(u,z,1);bb=sample(u,z,2);aa=sample(u,z,3);}
    } else if(section===4){ // Anime & Comics: edge/ink/screentone/graphic separation.
      let mark=0;
      switch(v){
        case 0:{ // Circular black screentone dots vary in diameter with tone.
          const spacing=Math.max(3,Math.round(6/wavelength));
          const ux=((tx%spacing)+spacing)%spacing-spacing/2;
          const uy=((ty%spacing)+spacing)%spacing-spacing/2;
          const density=sat((255-L)/255);
          mark=(ux*ux+uy*uy)<((spacing*.66*Math.sqrt(density))**2)?1:0;
          break;
        }
        case 1:mark=(wave((tx+ty)*.22)>L/255*2-1?1:0);break;
        case 2:mark=(wave((tx+ty)*.35)*wave((tx-ty)*.35)>(L/255)*.8?1:0);break;
        case 3:mark=Math.pow(Math.abs(wave(theta*15)),15)*Math.exp(-R*.8);break;
        case 4:mark=(L<110?1:0);break;
        case 5:mark= (L>165?1:0)*.65;break;
        case 6:mark=((tx%17)<2||(ty%17)<2)? .8:0;break;
        case 7:{ // Localized eye/energy emitter; position comes from user center controls.
          const distance=Math.hypot((x-cx)/scale,(y-cy)/scale);
          const radius=Math.max(.035,.13/wavelength);
          const ring=Math.exp(-(((distance-radius*.7)/(.32*radius))**2));
          mark=(ring*.9+Math.exp(-distance/radius)*.7)*(.55+.45*sat(edge));break;
        }
        case 8:mark=L<70?1:L<138?.55:.06;break;
        case 9:mark=sat(edge/2)*1.6;break;
        case 10:mark= Math.floor(L/128)*.85;break;
        case 11:{ // Panel perspective: receding raster warp rather than a triangular overlay.
          const depth=sat(y/h),f=1+depth*.52;
          const u=cx+(x-cx)*f+orientation*5*depth;
          const z=cy+(y-cy)*(1+depth*.08);
          rr=sample(u,z,0);gg=sample(u,z,1);bb=sample(u,z,2);aa=sample(u,z,3);
          mark=0;break;
        }
        case 12:mark=Math.abs(wave(theta*32))>.95&&R>.13?1:0;break;
        case 13:{ // Five flat color regions and deliberate near-black contours.
          const steps=5,step=255/(steps-1);
          rr=Math.round(r/step)*step;gg=Math.round(g/step)*step;bb=Math.round(b/step)*step;
          if(edge>.32){rr=25;gg=29;bb=38;}
          mark=0;break;
        }
        case 14:{ // Broken ink scratches form seeded, thin, discontinuous lines.
          const stripe=Math.abs(Math.sin(tx*.62+Math.sin(ty*.038+seed)*1.3));
          const gap=hash(Math.floor(tx/23),Math.floor(ty/8),seed);
          mark=(stripe>.972&&gap>.35 && L<225)? .96:0;break;
        }
        case 15:mark=(Math.sin(tx*.39)>0&&Math.cos(ty*.29)>0)? .6:0;break;
      }
      let target:[number,number,number]=[18,19,47];if(v===5||v===7||v===12)target=[247,191,91];
      if(v===0){ // Screentones print dark dots on white paper, not tinted artwork.
        const tone=mark>.5?20:245;
        rr=gg=bb=tone;
      } else if(v!==11&&v!==13){
        rr=blend(r,target[0],sat(strength*mark));gg=blend(g,target[1],sat(strength*mark));bb=blend(b,target[2],sat(strength*mark));
      }
    } else if(section===5){ // Material & Surfaces: specular / roughness fields.
      let texture=0;let tint:[number,number,number]=[180,185,192];
      switch(v){
        case 0:texture=wave(ty*.15)*.36+n*.17;break;
        case 1:{ // Directional rolled-foil reflections with fine etched microfacets.
          const normal=(Y(x+1,y)-Y(x-1,y))/255;
          const highlight=Math.pow(Math.abs(Math.sin(tx*.035+normal*4)),10);
          texture=highlight*2.7+.12*(n-.5);tint=[232,178,45];break;
        }
        case 2:{ // Bright/dark environmental reflection bands across a curved surface.
          const normal=(Y(x+1,y)-Y(x-1,y))/255;
          const reflection=Math.sin(ty*.045+normal*8);
          texture=1.5*Math.pow(sat(reflection*.5+.5),8)-.8*Math.pow(sat(-reflection*.5+.5),3);
          tint=[177,195,207];break;
        }
        case 3:texture=Math.pow(sat(edge*.4),.7)+.15;tint=[226,224,210];break;
        case 4:texture=.25+.32*n;tint=[181,209,215];break;
        case 5:texture=(Math.cos(tx*.42)*Math.sin(ty*.42)+1)/3;tint=[211,198,171];break;
        case 6:texture=(n*.5+Math.sin(tx*.01+ty*.05)*.2);tint=[224,193,133];break;
        case 7:texture=hash(Math.floor(tx/3),Math.floor(ty/3),seed);tint=[184,160,133];break;
        case 8:texture=(Math.cos(tx*.28+ty*.21)+1)*.22;tint=[159,103,68];break;
        case 9:texture=(Math.sin(tx*.47)*Math.cos(ty*.47)+1)*.45;tint=[67,96,111];break;
        case 10:texture=(Math.sin(tx*.08+ty*.14+L*.01)+1)*.46;tint=[113,181,239];break;
        case 11:texture=n*.64;tint=[166,174,182];break;
        case 12:texture=Math.abs(Math.sin(Math.atan2(Z,X)*8))*Math.exp(-R);tint=[112,209,237];break;
        case 13:texture=Math.sin(ty*.17+Math.sin(tx*.06))* .5+.4;tint=[176,102,59];break;
      }
      const t=strength*.52;rr=blend(r,tint[0]*.4+r*.60+texture*36,t);
      gg=blend(g,tint[1]*.4+g*.60+texture*36,t);bb=blend(b,tint[2]*.4+b*.60+texture*36,t);
    } else if(section===6){ // Digital Experimental: quantization, transmission errors, display structures.
      let u=tx,z=ty;let factor=1;
      switch(v){
        case 0:u=tx+Math.floor(ty/8)%5*strength*8;break;
        case 1:factor=1+Math.round(strength*8);break;
        case 2:u=tx+strength*8;break;
        case 3:u=tx+Math.floor(ty/16)%4*strength*22;break;
        case 4:z=ty+strength*18*Math.sin(ty*.1);break;
        case 5:u=Math.floor(tx/(2+strength*12))*(2+strength*12);z=Math.floor(ty/(2+strength*12))*(2+strength*12);break;
        case 6:u=(tx+Math.floor(ty/9)*Math.round(strength*8))%w;break;
        case 7:u=tx+((tx%20)<3?strength*6:0);break;
        case 8:factor=2;break;
        case 9:factor=3;break;
        case 10:factor=4;break;
        case 11:u=tx+strength*Math.sin(ty*.5)*11;break;
        case 12:u=tx+(hash(Math.floor(tx/24),Math.floor(ty/24),seed)>.79?strength*23:0);break;
        case 13:factor=5;break;
      }
      rr=sample(u,z,0);gg=sample(u,z,1);bb=sample(u,z,2);
      if(v===1){const steps=4+Math.round((1-strength)*5);rr=Math.round(rr/255*steps)/steps*255;gg=Math.round(gg/255*steps)/steps*255;bb=Math.round(bb/255*steps)/steps*255;}
      if(v===2||v===11){rr=sample(u-strength*3,z,0);bb=sample(u+strength*3,z,2);}
      if(v===7&&tx%20<2){rr=gg=bb=18;}
      if(v===8){const d=(n-.5)*strength*130;rr+=d;gg+=d;bb+=d;}
      if(v===9){rr=blend(rr,21,strength*.9);gg=blend(gg,L*1.45,strength*.9);bb=blend(bb,33,strength*.9);}
      if(v===10){const lane=tx%3;rr*=lane===0?1:.7;gg*=lane===1?1:.7;bb*=lane===2?1:.7;}
      if(v===13){const dark=(tx%9<2||ty%9<2);if(dark){rr*=.3;gg*=.3;bb*=.3;}}
      if(factor!==1&&v!==1&&v!==9&&v!==10&&v!==13){rr/=factor*.3+.7;gg/=factor*.3+.7;bb/=factor*.3+.7;}
    } else if(section===7){ // Cinematic/Optical: highlight-based optical transport and film transfer.
      const highlight=Math.pow(L/255,3);let light=0;
      switch(v){
        case 0:{ // Broad reddish silver-halide bleed *outside* hot pixels.
          const inner=haloAt(x,y,Math.max(1,haloRadius/4));
          const outer=haloAt(x,y,haloRadius);
          light=sat(outer*.95+inner*.25)*strength;
          rr+=light*144;gg+=light*47;bb+=light*16;break;
        }
        case 1:{ // Horizontal optical streaks transported from highlights along the row.
          let streak=0;
          for(let t=-8;t<=8;t++){
            if(t===0)continue;
            const weight=Math.exp(-Math.abs(t)*.36);
            streak+=haloAt(x+t*haloRadius*.9,y,Math.max(1,haloRadius/5))*weight;
          }
          light=sat(streak*.32);rr+=light*103;gg+=light*128;bb+=light*180;break;
        }
        case 2:{ // Reflection images mirrored around the user-selected optical center.
          let ghosts=0;
          for(const t of [.35,.66,1.1]){
            const sx=cx+(cx-x)*t,sy=cy+(cy-y)*t;
            ghosts+=haloAt(sx,sy,Math.max(1,haloRadius*.38))*(1.2-t);
          }
          light=sat(ghosts*.75);rr+=light*75;gg+=light*104;bb+=light*147;break;
        }
        case 3:light=smooth(.2,.8,R);rr*=1-light*.45;gg*=1-light*.45;bb*=1-light*.45;break;
        case 4:light=Math.abs(wave(theta*5))*highlight;rr+=light*55;bb+=light*80;break;
        case 5:{ // Diagonal spectral spikes radiating from hot source points.
          let spikes=0;
          for(let j=-6;j<=6;j++){
            spikes+=haloAt(x+j*haloRadius*.8,y+j*haloRadius*.8,Math.max(1,haloRadius/5))*.17;
            spikes+=haloAt(x+j*haloRadius*.8,y-j*haloRadius*.8,Math.max(1,haloRadius/5))*.17;
          }
          light=sat(spikes);rr+=light*125;gg+=light*95;bb+=light*133;break;
        }
        case 6:{const f=1.16;rr=(r-128)*f+128;gg=(g-128)*f+128;bb=(b-128)*f+128;break;}
        case 7:rr=255-r*.9;gg=255-g*.95;bb=244-b;break;
        case 8:{const gray=L;rr=blend(gray,r,.25)*1.07;gg=blend(gray,g,.25)*1.07;bb=blend(gray,b,.25)*1.07;break;}
        case 9:{const f=1-R*R*.2;rr=sample(cx+(tx-cx)*f,cy+(ty-cy)*f,0);gg=sample(cx+(tx-cx)*f,cy+(ty-cy)*f,1);bb=sample(cx+(tx-cx)*f,cy+(ty-cy)*f,2);break;}
        case 10:{ // Rolling shutter shifts complete scanlines together, never RGB channels separately.
          const time=(y/h-.5)*Math.PI*2;
          const drift=Math.sin(time*wavelength+orientation)*strength*scale*.09;
          rr=sample(x+drift,y,0);gg=sample(x+drift,y,1);bb=sample(x+drift,y,2);break;
        }
        case 11:{ // Two independently focused zones with a split boundary.
          const side=(x-cx)*cos+(y-cy)*sin;
          const blurred=side>0;
          const radius=Math.max(1,Math.round((.025+.025*strength)*scale));
          let ar=0,ag=0,ab=0,weight=0;
          for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
            const dx=blurred?ox*radius/2:ox*.12,dy=blurred?oy*radius/2:oy*.12;
            ar+=sample(x+dx,y+dy,0);ag+=sample(x+dx,y+dy,1);ab+=sample(x+dx,y+dy,2);weight++;
          }
          rr=ar/weight;gg=ag/weight;bb=ab/weight;break;
        }
        case 12:rr=sample(tx+strength*5*Math.exp(-R),ty,0);bb=sample(tx-strength*5*Math.exp(-R),ty,2);break;
        case 13:light=highlight*Math.max(0,1-R*1.4)*(.5+.5*Math.cos(theta));rr+=light*170;gg+=light*110;bb+=light*15;break;
      }
      if(glowOutside)emittedAlpha=sat(light*strength)*230;
    }
    // Family-specific chroma/tone controls influence the rendered result.
    // Neutral defaults (50/0/50) preserve the identity of each original look.
    if(section===0){
      const curve=(wavelength-1)*.24,temperature=orientation*.13;
      rr=255*Math.pow(sat(rr/255),1+curve)+temperature*70;
      gg=255*Math.pow(sat(gg/255),1+curve);
      bb=255*Math.pow(sat(bb/255),1+curve)-temperature*70;
    }
    if(chroma!==1){
      const brightness=lum(rr,gg,bb);
      const richness=Math.max(.1,Math.min(2,chroma));
      rr=brightness+(rr-brightness)*richness;
      gg=brightness+(gg-brightness)*richness;
      bb=brightness+(bb-brightness)*richness;
    }
    data[i]=clip(blend(r,rr,strength));data[i+1]=clip(blend(g,gg,strength));data[i+2]=clip(blend(b,bb,strength));
    // Distortions propagate sampled alpha, tonal and style filters leave it intact.
    data[i+3]=section===3||(section===4&&v===11)?clip(blend(alpha,aa,strength)):clip(Math.max(alpha,emittedAlpha));
  }
  };
  let nextRow=0;
  return {runRows(rows:number):boolean{
    if(nextRow>=h)return true;
    const end=Math.min(h,nextRow+Math.max(1,Math.floor(rows)));
    renderRows(nextRow,end);nextRow=end;
    if(nextRow===h)canvas.putImageData(result,0,0);
    return nextRow===h;
  },output:()=>output};
}

/** Synchronous authoritative export uses the SAME row kernel as the
 * cooperative in-app preview. No resampling or quality reduction occurs. */
export function renderExpansion120(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
  const job=createExpansion120Job(source,effect);
  job.runRows(Number.MAX_SAFE_INTEGER);
  return job.output();
}
