import json,sys
from playwright.sync_api import sync_playwright
source=sys.stdin.read()
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page()
 page.add_script_tag(content=source)
 result=page.evaluate('''()=>{
  const {applyEffect,gradientShapeCanvas}=window.Huelith4;
  const make=()=>{const canvas=document.createElement('canvas');canvas.width=180;canvas.height=108;let p=canvas.getContext('2d');let g=p.createLinearGradient(0,0,180,108);g.addColorStop(0,'#101020');g.addColorStop(.5,'#a36959');g.addColorStop(1,'#eeef82');p.fillStyle=g;p.fillRect(0,0,180,108);p.fillStyle='#ff165d';p.fillRect(23,14,31,68);p.fillStyle='#27e4b8';p.beginPath();p.arc(133,65,28,0,Math.PI*2);p.fill();return canvas;};
  const src=make(), bytes=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
  const original=bytes(src), diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4) for(let ch=0;ch<3;ch++)n+=Math.abs(a[i+ch]-b[i+ch]);return n};
  const report={}, effects=[['brightness',0,100,200],['contrast',0,100,200],['exposure',-100,0,100],['vibrance',-100,0,100],['selective',0,50,100],['curves',0,50,100],['levels',0,50,100],['surfaceblur',0,6,14],['clarity',-80,0,80],['texture',-80,0,80],['unsharp',0,60,120],['sharpen',0,60,120],['zoomblur',0,20,50],['neonedge',0,45,95],['glow',0,25,65],['outline',0,10,35],['miasma',0,40,80],['radiance',0,40,80],['sig_15',0,40,80],['sig_16',0,40,80]];
  for(const [kind,a,b,c] of effects){
    const makeEffect=amount=>({id:kind,kind,enabled:true,amount,color:'#ac50ff',parameters:{threshold:25,glowRadius:4,range:65,
      curvePoints:[{x:0,y:0},{x:.25,y:.1},{x:.75,y:.9},{x:1,y:1}],
      inputBlack:10,inputWhite:235,gammaMid:1.35,outlineStyle:'neon',radius:12,seed:17}});
    const result=[a,b,c].map(amount=>bytes(applyEffect(src,makeEffect(amount))));
    report[kind]={lowestToMiddle:diff(result[0],result[1]),middleToHighest:diff(result[1],result[2]),vsSource:diff(result[1],original)};
  }
  if(report.selective.lowestToMiddle===0 || report.selective.vsSource===0) throw new Error('Selective color amount was not functional');
  const selectiveZero=bytes(applyEffect(src,{id:'selective',kind:'selective',enabled:true,amount:0,parameters:{targetHue:0}}));
  if(diff(original,selectiveZero)!==0)throw new Error('Selective at zero must not alter source pixels');
  if(report.clarity.middleToHighest===0 || report.texture.middleToHighest===0)throw new Error('Detail amount failed');
  const groups={};for(const pattern of ['smooth','sunburst','speedlines']){
    let shape={id:'gradient',kind:'gradient',fill:'none',stroke:'none',strokeWidth:0,x:0,y:0,width:480,height:280,gradientMode:'radial',gradientPattern:pattern,gradientRayCount:pattern==='sunburst'?14:110,
      gradientRayWidth:.42,gradientTwist:pattern==='sunburst'?0:.5,
      gradientStops:[{id:'one',position:0,color:'#fff1b4',opacity:1},{id:'two',position:1,color:'#ff9300',opacity:1}]};
    const cv=gradientShapeCanvas(shape);const d=bytes(cv);let colorCount=new Set();for(let i=0;i<d.length;i+=28)colorCount.add(`${d[i]},${d[i+1]},${d[i+2]}`);
    groups[pattern]={colorCount:colorCount.size,midPixel:[...d.slice((140*480+240)*4,(140*480+240)*4+4)]};
  }
  if(groups.sunburst.colorCount<2 || groups.speedlines.colorCount<2)throw new Error('Pattern color range lost');
  return {effects:report,patterns:groups};
 }''')
 b.close()
 failures=[]
 for kind,item in result['effects'].items():
  if item['lowestToMiddle']==0 and item['middleToHighest']==0: failures.append(kind)
 print(json.dumps({'checkedKinds':len(result['effects']),'unresponsive':failures,'patterns':result['patterns'],'selectiveZeroVerified':True},separators=(',',':')))
 if failures:raise SystemExit(1)
