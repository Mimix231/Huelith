export type ChromaKey={color:string;tolerance:number;softness:number;spill:number};
export const DEFAULT_CHROMA_KEY:ChromaKey={color:'#00ff00',tolerance:.2,softness:.1,spill:.72};
export function validChromaKey(value:unknown):value is ChromaKey{
  const key=value as ChromaKey|null;
  return !!key&&/^#[0-9a-f]{6}$/i.test(key.color)
    &&[key.tolerance,key.softness,key.spill].every(n=>Number.isFinite(n)&&n>=0&&n<=1);
}

const luma=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b;

export function keyRgba(data:Uint8ClampedArray,key:ChromaKey){
  const color=parseInt(key.color.slice(1),16),kr=(color>>16)/255,kg=(color>>8&255)/255,kb=(color&255)/255;
  const level=luma(kr,kg,kb),cb=(kb-level)*.539,cr=(kr-level)*.635;
  const ax=kr-level,ay=kg-level,az=kb-level,energy=ax*ax+ay*ay+az*az;
  const gray=energy<.015;
  const softness=Math.max(.001,key.softness);
  for(let i=0;i<data.length;i+=4){
    if(!data[i+3])continue;
    const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,y=luma(r,g,b);
    const db=(b-y)*.539-cb,dr=(r-y)*.635-cr;
    const dl=gray?(y-level)*.75:0;
    const distance=Math.sqrt(db*db+dr*dr+dl*dl);
    const edge=Math.max(0,Math.min(1,(distance-key.tolerance)/softness));
    data[i+3]*=edge*edge*(3-2*edge);
    if(!data[i+3]){data[i]=data[i+1]=data[i+2]=0;continue;}
    if(!gray&&key.spill>0){
      const near=Math.max(0,1-distance/(key.tolerance+softness+.25));
      const excess=Math.max(0,((r-y)*ax+(g-y)*ay+(b-y)*az)/energy)*key.spill*near;
      data[i]=(r-excess*ax)*255;data[i+1]=(g-excess*ay)*255;data[i+2]=(b-excess*az)*255;
    }
  }
}
