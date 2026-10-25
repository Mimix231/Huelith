"""Aurora II N–P real Chromium pixel verification: CPU raster, opaque and transparent shapes, and multiple FX."""
import json, os, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as playwright:
    launch={'headless':True,'args':['--no-sandbox']}
    if os.path.exists('/usr/bin/chromium'):
        launch['executable_path']='/usr/bin/chromium'
    browser=playwright.chromium.launch(**launch)
    try:
        page=browser.new_page()
        page.goto('about:blank')
        page.add_script_tag(content=sys.stdin.read())
        result=page.evaluate("""() => {
          const fx=window.AuroraNOP;
          const c=(w=120,h=96)=>{const x=document.createElement('canvas');x.width=w;x.height=h;return x};
          function sample(mode){const x=c(),p=x.getContext('2d');
            if(mode==='opaque'){p.fillStyle='#142038';p.fillRect(0,0,120,96);}
            p.fillStyle='#ff73d4';p.fillRect(28,20,42,42);
            p.fillStyle='#5ee8ff';p.font='bold 20px sans-serif';p.fillText('HUELITH',4,82);
            if(mode==='photo'){const g=p.createLinearGradient(0,0,120,96);g.addColorStop(0,'#d14b5a');g.addColorStop(1,'#2149ad');p.globalAlpha=.25;p.fillStyle=g;p.fillRect(0,0,120,96);p.globalAlpha=1;}
            return x;
          }
          const bytes=x=>x.getContext('2d',{willReadFrequently:true}).getImageData(0,0,x.width,x.height).data;
          const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
          const different=(a,b)=>!equal(bytes(a),bytes(b));
          const clone=x=>{const n=c(x.width,x.height);n.getContext('2d').drawImage(x,0,0);return n};
          let passed=0, reports=[];
          function check(condition, message){if(!condition)throw Error(message);passed++;reports.push(message);}
          const transparent=sample('transparent'),opaque=sample('opaque'),photo=sample('photo');
          const styles=['neon','double','electric','soft','gradient'];
          for(const style of styles){const x=fx.newEffect('outline',9,'#ffcf58',{
            outlineStyle:style,secondaryColor:'#55cfff',outlineGap:3,secondaryWidth:4,softness:6});
            check(different(fx.applyEffect(transparent,x),transparent),`Outline ${style} changes transparent silhouette`);
          }
          const classic=fx.newEffect('outline',6,'#ffffff',{outlineStyle:'classic'});
          check(equal(bytes(fx.applyEffect(transparent,classic)),bytes(fx.applyEffect(clone(transparent),classic))),
            'Classic outline remains deterministic for old documents');
          const advanced=fx.newEffect('outline',8,'#ee8fff');
          check(different(fx.applyEffect(opaque,advanced),opaque),
            'New silhouette-aware outline modifies connected opaque background');
          const contours=fx.newEffect('outline',8,'#ee8fff',{outlineStyle:'neon',silhouetteMode:'edge'});
          check(different(fx.applyEffect(photo,contours),photo),
            'Complex image edge mode produces real internal contours');
          for(const mode of ['outer','inner','both','bloom','atmosphere','energy']){
            const v=fx.newEffect('glow',35,'#b25bff',{glowMode:mode});
            const a=fx.applyEffect(transparent,v),b=fx.applyEffect(clone(transparent),v);
            check(equal(bytes(a),bytes(b)) && different(a,transparent),`Glow ${mode} is authoritative/deterministic`);
          }
          const cut=fx.newEffect('cutout',28,'#aa66ff',{feather:1,decontaminate:75});
          check(different(fx.applyEffect(opaque,cut),opaque),'Remove Background processes fringe/feather values');
          const shadow=fx.newEffect('shadow',34,'#452056');
          shadow.parameters.shadows=[{id:'perspective',enabled:true,style:'perspective',offsetX:14,offsetY:17,radius:6,spread:5,opacity:.6,color:'#331244'}];
          check(different(fx.applyEffect(transparent,shadow),transparent),'Perspective shadow computes actual spatial projection');
          const back=fx.newEffect('backdrop',72,'#102044',{backdropMode:'radial'});
          check(different(fx.applyEffect(transparent,back),transparent),'Radial backdrop visible behind transparent layer');
          const radiance=fx.newEffect('radiance',55,'#fff1a7',{lightDirection:65,raySpread:35});
          const miasma=fx.newEffect('miasma',65,'#181438',{windX:28,windY:-12});
          check(different(fx.applyEffect(transparent,radiance),fx.applyEffect(transparent,
            {...radiance,parameters:{...radiance.parameters,lightDirection:-65}})),
            'Holy Radiance rays respond to direction');
          check(different(fx.applyEffect(transparent,miasma),fx.applyEffect(transparent,
            {...miasma,parameters:{...miasma.parameters,windX:-25}})),
            'Miasma reacts to cloud drift parameters');
          const stack=['outline','glow','shadow','radiance','miasma','backdrop','cutout'].map(k=>fx.newEffect(k,25));
          const graph=new fx.EffectStackCache();
          const first=graph.render(13,transparent,stack);
          const fresh=fx.processEffects(clone(transparent),stack);
          check(equal(bytes(first),bytes(fresh)),'Seven layered effects match uncached exact output');
          const modified=stack.map((e,i)=>i===2?{...e,amount:55}:e);
          check(equal(bytes(graph.render(13,transparent,modified)),bytes(fx.processEffects(clone(transparent),modified))),
            'Editing shadow at stage 3 does not corrupt later radiance, miasma or backdrop');
          const widths=[1,5,10].map(count=>Array.from({length:count},(_,i)=>fx.newEffect(i%2?'glow':'brightness',i%2?12:105)));
          for(const chain of widths){
            check(equal(bytes(fx.processEffects(transparent,chain)),bytes(fx.processEffects(clone(transparent),chain))),
              `${chain.length}-effect stack remains deterministic on transparent typography`);
          }
          return {passed,reports};
        }""")
        print(json.dumps(result))
    finally:
        browser.close()
