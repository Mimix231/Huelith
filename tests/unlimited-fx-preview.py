"""Behavioral verification: five-plus FX preserve their complete stack and Glow halo."""
from playwright.sync_api import sync_playwright
import sys, json
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    try:
        page=browser.new_page()
        page.goto('about:blank')
        result=page.evaluate(r'''compiled => {
          const module={exports:{}};
          new Function('module','exports','require',compiled)(module,module.exports,()=>({}));
          const {gpuPreviewSupport,paintCanvasEffectDraft}=module.exports;
          const source=document.createElement('canvas'); source.width=240; source.height=170;
          const ctx=source.getContext('2d');
          ctx.fillStyle='#ff4030';ctx.fillRect(70,45,110,85);
          ctx.fillStyle='#27f5c8';ctx.fillRect(85,57,15,25);
          const fx=(kind,id,amount=45,params={})=>({kind,id,amount,enabled:true,
            color:'#c555ff',parameters:params});
          const stack=[fx('brightness','brightness',140),fx('contrast','contrast',115),
            fx('saturate','saturate',120),fx('sepia','sepia',15),fx('glow','glow',32,{softness:25,opacity:90})];
          function frame(effects){
            const out=document.createElement('canvas');out.width=240;out.height=170;
            const g=out.getContext('2d');
            if(!paintCanvasEffectDraft(g,source,effects,240,170))throw Error('Preview unavailable');
            return out;
          }
          function pixel(canvas,x,y){return [...canvas.getContext('2d').getImageData(x,y,1,1).data];}
          function delta(a,b){const aa=a.getContext('2d').getImageData(0,0,240,170).data,
            bb=b.getContext('2d').getImageData(0,0,240,170).data;
            let changed=0;for(let i=0;i<aa.length;i+=4) if(aa[i]!==bb[i] || aa[i+1]!==bb[i+1] || aa[i+2]!==bb[i+2] || aa[i+3]!==bb[i+3]) changed++;return changed;}
          if(!gpuPreviewSupport(stack)) throw Error('Five effects refused');
          for(let n of [5,6,12,25,64]) if(!gpuPreviewSupport(Array.from({length:n},(_,i)=>fx('glow','glow'+i,50))))
            throw Error('Arbitrary length cap: '+n);
          const five=frame(stack),four=frame(stack.slice(0,4));
          const center=pixel(five,105,99),centerFour=pixel(four,105,99);
          if(delta(five,four)<5) throw Error('Fifth effect ignored');
          if(center[3]!==255 || centerFour[3]!==255)throw Error('Subject alpha changed '+JSON.stringify({center,centerFour}));
          const low=frame(stack.map(e=>e.id==='glow'?{...e,amount:8}:e));
          const high=frame(stack.map(e=>e.id==='glow'?{...e,amount:75}:e));
          if(delta(low,high)<10)throw Error('Glow amount does not affect preview');
          const glowStates=[0,25,50,75,100].map(amount=>frame(stack.map(e=>
            e.id==='glow'?{...e,amount}:e)));
          for(let i=1;i<glowStates.length;i++){
            if(delta(glowStates[i-1],glowStates[i])<10)
              throw Error('Glow state did not change between '+(i-1)*25+' and '+i*25);
          }
          // Same stacking order: changing preceding brightness affects the subject.
          const dim=frame(stack.map(e=>e.id==='brightness'?{...e,amount:55}:e));
          if(delta(five,dim)<20) throw Error('Preceding adjustments were dropped');
          const neutral=frame([fx('brightness','b',100)]);
          const brighter=frame([fx('brightness','b',175)]);
          if(pixel(brighter,110,80)[0]<pixel(neutral,110,80)[0])throw Error('Brightness increases darken object');
          const original=pixel(source,85,57);
          // Glow must not introduce a geometric offset or scale of the subject.
          const a=frame([fx('glow','g',8,{softness:25,opacity:90})]);
          const b=frame([fx('glow','g',75,{softness:25,opacity:90})]);
          for(const image of [a,b]) {
            const retained=pixel(image,85,57);
            if(retained[0]!==original[0] || retained[1]!==original[1] || retained[2]!==original[2])
              throw Error('Glow replaced source pixels or moved subject '+JSON.stringify({retained,original}));
          }
          return {checks:15,unsupportedWebGL:!document.createElement('canvas').getContext('webgl2'),
            glowPixelDelta:delta(low,high),fullStackDelta:delta(five,four),brighter:pixel(brighter,110,80),
            core: center};
        }''',sys.stdin.read())
        print('Unlimited FX stack and continuous Glow tests:', json.dumps(result))
    finally:
        browser.close()
