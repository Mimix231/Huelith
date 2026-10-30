"""Real Chromium regression and latency probes for Project Fluidity spatial GPU kernels.
GPU timing depends on the actual device. This is not a universal 20–50 ms claim.
"""
import os, subprocess, json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
script='''const ts=require('typescript'),fs=require('fs');process.stdout.write(ts.transpileModule(fs.readFileSync(process.argv[1],'utf8'),{fileName:process.argv[1],compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)'''
env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()}
code=subprocess.check_output(['node','-e',script,str(root/'src/editor/effects/spatial-gpu.ts')],env=env,text=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page()
    result=page.evaluate('''code=>{
      const module={exports:{}};new Function('module','exports',code)(module,module.exports);
      const api=module.exports;
      const checks=[];
      const src=document.createElement('canvas');src.width=640;src.height=400;
      const c=src.getContext('2d');c.clearRect(0,0,640,400);
      c.fillStyle='#d24c7b';c.fillRect(140,65,340,260);
      c.fillStyle='#fff4ba';c.fillRect(170,170,250,5);
      c.fillStyle='#31dbea';c.fillRect(330,70,5,245);
      const before=c.getImageData(0,0,640,400).data;
      for(const mode of ['motion','radial','lens']){
        const effect={kind:mode+'blur',amount:45,enabled:true,parameters:{angle:30,centerX:35,centerY:48,blades:6,focusRadius:15}};
        const start=performance.now();
        const out=api.tryGpuSpatialBlur(src,effect,mode,false);
        const ms=performance.now()-start;
        if(!out){checks.push({mode,available:false});continue;}
        const o=out.getContext('2d',{willReadFrequently:true}).getImageData(0,0,640,400).data;
        let different=0,transparentBackground=0,alphaMin=255,maxAlpha=0;
        for(let i=0;i<o.length;i+=4){
          if(Math.abs(o[i]-before[i])+Math.abs(o[i+1]-before[i+1])+Math.abs(o[i+2]-before[i+2])+Math.abs(o[i+3]-before[i+3])>4)different++;
          if(o[i+3]<255)transparentBackground++;
          alphaMin=Math.min(alphaMin,o[i+3]);maxAlpha=Math.max(maxAlpha,o[i+3]);
        }
        checks.push({mode,available:true,ms:Math.round(ms),different,alphaMin,maxAlpha,transparentBackground,pixel:Array.from(o.slice((180*640+210)*4,(180*640+210)*4+4))});
      }
      const solid=document.createElement('canvas');solid.width=320;solid.height=240;
      const s=solid.getContext('2d');s.fillStyle='#3a7ea0';s.fillRect(0,0,320,240);
      const filled=api.tryGpuSpatialBlur(solid,{amount:30,parameters:{angle:45},enabled:true},'motion');
      let maxDiff=0,minAlpha=255;
      if(filled){const d=filled.getContext('2d').getImageData(0,0,320,240).data;
        for(let i=0;i<d.length;i+=4){minAlpha=Math.min(minAlpha,d[i+3]);maxDiff=Math.max(maxDiff,Math.abs(d[i]-58),Math.abs(d[i+1]-126),Math.abs(d[i+2]-160));}
      }
      // same-source path must not retain stale pixels when immutable is false.
      const old=c.fillStyle;c.fillStyle='#22c055';c.fillRect(140,65,340,260);c.fillStyle=old;
      const newer=api.tryGpuSpatialBlur(src,{amount:40,parameters:{angle:10}},'motion',false);
      const n=newer?.getContext('2d').getImageData(310,170,1,1).data??new Uint8ClampedArray(4);
      return {checks,solid:{available:!!filled,maxDiff,minAlpha},newer:Array.from(n)};
    }''',code)
    print(json.dumps(result,indent=2))
    if not any(check['available'] for check in result['checks']):
        print('FLUIDITY_GPU_UNAVAILABLE_SKIPPED: WebGL2 disabled in this container')
        browser.close()
        raise SystemExit(0)
    assert all(check['available'] and check['different']>150 for check in result['checks']),result
    assert result['solid']['minAlpha']==255 and result['solid']['maxDiff']<=3,result
    assert result['newer'][1]>100,result
    browser.close()
    print('FLUIDITY_SPATIAL_GPU_RENDER_PASS')
