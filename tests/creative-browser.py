"""Pixel-tested Spectrum Originals on actual Chromium Canvas2D."""
import os
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    options = {'headless': True, 'args': ['--no-sandbox']}
    if os.path.exists('/usr/bin/chromium'):
        options['executable_path'] = '/usr/bin/chromium'
    browser = p.chromium.launch(**options)
    try:
        page = browser.new_page()
        page.goto('about:blank')
        page.add_script_tag(content=sys.stdin.read())
        output = page.evaluate('''() => {
          const e = window.Creatives;
          const results = [];
          const expect = (label, success) => {
            if (!success) throw new Error(`Creative rendering failed: ${label}`);
            results.push(label);
          };
          function surface(w=180,h=120) {
            const c=document.createElement('canvas'); c.width=w; c.height=h; return c;
          }
          function pix(c,x,y) { return [...c.getContext('2d').getImageData(x,y,1,1).data]; }
          function difference(a,b) {
            const A=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
            const B=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
            let changed=0;
            for (let i=0;i<A.length;i++) if (A[i] !== B[i]) changed++;
            return changed;
          }
          function render(o,frame=0,background='#1c0d3c') {
            const c=surface(),ctx=c.getContext('2d');
            ctx.fillStyle=background;ctx.fillRect(0,0,c.width,c.height);
            e.renderCreative(ctx, { creative:[o], creativeFrame:frame });
            return c;
          }
          const color=e.newCreative('colorSculptor',180,120);
          color.x=90; color.y=60; color.radius=55; color.color='#00ff00'; color.controls.hue=270;
          const purple=render(color,0,'#7700ff');
          expect('Color Sculptor preserves detail while changing a selected hue',pix(purple,90,60)[1]>15 && pix(purple,0,0)[1]===0);
          const atmosphere=e.newCreative('atmosphere',180,120);
          const smokeA=render(atmosphere,0);const smokeB=render(atmosphere,10);
          expect('Atmosphere deterministic and animated', difference(smokeA,smokeB)>20 && difference(smokeA,render(atmosphere,0))===0);
          const atmospheres=[0,1,2,3,4,5,6].map(mode=>{
            const sample={...atmosphere,controls:{...atmosphere.controls,material:mode}};
            return render(sample,4);
          });
          expect('Atmosphere material modes use differentiated algorithms',
            atmospheres.every((sample,index)=>index===0||difference(atmospheres[0],sample)>10));
          const light=e.newCreative('lightSculptor',180,120);
          light.color='#ff0000'; const lit=render(light);
          expect('Light Sculptor localized light changes center more than corners', pix(lit,90,60)[0]>pix(lit,1,1)[0]);
          const material=e.newCreative('materialForge',180,120);
          const faceted=render(material);
          material.controls.material=3;
          expect('Material Forge fabric differs from crystal geometry',difference(faceted,render(material))>50);
          expect('Material Forge supports six visual structures',
            [1,2,3,4,5].every(mode=>difference(faceted,render({...material, controls:{...material.controls, material:mode}}))>30));
          const shock=e.newCreative('shockDesigner',180,120);
          const checker=surface();const cx=checker.getContext('2d');
          for(let y=0;y<120;y+=10)for(let x=0;x<180;x+=10){cx.fillStyle=(x+y)%20===0?'#ff3333':'#2222dd';cx.fillRect(x,y,10,10);}
          const warped=surface();warped.getContext('2d').drawImage(checker,0,0);
          shock.radius=55;shock.intensity=100;shock.controls.distortion=100;
          e.renderCreative(warped.getContext('2d'),{creative:[shock]});
          expect('Shock Designer deforms image coordinates rather than coloring',difference(checker,warped)>50);
          const aberrated=surface(); aberrated.getContext('2d').drawImage(checker,0,0);
          e.renderCreative(aberrated.getContext('2d'),{creative:[{...shock, controls:{...shock.controls,chromatic:20}}]});
          expect('Shock Designer chromatic offset changes the render',difference(warped,aberrated)>20);
          const ink=e.newCreative('livingInk',180,120);
          const drawn=render(ink);ink.controls.reveal=0;
          expect('Living Ink reveal moves from hidden to visible stroke',difference(drawn,render(ink))>30);
          ink.controls.reveal=100; ink.controls.texture=100;
          expect('Living Ink texture affects line geometry',difference(drawn,render(ink))>10);
          const flow=e.newCreative('paletteFlow',180,120);
          const f1=render(flow,0);const f2=render(flow,10);
          expect('Palette Flow evolves reproducibly with keyframe time',difference(f1,f2)>20 && difference(f1,render(flow,0))===0);
          const base=e.createDocument('sample',180,120,'transparent');
          const vector=e.makeVector('vector');vector.shapes=[{id:'s',kind:'rect',x:20,y:22,width:20,height:20,fill:'#ff0000',stroke:'none',strokeWidth:0}];
          base.layers=[vector];base.activeLayerId=vector.id;
          const scene=e.newCreative('sceneCards',180,120,vector.id);scene.controls.depth=100;scene.controls.cameraX=30;
          base.creative=[scene];const card=surface();e.drawDocument(card.getContext('2d'),base);
          expect('Scene Cards parallax moves its linked layer',pix(card,55,30)[0]>200 && pix(card,25,30)[3]===0);
          const motion=e.newCreative('timeSculptor',180,120,vector.id);
          motion.intensity=100;motion.controls.offsetX=50;motion.controls.offsetY=20;
          base.creative=[motion];const moved=surface();e.drawDocument(moved.getContext('2d'),base);
          expect('Time Sculptor transforms linked layer',pix(moved,75,45)[0]>200 && pix(moved,25,30)[3]===0);
          motion.controls.rotation=45;motion.controls.scale=150;
          base.creative=[motion];const rotated=surface();e.drawDocument(rotated.getContext('2d'),base);
          expect('Time Sculptor rotates and scales vector layers',difference(moved,rotated)>30);
          e.enableAnimation(base,12);
          base.creative=[e.newCreative('motionEcho',180,120,vector.id)];
          e.insertFrame(base,true);
          base.layers[0].shapes[0].x=80;
          e.syncActiveCel(base);
          const withEcho=surface();e.drawDocument(withEcho.getContext('2d'),base);
          const withoutEcho=surface();e.drawDocument(withoutEcho.getContext('2d'),{...base,creative:[]});
          expect('Motion Echo samples an earlier actual cel',difference(withEcho,withoutEcho)>5);
          base.creative[0].color='#ff0000';
          const tinted=surface();e.drawDocument(tinted.getContext('2d'),base);
          expect('Motion Echo colors its actual temporal silhouette',difference(withEcho,tinted)>10);
          base.creative[0].color='#67c0ff';
          const exportDoc=e.frameDocument(base,1);
          const exportEcho=surface();e.drawDocument(exportEcho.getContext('2d'),exportDoc);
          expect('Motion Echo also renders in animation export path',difference(withEcho,exportEcho)===0);
          const plain=e.createDocument('no originals',180,120);
          plain.layers=[vector];plain.activeLayerId=vector.id;
          const old=surface();e.drawDocument(old.getContext('2d'),plain);
          const newCanvas=surface();e.drawDocument(newCanvas.getContext('2d'),{...plain,creative:[]});
          expect('Absent originals preserve old document pixels exactly',difference(old,newCanvas)===0);
          return results;
        }''')
        for line in output:
            print('PASS:', line)
        print(f'{len(output)} Chromium pixel tests passed')
    finally:
        browser.close()
