"""Pixel/alpha correctness, live graph/cache parity and Neon Edge throughput in Chromium."""
import json, os, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    kwargs = {'headless': True, 'args': ['--no-sandbox']}
    if os.path.exists('/usr/bin/chromium'): kwargs['executable_path'] = '/usr/bin/chromium'
    browser = p.chromium.launch(**kwargs)
    try:
        page=browser.new_page()
        page.goto('about:blank')
        page.add_script_tag(content=sys.stdin.read())
        results=page.evaluate(r'''() => {
          const fx=window.AuroraQRS;
          const canvas=(w=112,h=88)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
          function source(opaque=false){const c=canvas(),t=c.getContext('2d');
            if(opaque){t.fillStyle='#162440';t.fillRect(0,0,c.width,c.height);}
            const g=t.createLinearGradient(8,10,92,85);g.addColorStop(0,'#e75d99');g.addColorStop(1,'#57c5f8');
            t.fillStyle=g;t.fillRect(12,9,64,49);t.fillStyle='#ffffd9';t.font='bold 18px sans-serif';t.fillText('Aurora',6,76);return c;
          }
          const clone=c=>{const o=canvas(c.width,c.height);o.getContext('2d').drawImage(c,0,0);return o;};
          const pixels=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
          const equal=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
          let passed=0;
          function check(condition,why){if(!condition)throw Error(why);passed++;}
          const transparent=source(),opaque=source(true);
          for (const [idx,name] of ['Plasma Veins','Nebula Bloom','Spectral Refraction','Rift Distortion',
            'Inferno Aura','Crystal Resonance','Liquid Light'].entries()) {
            const kind='sig_'+(idx+15),base=fx.newEffect(kind,70,'#ff62ce');
            for (const img of [transparent,opaque]) {
              const original=pixels(img),effect=fx.applyEffect(img,base),result=pixels(effect);
              check(!equal(original,result), name+' failed to affect artwork');
              check(equal(result,pixels(fx.applyEffect(clone(img),base))),name+' is not deterministic');
              const neutral=pixels(fx.applyEffect(img,{...base,amount:0}));
              check(equal(original,neutral),name+' has a non-neutral zero strength');
              let alphaSame=true;for(let i=3;i<result.length;i+=4)if(result[i]!==original[i]){alphaSame=false;break;}
              check(alphaSame,name+' changed original alpha');
              const modified=pixels(fx.applyEffect(img,{...base,amount:97}));
              check(!equal(result,modified),name+' amount slider not effective');
            }
          }
          for(const kind of ['animecel','graphicnovel','foil','chromaticsilk','pixelposter','inkwash','retrodream']) {
            const base=fx.newEffect(kind,75,'#e764d2');const initial=pixels(transparent);
            check(!equal(initial,pixels(fx.applyEffect(transparent,base))),kind+' missing effect');
            check(equal(initial,pixels(fx.applyEffect(transparent,{...base,amount:0}))),kind+' no-op broken');
            check(!equal(pixels(fx.applyEffect(transparent,base)),pixels(fx.applyEffect(transparent,{...base,amount:30}))),kind+' amount not applied');
          }
          const chain=['neonedge','glow','sig_16','animecel','sig_18','contrast','foil','miasma','sig_20','brightness'].map((kind,i)=>fx.newEffect(kind,i%2?65:75));
          const cache=new fx.EffectStackCache(64*1024*1024),img=source();
          const expected=pixels(fx.processEffects(clone(img),chain));
          check(equal(expected,pixels(cache.render(911,img,chain))),'10-layer cached stack output differs from export');
          const second=chain.map((item,i)=>i===8?{...item,amount:25}:item);
          check(equal(pixels(fx.processEffects(clone(img),second)),pixels(cache.render(911,img,second))),'intermediate edit corrupted following stages');
          const wide=[...chain,...chain.map((fxStep,i)=>({...fxStep,id:'other'+i,amount:Math.max(0,fxStep.amount-12)}))];
          check(equal(pixels(fx.processEffects(clone(img),wide)),pixels(cache.render(912,img,wide))),
            '20 full-resolution effect stages match uncached export');
          // Independently coded reference for the pre-Phase-QRS Neon Edge formula.
          // The optimized implementation MUST remain byte-for-byte equivalent.
          function referenceNeon(input, effect){
            const w=input.width,h=input.height;
            const src=input.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h);
            const at=(x,y)=>{const i=(Math.min(h-1,Math.max(0,y))*w+Math.min(w-1,Math.max(0,x)))*4;
              return .2126*src.data[i]+.7152*src.data[i+1]+.0722*src.data[i+2];};
            const map=new Uint8ClampedArray(w*h);
            for(let y=0;y<h;y++)for(let x=0;x<w;x++){
              const gx=-at(x-1,y-1)+at(x+1,y-1)-2*at(x-1,y)+2*at(x+1,y)-at(x-1,y+1)+at(x+1,y+1);
              const gy=-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1);
              map[y*w+x]=Math.min(255,Math.max(0,Math.hypot(gx,gy)/4));
            }
            const tint=effect.color.match(/^#([a-f\d]{6})$/i)[1];
            const rgb=[0,2,4].map(k=>parseInt(tint.slice(k,k+2),16));
            for(let i=0;i<src.data.length;i+=4){
              const level=Math.max(0,map[i/4]-(effect.parameters.threshold??45));
              for(let c=0;c<3;c++)src.data[i+c]=Math.max(0,Math.min(255,
                src.data[i+c]*.12+level*rgb[c]/80*(effect.amount/100)));
            }
            const rendered=canvas(w,h),r=rendered.getContext('2d',{willReadFrequently:true});r.putImageData(src,0,0);
            if((effect.parameters.glowRadius??0)<=0)return rendered;
            const bloom=canvas(w,h),b=bloom.getContext('2d');
            b.filter=`blur(${effect.parameters.glowRadius}px)`;b.drawImage(rendered,0,0);
            const output=canvas(w,h),t=output.getContext('2d',{willReadFrequently:true});t.drawImage(bloom,0,0);
            t.globalCompositeOperation='screen';t.drawImage(rendered,0,0);
            const branching=effect.parameters.branching??0;
            if(branching>0){
              function noise(x,y,seed){let n=Math.imul(x+1,374761393)+Math.imul(y+1,668265263)+Math.imul(seed,1442695041);
                n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
              const seed=effect.parameters.seed??42;t.strokeStyle=effect.color??'#60e8ff';t.lineWidth=.7;
              t.globalCompositeOperation='screen';t.globalAlpha=Math.min(.9,branching/100);
              let drawn=0;
              for(let y=2;y<h-3&&drawn<Math.floor(branching*2);y+=3)for(let x=2;x<w-3&&drawn<Math.floor(branching*2);x+=3){
                if(map[y*w+x]<35||noise(x,y,seed)>branching/900)continue;
                const direction=noise(y,x,seed)*Math.PI*2,dist=3+noise(x,y,seed+7)*10;
                t.beginPath();t.moveTo(x,y);t.lineTo(x+Math.cos(direction)*dist*.5,y+Math.sin(direction)*dist*.2);
                t.lineTo(x+Math.cos(direction+.5)*dist,y+Math.sin(direction)*dist);t.stroke();drawn++;
              }
            }
            return output;
          }
          const neon=fx.newEffect('neonedge',85,'#42f1fa',{glowRadius:14,threshold:38,branching:23});
          const n1=fx.applyEffect(transparent,neon),n2=fx.applyEffect(clone(transparent),neon);
          check(equal(pixels(n1),pixels(n2)),'Neon Edge optimization introduced nondeterminism');
          for(const branch of [0,23]){const setting={...neon,parameters:{...neon.parameters,branching:branch}};
            check(equal(pixels(fx.applyEffect(transparent,setting)),pixels(referenceNeon(transparent,setting))),`Neon Edge exact legacy parity (branches=${branch})`);}
          const larger=canvas(960,540),t=larger.getContext('2d');
          t.fillStyle='#12345b';t.fillRect(0,0,960,540);t.fillStyle='#ff48bc';t.font='bold 140px sans-serif';t.fillText('HUELITH',30,280);
          const timings=[],legacyTimings=[];
          for(let i=0;i<3;i++){
            const changed={...neon,amount:72+i*7};
            let start=performance.now();referenceNeon(larger,changed);legacyTimings.push(Math.round(performance.now()-start));
            start=performance.now();fx.applyEffect(larger,changed);timings.push(Math.round(performance.now()-start));
          }
          const hd=canvas(1920,1080),hdContext=hd.getContext('2d');
          hdContext.fillStyle='#152b54';hdContext.fillRect(0,0,1920,1080);
          hdContext.fillStyle='#e65aff';hdContext.font='bold 215px sans-serif';
          hdContext.fillText('Huelith 0.1',105,540);
          const hdStart=performance.now();const hdOutput=fx.applyEffect(hd,neon);
          const fullHdMs=Math.round(performance.now()-hdStart);
          check(hdOutput.width===1920&&hdOutput.height===1080,'1080p full-resolution fidelity lost');
          return {passed,timingsMs:timings,referenceMs:legacyTimings,fullHdMs,
            benchmark:'960x540 and 1920x1080 Neon Edge on headless Chromium; NOT a Windows FPS guarantee'};
        }''')
        print(json.dumps(results))
    finally:
        browser.close()
