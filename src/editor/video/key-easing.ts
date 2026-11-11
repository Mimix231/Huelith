export type KeyEasing='linear'|'ease-in'|'ease-out'|'ease-in-out'|'hold';
export type Bezier=[number,number,number,number];
export type KeyCurve={easing?:KeyEasing;easeRange?:[number,number];curve?:Bezier};
export const KEY_EASINGS:readonly KeyEasing[]=['linear','ease-in','ease-out','ease-in-out','hold'];

export function validKeyCurve(key:KeyCurve){
  return (key.easing===undefined||KEY_EASINGS.includes(key.easing))
    &&(key.curve===undefined||Array.isArray(key.curve)&&key.curve.length===4&&key.curve.every(n=>Number.isFinite(n)&&n>=0&&n<=1))
    &&(key.easeRange===undefined||Array.isArray(key.easeRange)&&key.easeRange.length===2&&key.easeRange.every(Number.isFinite)
      &&key.easeRange[0]>=0&&key.easeRange[1]<=1&&key.easeRange[0]<key.easeRange[1]);
}

const cubic=(p:number,a:number,b:number)=>3*(1-p)**2*p*a+3*(1-p)*p*p*b+p**3;

export function easeKey(p:number,easing?:KeyEasing,curve?:Bezier){
  if(curve&&p>0&&p<1){
    let lo=0,hi=1;
    for(let i=0;i<18;i++){
      const t=(lo+hi)/2;
      if(cubic(t,curve[0],curve[2])<p)lo=t;else hi=t;
    }
    return cubic((lo+hi)/2,curve[1],curve[3]);
  }
  if(curve)return p;
  switch(easing){
    case 'ease-in':return p*p;
    case 'ease-out':return p*(2-p);
    case 'ease-in-out':return p*p*(3-2*p);
    case 'hold':return p===1?1:0;
    default:return p;
  }
}

export function easedProgress(p:number,key:KeyCurve){
  if(p<=0||p>=1)return p;
  const [start,end]=key.easeRange??[0,1];
  const a=easeKey(start,key.easing,key.curve),b=easeKey(end,key.easing,key.curve);
  return b>a?(easeKey(start+(end-start)*p,key.easing,key.curve)-a)/(b-a):p;
}

export function rebaseCurve(key:(KeyCurve & {time:number})|undefined,nextTime:number|undefined,offset:number):KeyCurve{
  if(!key||nextTime===undefined)return {};
  const [start,end]=key.easeRange??[0,1];
  const point=start+(end-start)*(offset-key.time)/(nextTime-key.time);
  return {easing:key.easing,curve:key.curve,easeRange:point<end?[point,end]:undefined};
}
