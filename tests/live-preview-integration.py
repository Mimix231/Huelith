"""Real Canvas2D/browser contract; GPU path requires a machine exposing WebGL2."""
import json, sys
from playwright.sync_api import sync_playwright
script=sys.stdin.read()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    try:
        page=browser.new_page()
        page.goto('about:blank')
        page.add_script_tag(content=script)
        result=page.evaluate(r'''async () => {
          const E=window.PreviewContract, outcomes=[];
          const check=(name,truth)=>{if(!truth) throw Error(name);outcomes.push(name)};
          const create=(w=96,h=72)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
          const source=create(),sc=source.getContext('2d');
          sc.fillStyle='#da271f';sc.fillRect(22,11,16,27);
          sc.fillStyle='#2685e1';sc.fillRect(56,48,12,13);
          const pix=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
          for(const kind of ['glow','sig_0','sig_2','vhs','oilpaint','watercolor']){
            const output=create(),target=output.getContext('2d');
            const effect={id:'f',kind,enabled:true,amount:60,color:'#a134ec',
              parameters:{brushSize:4,texture:45,shiftY:8,seed:9,colorMix:70}};
            check('Canvas2D '+kind+' provides a live draft',E.paintCanvasEffectDraft(target,source,[effect],96,72));
            check(kind+' keeps the upper red subject in its original coordinates',pix(output,29,23)[3]>=160);
            check(kind+' keeps the lower blue subject in its original coordinates',pix(output,62,54)[3]>=160);
            if (['glow','sig_0','sig_2'].includes(kind)) {
              const upper=pix(output,29,23), lower=pix(output,62,54);
              check(kind+' preserves source object RGB (no brightened duplicate)',
                upper[0]===218 && upper[1]===39 && upper[2]===31 &&
                lower[0]===38 && lower[1]===133 && lower[2]===225);
            }
          }
          // This formerly submitted duplicate jobs *during each canvas paint*,
          // and visible worker completions alternated with provisional drafts.
          const effect={id:'fx',kind:'sig_2',enabled:true,amount:40,color:'#231143',parameters:{radius:25}};
          const shape={id:'rect',kind:'rect',x:22,y:11,width:16,height:27,fill:'#da271f',stroke:'none',strokeWidth:0};
          const layer={id:'live-test',name:'Test',type:'vector',visible:true,locked:false,
            opacity:1,blend:'source-over',x:0,y:0,shapes:[shape],effects:[effect]};
          let calls=0;
          E.setAsyncEffectsProcessor(()=>{calls++;return true});
          E.setInteractiveEffectPreview(true,layer.id);
          E.setLiveEffectDragging(layer.id);
          for(let n=0;n<6;n++){
            layer.effects=[{...effect,amount:10+n*11}];
            const frame=create();
            E.renderLayer(frame.getContext('2d'),layer,()=>{},96,72);
            check('drag frame '+n+' retains subject',pix(frame,29,23)[3]>=160);
          }
          check('while dragging, worker receives no obsolete CPU jobs',calls===0);
          E.setLiveEffectDragging(null);
          for(let n=0;n<5;n++)E.renderLayer(create().getContext('2d'),layer,()=>{},96,72);
          check('settled effect queued exactly once despite repeated canvas paints',calls===1);
          E.forgetLayerEffectPreview(layer.id);
          E.setInteractiveEffectPreview(false);
          E.setAsyncEffectsProcessor(null);
          // Compare actual canonical color-engine outputs at every exact node
          // of a small 3D LUT, including advanced curve / selective settings.
          const inputs=[
            ['exposure',75,{protect:20}],
            ['curves',65,{curvePoints:[{x:0,y:0},{x:.5,y:.3},{x:1,y:1}]}],
            ['gradientmap',85,{}],
            ['temperature',50,{protect:10}],
            ['vibrance',60,{protect:35}],
          ];
          for(const [kind,amount,parameters] of inputs){
            const fx={id:'c',kind,enabled:true,amount,parameters};
            const size=7,lut=E.buildColorLut(fx,size);
            const palette=create(size,size*size),ctx=palette.getContext('2d');
            const image=ctx.createImageData(size,size*size);
            for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){
              const j=((b*size+g)*size+r)*4;
              image.data[j]=Math.round(r*255/(size-1));image.data[j+1]=Math.round(g*255/(size-1));
              image.data[j+2]=Math.round(b*255/(size-1));image.data[j+3]=255;
            }
            ctx.putImageData(image,0,0);
            const exact=E.applyEffect(palette,fx).getContext('2d').getImageData(0,0,size,size*size).data;
            let matches=true;
            for(let j=0;j<lut.length;j++)if(lut[j]!==exact[j]){matches=false;break}
            check(kind+' GPU lookup lattice uses exact export processor',matches);
          }
          // Report *measured CPU LUT construction*, not an invented 60 FPS claim.
          // GPU shader paint time remains Windows-hardware-dependent.
          const t0=performance.now();
          for(let i=0;i<24;i++) E.buildColorLut({id:'color',kind:'curves',enabled:true,
            amount:i*4,parameters:{curvePoints:[{x:0,y:0},{x:.5,y:.35},{x:1,y:1}]}},19);
          const lutMs=(performance.now()-t0)/24;
          check('color LUTs generate within the test browser time budget',lutMs<250);
          check('source high-frequency artwork dimensions are never scaled',
             E.effectPreviewScale(3840,2160,'live-test',true)===1);
          return {passed:outcomes.length,tests:outcomes,averageCurveLutMs:Number(lutMs.toFixed(2)),
            webgl2:!!document.createElement('canvas').getContext('webgl2')};
        }''')
        print(json.dumps({'result':'passed',**result}))
    finally:
        browser.close()
