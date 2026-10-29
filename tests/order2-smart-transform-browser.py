"""AM Order 2: Native Canvas2D tests for every previously inert procedural
transformation on an existing Sunburst Gradient layer. Preview and committed
full-size rendering must use the same math; tests sample real pixels."""
from pathlib import Path
from subprocess import check_output
from playwright.sync_api import sync_playwright
import shutil,json
root=Path(__file__).resolve().parent.parent
compile_js="""const ts=require('typescript'),fs=require('fs');const file=process.argv[1];process.stdout.write(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);"""
scripts={name:check_output(['node','-e',compile_js,str(root/'src/editor'/f'{name}.ts')],text=True)
         for name in ['gradient-transforms','gradient-patterns','gradient']}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or '/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page()
    results=page.evaluate('''scripts=>{
      const cache={};const load=id=>{const name=id.replace(/^\\.\\//,'');if(cache[name])return cache[name];
        const m={exports:{}};cache[name]=m.exports;new Function('module','exports','require',scripts[name])(m,m.exports,load);return cache[name]=m.exports;};
      const {gradientShapeCanvas,paintGradientPreview}=load('gradient');
      const stops=[{id:'a',color:'#080808',position:0,opacity:1},{id:'b',color:'#eeeeee',position:1,opacity:1}];
      const shape={id:'layer',kind:'gradient',x:0,y:0,width:224,height:160,gradientMode:'linear',
        gradientPattern:'sunburst',gradientColorMode:'alternating',gradientBandCount:8,
        gradientRayCount:18,gradientRayWidth:.5,gradientRaySoftness:0,gradientStops:stops};
      const original=gradientShapeCanvas(shape);
      const ref=original.getContext('2d').getImageData(0,0,224,160).data;
      const transforms=['diamondGrid','checkerWaves','hexFlow','interference','perspectiveBands','starburst','speedRays','pinwheel','solarRings'];
      const comparisons={};
      for(const kind of transforms){
        const step={id:kind,kind,enabled:true,amount:100,frequency:2,count:11,phase:14,seed:17,centerX:.5,centerY:.5};
        const configured={...shape,gradientTransformStack:[step]};
        const native=gradientShapeCanvas(configured);
        const pixels=native.getContext('2d').getImageData(0,0,native.width,native.height).data;
        let changed=0,opaque=0;
        for(let i=0;i<pixels.length;i+=4){if(Math.abs(pixels[i]-ref[i])>25)changed++;if(pixels[i+3]===255)opaque++;}
        const preview=document.createElement('canvas');preview.width=224;preview.height=160;
        paintGradientPreview(preview.getContext('2d'),configured,224,160);
        const pp=preview.getContext('2d').getImageData(0,0,224,160).data;
        let same=0,total=0;
        for(let y=5;y<150;y+=7)for(let x=5;x<210;x+=7){total++;
          const small=pp[(y*224+x)*4],large=pixels[(y*224+x)*4];
          if(Math.abs(small-large)<4)same++;}
        comparisons[kind]={changed,opaque,parity:same/total};
      }
      const ramp={...shape,gradientPattern:'smooth',gradientColorMode:'bands'};
      const bandsA=gradientShapeCanvas({...ramp,gradientBandCount:3});
      const bandsB=gradientShapeCanvas({...ramp,gradientBandCount:19});
      const a=bandsA.getContext('2d').getImageData(0,0,224,160).data;
      const b=bandsB.getContext('2d').getImageData(0,0,224,160).data;
      let bandDiff=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i])bandDiff++;
      return{comparisons,bandDiff};
    }''',scripts)
    print('ORDER2_CHROMIUM_PIXELS',json.dumps(results))
    for name,check in results['comparisons'].items():
        assert check['changed']>1900, f'{name}: no meaningful transformed pixels'
        assert check['opaque']==224*160, f'{name}: alpha lost'
        assert check['parity']>.93, f'{name}: preview/native mismatch'
    assert results['bandDiff']>2000,'Color bands remains an inert control'
    print('AM_ORDER2_TRANSFORM_PIXELS_PASS: nine transforms + band slider + native preview parity')
    browser.close()
