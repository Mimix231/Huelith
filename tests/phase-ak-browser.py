"""Optional real Chromium Canvas2D coverage for native-resolution Phase AK gradients.
Run: python tests/phase-ak-browser.py (requires Python Playwright and Chromium).
"""
from pathlib import Path
from subprocess import check_output
from playwright.sync_api import sync_playwright
import shutil
root=Path(__file__).resolve().parent.parent
script="""const ts=require('typescript'),fs=require('fs');
const filename=process.argv[1];
process.stdout.write(ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);"""
compiled={}
for key in ['gradient-transforms','gradient']:
    compiled[key]=check_output(['node','-e',script,str(root/'src/editor'/f'{key}.ts')],text=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path=shutil.which('chromium') or '/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page()
    result=page.evaluate('''modules => {
      const cache={};
      const get=name=>{
        name=name.replace(/^\\.\\//,''); if(cache[name])return cache[name];
        const module={exports:{}};cache[name]=module.exports;
        new Function('exports','module','require',modules[name])(module.exports,module,id=>get(id));
        cache[name]=module.exports;return module.exports;
      };
      const grad=get('gradient'),trans=get('gradient-transforms');
      const base={kind:'gradient',width:300,height:200,id:'canvas',x:0,y:0,fill:'none',stroke:'none',strokeWidth:0,
        gradientMode:'linear',gradientStartX:.14,gradientStartY:.12,gradientEndX:.86,gradientEndY:.84,
        gradientStops:[{id:'start',position:0,color:'#5d20ff',opacity:1},{id:'end',position:1,color:'#ffcb30',opacity:1}]};
      const metrics={};for(const def of trans.GRADIENT_TRANSFORMS){
        const canvas=grad.gradientShapeCanvas({...base,gradientTransform:def.id,gradientTransformCount:17});
        if(!canvas || canvas.width!==300 || canvas.height!==200)throw new Error(def.id+' did not render at exact target size');
        const pixels=canvas.getContext('2d').getImageData(0,0,300,200).data;
        let hash=0,nonzero=0;
        for(let i=0;i<pixels.length;i+=4){
          hash=(hash+(pixels[i]*7+pixels[i+1]*11+pixels[i+2]*13)*(1+((i/4)%357)))%2147483647;
          if(pixels[i+3]) nonzero++;
        }
        metrics[def.id]={hash,nonzero};
      }
      return metrics;
    }''',compiled)
    print('Chromium gradient Canvas2D tested:',len(result),'transform modes')
    assert len(result) >= 25
    assert all(item['nonzero'] == 300*200 for item in result.values())
    assert len(set(item['hash'] for item in result.values())) >= 22, 'Transforms yielded unexpectedly identical pixel results'
    print('Native-size pixel outputs, transparency, and procedural distinctions: PASS')
    browser.close()
