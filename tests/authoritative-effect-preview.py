"""End-to-end authoritative Studio contract, comparing whole images pixelwise."""
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
        results = page.evaluate('''async () => {
          const fx=window.AuthoritativeFX;
          const reports=[];
          const canvas=(w=72,h=50)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
          const source=canvas();
          const sc=source.getContext('2d');
          sc.clearRect(0,0,72,50);
          sc.fillStyle='#8149cf';sc.fillRect(4,9,39,22);
          sc.fillStyle='#f3bb1d';sc.fillRect(29,15,16,25);
          sc.fillStyle='#0057cb';sc.fillRect(51,3,9,29);
          const pixels=c=>[...c.getContext('2d').getImageData(0,0,72,50).data];
          const equal=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
          const base=[fx.newEffect('vhs',22),fx.newEffect('glow',36),fx.newEffect('brightness',100)];
          const layer={id:'fidelity-layer',name:'Test',type:'raster',locked:false,visible:true,
            x:0,y:0,image:'raster-source',imageWidth:72,imageHeight:50,opacity:1,blend:'source-over',effects:base};
          fx.setInteractiveEffectPreview(true,layer.id);
          let finish=()=>{};
          let requests=[];
          fx.setAsyncEffectsProcessor((original,effects,id,done)=>{
            requests.push({id,amounts:effects.map(e=>e.amount)});
            // Async worker stand-in: deliberately resolve after presentation.
            setTimeout(async()=>{
              const image=fx.processEffects(original,effects);
              const bitmap=await createImageBitmap(image);
              done(bitmap);
            },0);
            return true;
          });
          function present() {
            const c=canvas();
            fx.renderWithEffects(c.getContext('2d'),layer,(g)=>g.drawImage(source,0,0),72,50,finish);
            return pixels(c);
          }
          async function awaitExact(next,descriptor) {
            layer.effects=next;
            const expected=pixels(fx.processEffects(source,next));
            let resolveReady=()=>{};
            const ready=new Promise(resolve=>{resolveReady=resolve;});
            finish=()=>resolveReady();
            const intermediate=present();
            // During a drag, displaying the *previous completed effect* is
            // allowed. Displaying any invented shadow/glitch is NOT.
            if(last && !equal(intermediate,last)) throw Error('Inaccurate intermediate frame for '+descriptor);
            await Promise.race([
              ready,
              new Promise((_,reject)=>setTimeout(()=>reject(Error('preview timeout for '+descriptor)),25000)),
            ]);
            const output=present();
            if(!equal(output,expected)) throw Error('Preview/export mismatch at '+descriptor);
            last=output;
            reports.push(descriptor);
          }
          let last=null;
          await awaitExact(base,'baseline VHS → Glow → Brightness');
          for(const value of [0,25,50,87,100,125,150,200]) {
            const next=[base[0],base[1],{...base[2],amount:value}];
            await awaitExact(next,`Brightness ${value} within effects stack`);
          }
          for(const value of [5,40,87]) {
            const miasma=fx.newEffect('miasma',value);
            await awaitExact([base[0],base[1],miasma],`Miasma ${value} within effects stack`);
          }
          for(const value of [0,50,100]) {
            await awaitExact([base[0],{...base[1],amount:value},base[2]],`Glow ${value} within effects stack`);
          }
          // This is a complete five-stage stack, formerly a GPU draft cutoff.
          const five=[base[0],base[1],fx.newEffect('shadow',45),fx.newEffect('miasma',65),base[2]];
          await awaitExact(five,'five unique effects in correct order');
          if(requests.length < 14)throw Error('Did not submit each changed effect state');
          // Real slider movement is faster than the worker. Force completion
          // deliberately out of order and assert no old image can win.
          fx.forgetLayerEffectPreview(layer.id);
          let resolved=0;
          let pendingCount=0;
          fx.setAsyncEffectsProcessor((original,effects,id,done)=>{
            const delay=effects[effects.length-1].amount===35 ? 5 : 75;
            pendingCount++;
            setTimeout(async()=>{
              const image=fx.processEffects(original,effects);
              done(await createImageBitmap(image));
            },delay);
            return true;
          });
          finish=()=>{ resolved++; };
          for (const amount of [40,120,175,35]) {
            layer.effects=[base[0],base[1],{...base[2],amount}];
            present();
          }
          await new Promise(resolve=>setTimeout(resolve,350));
          const expectedNewest=pixels(fx.processEffects(source,layer.effects));
          if(!equal(present(),expectedNewest))throw Error('Older worker result overwrote latest value');
          if(resolved!==1)throw Error('Outdated worker response triggered redraw: '+resolved);
          reports.push('Out-of-order worker jobs cannot overwrite the newest slider value');
          if(pendingCount!==4)throw Error('Not all worker updates were submitted');
          fx.forgetLayerEffectPreview(layer.id);
          fx.setInteractiveEffectPreview(false);
          fx.setAsyncEffectsProcessor(null);
          return {checks:reports.length,reports,workerRequests:requests.length};
        }''')
        print(json.dumps(results))
    finally:
        browser.close()
