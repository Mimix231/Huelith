import {useEffect,useState,type RefObject} from 'react';

type Hint={text:string;x:number;y:number;above:boolean};
export default function VideoStudioHints({workspace}:{workspace:RefObject<HTMLElement|null>}){
  const [hint,setHint]=useState<Hint>();
  useEffect(()=>{
    const root=workspace.current;
    if(!root)return;
    let target:HTMLElement|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    function clear(){
      clearTimeout(timer);
      if(target){target=undefined;setHint(undefined);}
    }
    function enter(event:Event){
      if(event instanceof PointerEvent&&(event.pointerType!=='mouse'||event.buttons))return;
      const next=event.target instanceof Element?event.target.closest<HTMLElement>('[data-hint]'):null;
      if(!next||next===target||event.type==='focusin'&&!next.matches(':focus-visible'))return;
      clear();target=next;
      timer=setTimeout(()=>{
        if(!next.isConnected||!next.dataset.hint)return;
        const rect=next.getBoundingClientRect(),above=rect.bottom>innerHeight-72;
        setHint({text:next.dataset.hint,x:Math.max(145,Math.min(innerWidth-145,rect.left+rect.width/2)),
          y:above?rect.top-7:rect.bottom+7,above});
      },event.type==='focusin'?110:360);
    }
    function leave(event:Event){
      const related=(event as MouseEvent|FocusEvent).relatedTarget;
      if(target&&related instanceof Node&&target.contains(related))return;
      clear();
    }
    root.addEventListener('pointerover',enter);
    root.addEventListener('focusin',enter);
    root.addEventListener('pointerout',leave);
    root.addEventListener('focusout',leave);
    root.addEventListener('pointerdown',clear);
    root.addEventListener('scroll',clear,true);
    return()=>{
      clearTimeout(timer);
      root.removeEventListener('pointerover',enter);
      root.removeEventListener('focusin',enter);
      root.removeEventListener('pointerout',leave);
      root.removeEventListener('focusout',leave);
      root.removeEventListener('pointerdown',clear);
      root.removeEventListener('scroll',clear,true);
    };
  },[workspace]);
  return hint?<span aria-hidden="true" className={`hv-studio-hint${hint.above?' is-above':''}`}
    style={{left:hint.x,top:hint.y}}>{hint.text}</span>:null;
}
