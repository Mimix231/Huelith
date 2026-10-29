"""AM Order 1 Chromium Canvas2D regression: true hard-edge sunburst output and preview parity.
No gradient mocks: compiles the application's real TS gradient sampler and draws native canvases.
"""
from pathlib import Path
from subprocess import check_output
import base64,shutil
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
compile_js="""const ts=require('typescript'),fs=require('fs');
const file=process.argv[1];process.stdout.write(ts.transpileModule(fs.readFileSync(file,'utf8'),
{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);"""
scripts={name:check_output(['node','-e',compile_js,str(root/'src/editor'/f'{name}.ts')],text=True)
         for name in ['gradient-transforms','gradient-patterns','gradient']}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or '/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page()
    result=page.evaluate('''scripts=>{
      const cache={};const load=id=>{const name=id.replace(/^\\.\\//,'');if(cache[name])return cache[name];
        const mod={exports:{}};cache[name]=mod.exports;
        new Function('module','exports','require',scripts[name])(mod,mod.exports,load);return cache[name]=mod.exports;};
      const {gradientShapeCanvas,paintGradientPreview,gradientSample}=load('gradient');
      const stops=[{id:'black',color:'#000000',position:0,opacity:1},{id:'white',color:'#ffffff',position:1,opacity:1}];
      const base={id:'burst',kind:'gradient',x:0,y:0,width:740,height:740,stroke:'none',fill:'none',strokeWidth:0,
        gradientMode:'linear',gradientPattern:'sunburst',gradientColorMode:'alternating',gradientRayCount:24,
        gradientRayWidth:.5,gradientRaySoftness:0,gradientTwist:0,gradientRotation:0,gradientCenterX:.5,gradientCenterY:.5,gradientStops:stops};
      const native=gradientShapeCanvas(base),data=native.getContext('2d').getImageData(0,0,740,740).data;
      const preview=document.createElement('canvas');preview.width=370;preview.height=370;
      paintGradientPreview(preview.getContext('2d'),base,370,370);
      const prev=preview.getContext('2d').getImageData(0,0,370,370).data;
      let black=0,white=0,middle=0;
      for(let i=0;i<data.length;i+=4){const v=data[i];if(v===0)black++;else if(v===255)white++;else middle++;
         if(data[i]!==data[i+1]||data[i]!==data[i+2]||data[i+3]!==255)throw Error('Incorrect channel/alpha at '+i);}
      let checked=0,match=0;
      for(let y=10;y<360;y+=11)for(let x=10;x<360;x+=11){
        const px=prev[(y*370+x)*4],nk=data[((y*2)*740+(x*2))*4];
        checked++;if(px===nk)match++;}
      const changed=gradientShapeCanvas({...base,gradientRayCount:16});
      const diff=changed.getContext('2d').getImageData(0,0,740,740).data;
      let differences=0;for(let i=0;i<data.length;i+=4)if(data[i]!==diff[i])differences++;
      const clip=gradientShapeCanvas({...base,gradientColorMode:'pattern',gradientStops:[...stops,{id:'purple',position:.75,color:'#ff00ff',opacity:1}]});
      return {size:[native.width,native.height],black,white,middle,checked,match,differences,
        hasThreeColorPalette:clip.getContext('2d').getImageData(0,0,740,740).data.some((v,i,arr)=>i%4===0&&v===255&&arr[i+1]===0&&arr[i+2]===255),
        image:native.toDataURL('image/png')};
    }''',scripts)
    assert result['size']==[740,740]
    assert result['black']>160000 and result['white']>160000
    assert result['middle']==0, 'hard ray interiors must not be interpolated'
    assert result['match']/result['checked']>.90, 'native and scaled preview sampling diverged unexpectedly'
    assert result['differences']>120000, 'ray count did not change enough pixels'
    assert result['hasThreeColorPalette']
    # Store a reproducible visual proof of actual application's pixel output.
    path=root/'docs'/'HUELITH_AM1_RADIAL_REFERENCE.png'
    path.write_bytes(base64.b64decode(result['image'].split(',',1)[1]))
    print('Chromium AM1: 740x740 native black/white pattern with',result['black'],'black pixels,',result['white'],'white pixels')
    print('Preview parity:',result['match'],'/',result['checked'],'; ray-count changes:',result['differences'])
    print('Full-resolution output + multi-color palette: PASS')
    browser.close()
