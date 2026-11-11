import {clamp,type EffectFactory} from './common';
import {colorKernel,toLinear,fromLinear} from './color-science-common';
/** Bradford cone-response chromatic adaptation of source white to target
 * illuminant; preserves relative colors rather than multiplying raw RGB. */
export const chromaticAdaptation:EffectFactory=input=>{
  const {source,parameters:p}=input;
  let sr=0,sg=0,sb=0,n=0;
  for(let i=0;i<source.length;i+=4){
    if(source[i+3]===0)continue;
    const r=source[i],g=source[i+1],b=source[i+2];
    if(Math.max(r,g,b)<100)continue;
    const weight=(Math.max(r,g,b)/255)**3*(source[i+3]/255);
    sr+=toLinear(r)*weight;sg+=toLinear(g)*weight;sb+=toLinear(b)*weight;n+=weight;
  }
  const inferred:[number,number,number]=n>0?[sr/n,sg/n,sb/n]:[.8,.8,.8];
  // Bradford RGB-linear to LMS transform (combined with D65 RGB->XYZ).
  const toCone=(r:number,g:number,b:number)=>[.8951*(.4124564*r+.3575761*g+.1804375*b)+.2664*(.2126729*r+.7151522*g+.072175*b)-.1614*(.0193339*r+.119192*g+.9503041*b),
    -.7502*(.4124564*r+.3575761*g+.1804375*b)+1.7135*(.2126729*r+.7151522*g+.072175*b)+.0367*(.0193339*r+.119192*g+.9503041*b),
    .0389*(.4124564*r+.3575761*g+.1804375*b)-.0685*(.2126729*r+.7151522*g+.072175*b)+1.0296*(.0193339*r+.119192*g+.9503041*b)] as const;
  const srcRaw=toCone(...inferred);
  const sceneY=.2126729*inferred[0]+.7151522*inferred[1]+.072175*inferred[2];
  const src=srcRaw.map(v=>v/Math.max(.012,sceneY));
  const warm=clamp((p.colorMix??50)/100),temperature=warm*2-1;
  const target=toCone(1+temperature*.12,1,1-temperature*.12);
  const ratio=src.map((v,i)=>clamp(target[i]/Math.max(.03,v),.65,1.5));
  return colorKernel(input,(r,g,b)=>{
    const x=toCone(toLinear(r),toLinear(g),toLinear(b));
    const l=x[0]*ratio[0],m=x[1]*ratio[1],s=x[2]*ratio[2];
    const X= .9869929*l-.1470543*m+.1599627*s;
    const Y= .4323053*l+.5183603*m+.0492912*s;
    const Z=-.0085287*l+.0400428*m+.9684867*s;
    return [fromLinear(3.2404542*X-1.5371385*Y-.4985314*Z),
      fromLinear(-.969266*X+1.8760108*Y+.041556*Z),
      fromLinear(.0556434*X-.2040259*Y+1.0572252*Z)];
  });
};
