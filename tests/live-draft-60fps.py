"""Native-size interaction draft tests with a deliberately GPU-less Chromium."""
from playwright.sync_api import sync_playwright
import sys,json,os
src=sys.stdin.read()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page()
    page.goto('about:blank')
    report=page.evaluate('''src => {
      const module={exports:{}};
      new Function('module','exports','require',src)(module,module.exports,()=>({}));
      const {gpuPreviewSupport,paintGpuEffectDraft,paintCanvasEffectDraft}=module.exports;
      const source=document.createElement('canvas');source.width=960;source.height=540;
      const c=source.getContext('2d');
      c.fillStyle='#e5a644';c.fillRect(0,0,960,540);
      c.fillStyle='#14559d';c.fillRect(100,100,250,300);
      c.fillStyle='#ff0000';c.fillRect(500,120,100,300);
      const output=document.createElement('canvas');output.width=960;output.height=540;
      const ctx=output.getContext('2d');
      const sets=[
        ['glow',0,100],['blur',0,60],['chromatic',0,70],['glitch',0,100],
        ['posterize',2,32],['vignette',0,100],['sig_0',0,100],
        ['sig_1',0,100],['sig_2',0,100],['sig_3',0,100],['sig_4',0,100],
        ['sig_5',0,100],['sig_6',0,100],['sig_7',0,100],['sig_8',0,100],
        ['sig_9',0,100],['sig_10',0,100],['sig_11',0,100],['sig_12',0,100],
        ['sig_13',0,100],['sig_14',0,100],
      ];
      let totalMs=0;let screenshots=0;
      const rows=[];
      for(const [kind,lo,hi] of sets){
        const make=amount=>[{id:'a',kind,amount,enabled:true,color:'#ae41ff',parameters:{shiftY:8,colorMix:80,seed:9}}];
        if(!gpuPreviewSupport(make(hi)))throw Error('Missing GPU draft mapping: '+kind);
        const imgs=[];
        let time=0;
        for (const amount of [lo,Math.round((lo+hi)/2),hi]) {
          ctx.clearRect(0,0,960,540);
          const start=performance.now();
          if (!(paintGpuEffectDraft(ctx,source,make(amount),960,540) || paintCanvasEffectDraft(ctx,source,make(amount),960,540))) throw Error('No live draft for '+kind);
          time+=performance.now()-start;
          const pix=ctx.getImageData(0,0,960,540).data;
          // Sample 128 scattered points instead of testing only one pixel.
          let hash=0;
          for(let i=0;i<128;i++){
            const pos=(((i*12791)%540)*960+(i*12371)%960)*4;
            hash=(hash*33+(pix[pos]^pix[pos+1]^pix[pos+2]^pix[pos+3]))|0;
          }
          imgs.push(hash);
        }
        const unique=new Set(imgs).size;
        rows.push({kind,unique,millis:+time.toFixed(2)});
        totalMs+=time;
      }
      const fx=[{id:'a',kind:'sig_4',amount:50,enabled:true}];
      const start=performance.now();
      for (let i=0;i<60;i++){
        ctx.clearRect(0,0,960,540);
        const effects=[{...fx[0],amount:i*100/59}];
        if(!(paintGpuEffectDraft(ctx,source,effects,960,540)||paintCanvasEffectDraft(ctx,source,effects,960,540)))throw Error('frame lost');
        // Force the native Canvas implementation to flush its deferred paint.
        const sample=ctx.getImageData(250,190,1,1).data;
        if(sample[3]===0) throw Error('Unexpected transparent preview frame');
      }
      const sixty=performance.now()-start;
      return {gpu:!!document.createElement('canvas').getContext('webgl2'), rows, frame60: +sixty.toFixed(2),averageFrameMs:+(sixty/60).toFixed(2),totalMs:+totalMs.toFixed(2)};
    }''',src)
    print(json.dumps(report))
    browser.close()
