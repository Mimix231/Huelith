"""Check the real Cutout line overlay, drawing four visible editable handles
at stable apparent sizes across zoom settings in Chromium Canvas2D."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,os,json
root=Path(__file__).resolve().parent.parent
script="""const ts=require('typescript'),fs=require('fs');const file=process.argv[1];process.stdout.write(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)"""
source=subprocess.check_output(['node','-e',script,str(root/'src/editor/cutout-edit.ts')],text=True,env={**os.environ,'NODE_PATH':subprocess.check_output(['npm','root','-g'],text=True).strip()})
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page()
  result=page.evaluate('''source=>{
    const m={exports:{}};new Function('module','exports','require',source)(m,m.exports,()=>({}));
    const geom=m.exports;
    const line={id:'new-line',tool:'line',operation:'keep',size:4,points:[{x:25,y:90},{x:60,y:20},{x:120,y:155},{x:190,y:90}]};
    const samples=[];
    for(const zoom of [.25,1,4]){
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=185;
      const ctx=canvas.getContext('2d');geom.drawCutoutEditHandles(ctx,line,1,1,zoom,2);
      const samplesAt=line.points.map(p=>[...ctx.getImageData(p.x,p.y,1,1).data]);
      const grips=geom.cutoutHandles(line);
      const moved=geom.resizeCutout(line,2,{x:130,y:45});
      samples.push({zoom,gripCount:grips.length,colors:samplesAt,updated:moved.points[2],unchanged:line.points[2]});
    }
    return samples;
  }''',source)
  for sample in result:
    assert sample['gripCount']==4,sample
    assert all(px[3]>=200 for px in sample['colors']),sample
    assert sample['updated']=={'x':130,'y':45},sample
    assert sample['unchanged']=={'x':120,'y':155},sample
  print('HUELITH_CUTOUT_FOUR_EDITABLE_HANDLES_PASS',json.dumps(result))
  browser.close()
