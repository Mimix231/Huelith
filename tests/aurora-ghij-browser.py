"""Actual Chromium image-difference checks for Aurora G–J.

Validation is performed with the same authoritative FX Studio source functions.
Unlike a pixel-changed test, both paths must have identical RGBA outputs.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    options = {'headless': True, 'args': ['--no-sandbox']}
    if os.path.exists('/usr/bin/chromium'):
        options['executable_path'] = '/usr/bin/chromium'
    browser = playwright.chromium.launch(**options)
    try:
        page = browser.new_page()
        page.goto('about:blank')
        page.add_script_tag(content=sys.stdin.read())
        result = page.evaluate('''(options) => {
          const fx=window.AuroraGH;
          const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
          const draw=(c)=>{
            const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);
            g.fillStyle='#916be2';g.fillRect(c.width*.14,c.height*.2,c.width*.53,c.height*.44);
            g.fillStyle='#ffaf25';g.fillRect(c.width*.48,c.height*.45,c.width*.25,c.height*.42);
            g.fillStyle='#4bd5ff';g.font=`bold ${Math.max(12,Math.floor(c.width/8))}px Arial`;
            g.fillText('Huelith',c.width*.05,c.height*.71);
          };
          const clone=source=>{const c=canvas(source.width,source.height);c.getContext('2d').drawImage(source,0,0);return c;};
          const bytes=source=>source.getContext('2d').getImageData(0,0,source.width,source.height).data;
          const equal=(a,b)=>a.length===b.length && a.every((value,index)=>value===b[index]);
          let passed=0;
          const reports=[];
          const input=canvas(132,88);draw(input);
          fx.markImmutableEffectSource(input);
          const glowA=fx.newEffect('glow',25);
          const glowB={...glowA,amount:75};
          const first=fx.applyEffect(input,glowA);
          const second=fx.applyEffect(input,glowB);
          const reference=fx.applyEffect(clone(input),glowB);
          if(!equal(bytes(second),bytes(reference)))throw Error('Cached Glow changed any output pixels');
          if(equal(bytes(first),bytes(second)))throw Error('Glow slider failed to change actual glow pixels');
          passed++;reports.push('Glow slider reuses full-resolution distance field, pixel-identical to uncached reference');
          // Changing a source must never reuse the other source's silhouette.
          const different=clone(input);different.getContext('2d').clearRect(0,0,40,40);
          fx.markImmutableEffectSource(different);
          if(!equal(bytes(fx.applyEffect(different,glowB)), bytes(fx.applyEffect(clone(different),glowB))))
            throw Error('Glow retained stale geometry when source pixels changed');
          passed++;reports.push('Changing input artwork invalidates cached Glow geometry');
          const outline=fx.newEffect('sig_0',75);
          const outlined=fx.applyEffect(input,outline);
          const retinted=fx.applyEffect(input,{...outline,amount:90});
          const fresh=fx.applyEffect(clone(input),{...outline,amount:90});
          if(!equal(bytes(retinted),bytes(fresh)))throw Error('Cached Hyper Outline changed image appearance');
          if(equal(bytes(outlined),bytes(retinted)))throw Error('Hyper Outline slider did not modify output');
          passed++;reports.push('Hyper Outline slider preserves exact RGB and alpha with retained subject geometry');
          const miasma=fx.newEffect('miasma',30);
          fx.applyEffect(input,miasma);
          const miasma80={...miasma,amount:80};
          const miasmaWarm=fx.applyEffect(input,miasma80);
          if(!equal(bytes(miasmaWarm),bytes(fx.applyEffect(clone(input),miasma80))))
            throw Error('Cached Miasma differs from the original procedural atmosphere');
          const changedField={...miasma80,parameters:{...miasma80.parameters,turbulence:92,radius:60}};
          if(!equal(bytes(fx.applyEffect(input,changedField)),bytes(fx.applyEffect(clone(input),changedField))))
            throw Error('Miasma geometry cache ignored changed turbulence or radius');
          passed++;reports.push('Miasma intensity and turbulence use original atmospheric algorithm, exact pixel parity');
          const radiance=fx.newEffect('radiance',65);
          fx.applyEffect(input,radiance);
          const radianceWarm=fx.applyEffect(input,{...radiance,amount:90});
          if(!equal(bytes(radianceWarm),bytes(fx.applyEffect(clone(input),{...radiance,amount:90}))))
            throw Error('Cached Radiance changed the real rays or procedural field');
          passed++;reports.push('Radiance cloud fields preserve exact alpha and RGB from reference');
          // Multiple animation cels with the SAME layer ID need independent,
          // stable source identities when returning to an earlier frame.
          let paints=0;
          const effects=[fx.newEffect('brightness',120)];
          const layer={id:'animation-layer-1',type:'raster',visible:true,locked:false,
            x:0,y:0,image:'cel-A',imageWidth:132,imageHeight:88,opacity:1,
            blend:'source-over',effects};
          const paint=(g,current)=>{
            paints++;
            g.fillStyle=current.image==='cel-A'?'#803caa':'#197ed2';g.fillRect(0,0,132,88);
          };
          function frame(image){
            const output=canvas(132,88);fx.renderWithEffects(output.getContext('2d'),{...layer,image},paint,132,88,()=>{});
            return bytes(output);
          }
          const A=frame('cel-A'), B=frame('cel-B'), Aagain=frame('cel-A');
          if(!equal(A,Aagain)||equal(A,B)||paints!==2)
            throw Error(`Animation cel cache invalid: ${paints} source repaints`);
          passed++;reports.push('A → B → A animation cels preserve distinct, reusable source images');
          // A high-effect stack must keep EXACT order and effect behavior
          // after edits to an interior stage. Cached and fresh processing
          // should produce identical RGBA output, not just changed pixels.
          const chain=[fx.newEffect('brightness',115),fx.newEffect('vhs',35),fx.newEffect('glow',42),
            fx.newEffect('miasma',37),fx.newEffect('contrast',122),fx.newEffect('sig_0',46),
            fx.newEffect('shadow',24),fx.newEffect('invert',14)];
          const stackCache = new fx.EffectStackCache();
          const cachedBaseline=stackCache.render(902,input,chain);
          const freshBaseline=fx.processEffects(clone(input),chain);
          if(!equal(bytes(cachedBaseline),bytes(freshBaseline)))throw Error('Eight-effect cached stack differs from exact export');
          const modified=chain.map((item,index)=>index===3?{...item,amount:77}:item);
          const cachedModified=stackCache.render(902,input,modified);
          const freshModified=fx.processEffects(clone(input),modified);
          if(!equal(bytes(cachedModified),bytes(freshModified)))throw Error('Eight-effect stack used outdated internal stages');
          passed++;reports.push('Eight-layer-effect chain remains exact when a middle Miasma slider changes');
          // Benchmark a real 1920x1080 exact Glow adjustment. Timings are
          // observational, never asserted as a universal 60-FPS guarantee.
          const large=canvas(options.width,options.height);draw(large);
          fx.markImmutableEffectSource(large);
          const t0=performance.now();
          fx.applyEffect(large,{...glowA,amount:40});
          const coldMs=performance.now()-t0;
          const t1=performance.now();
          const warm=fx.applyEffect(large,{...glowA,amount:80});
          const warmMs=performance.now()-t1;
          const exact=fx.applyEffect(clone(large),{...glowA,amount:80});
          if(!equal(bytes(warm),bytes(exact))) throw Error('Full-size warm-cache Glow does not match exact cold reference');
          passed++;reports.push('Full-size cached Glow matches exact uncached result pixel-for-pixel');
          const t2=performance.now();
          fx.applyEffect(large,{...miasma,amount:45});
          const miasmaColdMs=performance.now()-t2;
          const t3=performance.now();
          const miasmaLarge=fx.applyEffect(large,{...miasma,amount:90});
          const miasmaWarmMs=performance.now()-t3;
          if(!equal(bytes(miasmaLarge),bytes(fx.applyEffect(clone(large),{...miasma,amount:90}))))
            throw Error('Full-size cached Miasma does not match the exact procedural result');
          passed++;reports.push('Full-size cached Miasma matches exact uncached result pixel-for-pixel');
          return {passed,reports,benchmark:{canvas:`${large.width}×${large.height}`,coldGlowMs:+coldMs.toFixed(1),warmGlowMs:+warmMs.toFixed(1),coldMiasmaMs:+miasmaColdMs.toFixed(1),warmMiasmaMs:+miasmaWarmMs.toFixed(1)}};
        }''', {'width': 3840 if os.environ.get('AURORA_BENCH_4K') == '1' else 1920, 'height': 2160 if os.environ.get('AURORA_BENCH_4K') == '1' else 1080})
        print(json.dumps(result))
    finally:
        browser.close()
