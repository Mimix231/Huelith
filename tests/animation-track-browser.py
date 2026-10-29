"""Pixel-level parity test: animation frames use the SAME effects in editor & export."""
from playwright.sync_api import sync_playwright
import os,sys
with sync_playwright() as p:
    args={'headless':True,'args':['--no-sandbox']}
    if os.path.exists('/usr/bin/chromium'):args['executable_path']='/usr/bin/chromium'
    browser=p.chromium.launch(**args)
    try:
        page=browser.new_page()
        page.goto('about:blank')
        page.add_script_tag(content=sys.stdin.read())
        results=page.evaluate('''() => {
          const e=window.AnimationTrackTest;
          const checks=[];
          const check=(name,condition)=>{if(!condition)throw new Error('Animation track FX: '+name);checks.push(name)};
          const doc=e.createDocument('Clip',80,50,'transparent');
          const ink=e.makeVector('Ink');
          const firstShape={id:e.uid(),kind:'rect',x:4,y:13,width:24,height:25,
            fill:'#554466',stroke:'none',strokeWidth:0};
          ink.shapes=[firstShape];
          doc.layers=[ink];doc.activeLayerId=ink.id;
          e.enableAnimation(doc,12);
          for(let i=1;i<6;i++){
            e.insertFrame(doc,false);
            doc.layers[0].shapes=[{...firstShape,id:e.uid(),x:4+7*i}];
            e.syncActiveCel(doc);
          }
          const stacks=[e.newEffect('brightness',160),e.newEffect('outline',3),e.newEffect('glow',8)];
          e.setTrackEffects(doc,ink.id,stacks);
          const frames=doc.animation.frames;
          const original=frames.map(frame=>JSON.stringify(frame.layers[0].shapes));
          const render=(d)=>{
            const canvas=document.createElement('canvas');canvas.width=d.width;canvas.height=d.height;
            e.drawDocument(canvas.getContext('2d'),d);
            return [...canvas.getContext('2d').getImageData(0,0,d.width,d.height).data];
          };
          const different=(a,b)=>a.reduce((count,value,index)=>count+(value!==b[index]?1:0),0);
          const on=[];
          for(let i=0;i<6;i++){
            const result=e.frameDocument(doc,i);
            check('frame '+i+' has all three FX',result.layers[0].effects.map(fx=>fx.id).join('|')===stacks.map(fx=>fx.id).join('|'));
            on.push(render(result));
          }
          check('frames still contain different drawings',different(on[0],on[1])>0);
          check('rendering previews did not edit any frame artwork',frames.every((frame,i)=>JSON.stringify(frame.layers[0].shapes)===original[i]));
          const sample=e.frameDocument(doc,3),canvas=e.exportCanvas(sample);
          const exported=[...canvas.getContext('2d').getImageData(0,0,80,50).data];
          check('frame three preview/export pixels identical',different(on[3],exported)===0);
          // Clear FX once at the track level, never by mutating all frame cel copies.
          e.setTrackEffects(doc,ink.id,[]);
          for(let i=0;i<6;i++)check('frame '+i+' cleared',e.frameDocument(doc,i).layers[0].effects.length===0);
          check('removed effects no longer rendered',different(render(e.frameDocument(doc,3)),on[3])>0);
          check('track map persists in serialized JSON',JSON.parse(JSON.stringify(doc)).animation.trackEffects[ink.id].length===0);
          // Exposures are resolved by the authoritative frame compositor, not
          // by duplicating the source drawing or stripping layer effects.
          const exposure=e.createDocument('Held',80,50,'transparent');
          const layer=e.makeVector('Hold Ink'), first={id:e.uid(),kind:'rect',x:5,y:10,width:24,height:22,fill:'#ca2b7e',stroke:'none',strokeWidth:0};
          layer.shapes=[first];exposure.layers=[layer];exposure.activeLayerId=layer.id;
          e.enableAnimation(exposure,12);e.insertFrame(exposure,false);
          check('holding vector cel succeeds',e.holdLayer(exposure,1,layer.id));
          check('held cel saves no duplicate vector paths',exposure.animation.frames[1].layers[0].shapes.length===0);
          const originalHold=render(e.frameDocument(exposure,1));
          check('held frame exports identical pixels to master',different(render(e.frameDocument(exposure,0)),originalHold)===0);
          e.selectFrame(exposure,0);
          exposure.layers[0].shapes[0].fill='#58e8c2';e.syncActiveCel(exposure);
          check('held frame follows updated source pixels',different(render(e.frameDocument(exposure,1)),originalHold)>0);
          check('held project remains serializable',e.isDocument(JSON.parse(JSON.stringify(exposure))));
          return checks;
        }''')
        print(f'Phase AI browser: {len(results)} pixel/track checks passed.')
        for result in results: print('  PASS',result)
    finally:
        browser.close()
