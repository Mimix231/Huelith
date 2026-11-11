async page => {
  const report=await page.evaluate(async()=>{
    const {FILTER_CATALOG}=await import('/src/editor/effect-catalog.ts');
    const {defaultParameters}=await import('/src/editor/effect-schema.ts');
    const {applyEffect}=await import('/src/editor/effect-ops.ts');
    const {applyVideoFrameEffect}=await import('/src/editor/video/frame-effects.ts');
    const w=112,h=80,values=[0,1,5,10,25,50,75,90,100],sheets=[];
    const make=transparent=>{
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!transparent){const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#18234a');g.addColorStop(.5,'#a46280');g.addColorStop(1,'#ecd88a');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
      ctx.fillStyle='#29b1ac';ctx.fillRect(15,12,48,46);ctx.fillStyle='#e98142';ctx.beginPath();ctx.ellipse(70,44,25,22,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.fillText('Huelith',12,70);ctx.fillRect(27,20,6,6);ctx.fillStyle='#101327';ctx.fillRect(42,30,10,14);
      if(transparent){ctx.globalAlpha=.35;ctx.fillStyle='#d062ff';ctx.fillRect(3,3,12,30);ctx.globalAlpha=1;}return canvas;
    };
    const bytes=canvas=>canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
    const difference=(a,b)=>{let sum=0,max=0;for(let i=0;i<a.length;i+=4){
      for(let c=0;c<3;c++){const d=Math.abs(a[i+c]*a[i+3]/255-b[i+c]*b[i+3]/255);sum+=d;max=Math.max(max,d);}const alpha=Math.abs(a[i+3]-b[i+3]);sum+=alpha;max=Math.max(max,alpha);
    }return {mean:sum/a.length,max};};
    const rows=[],errors=[];let videoMax=0,immutable=true;
    const continuousExceptions=new Set(['brightness','contrast','saturate','gamma','posterize','highpass','pixelate','halftone','cutout','outline','glow']);
    for(let start=0;start<FILTER_CATALOG.length;start+=24){
      const group=FILTER_CATALOG.slice(start,start+24),sheet=document.createElement('canvas');sheet.width=108+w*6;sheet.height=26+group.length*(h+21);
      sheet.dataset.effectProgressionSheet=String(start/24);const painter=sheet.getContext('2d');painter.fillStyle='#121624';painter.fillRect(0,0,sheet.width,sheet.height);
      painter.font='12px sans-serif';painter.fillStyle='#e5e7ff';[0,1,5,25,50,100].forEach((v,j)=>painter.fillText(`Amount ${v}`,110+j*w,17));
      for(let row=0;row<group.length;row++){
        const definition=group[row],effect={id:'progression',kind:definition.kind,enabled:true,amount:0,color:'#b579ff',parameters:defaultParameters(definition.kind)};
        const cases=[];const y=26+row*(h+21);painter.fillStyle='#e5e7ff';painter.font='10px sans-serif';painter.fillText(definition.label.slice(0,20),2,y+14);
        for(const transparent of [false,true]){
          const source=make(transparent),before=bytes(source),distances=[];
          try{
            for(const value of new Set([...values,definition.min,definition.max,definition.initial,(definition.min+definition.max)/2])){
              const amount=Math.max(definition.min,Math.min(definition.max,value));
              const rendered=applyEffect(source,{...effect,amount}),pixels=bytes(rendered),distance=difference(before,pixels);
              distances.push({value,amount,...distance});
              if(!transparent&&[0,1,5,25,50,100].includes(value)){
                const x=108+[0,1,5,25,50,100].indexOf(value)*w;painter.drawImage(rendered,x,y,w,h);
                painter.fillStyle='#99a9cf';painter.fillText(distance.mean.toFixed(2),x+3,y+h+13);
              }
              if(value===50){const copy=applyVideoFrameEffect(source,{...effect,amount}),parity=difference(pixels,bytes(copy));videoMax=Math.max(videoMax,parity.max);}
            }
            immutable=immutable&&difference(before,bytes(source)).max===0;
            const denominator=distances.find(d=>d.value===100).mean;
            const earlyRatio=denominator>.25?distances[1].mean/denominator:0;
            cases.push({profile:transparent?'transparent artwork and text':'opaque artwork and text',distances,earlyRatio,
              review:!continuousExceptions.has(definition.kind)&&definition.min<=0&&earlyRatio>.35});
          }catch(error){errors.push({kind:definition.kind,error:String(error)});}
        }
        rows.push({id:definition.kind,name:definition.label,min:definition.min,max:definition.max,unit:definition.unit,
          semantics:continuousExceptions.has(definition.kind)?'Neutral value or discrete/spatial units; not a 0..100 opacity control':'Effect-specific strength mapping',cases});
      }
      sheets.push(sheet);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    window.__huelithProgressionSheets=sheets;
    return {generatedAt:new Date().toISOString(),runtime:navigator.userAgent,dimensions:[w,h],effects:rows.length,immutable,videoMax,errors,rows,
      flagged:rows.filter(r=>r.cases.some(c=>c.review)).map(r=>({id:r.id,name:r.name,ratios:r.cases.map(c=>c.earlyRatio)}))};
  });
  const count=await page.evaluate(()=>window.__huelithProgressionSheets.length);
  for(let i=0;i<count;i++){
    await page.evaluate(index=>{const sheet=window.__huelithProgressionSheets[index];sheet.style.cssText='position:fixed;left:0;top:0;z-index:2147483647';document.body.append(sheet);},i);
    await page.locator(`[data-effect-progression-sheet="${i}"]`).screenshot({path:`output/stage-dg/effect-progression-${i+1}.png`});
    await page.evaluate(index=>window.__huelithProgressionSheets[index].remove(),i);
  }
  if(report.errors.length||!report.immutable||report.videoMax>1.01)throw Error(JSON.stringify({errors:report.errors,immutable:report.immutable,videoMax:report.videoMax}));
  // Return the report to the CLI host: native WebView2 does not expose Chromium's
  // browser-download event. This also keeps the harness from opening a save UI.
  return {...report,sheets:count};
}
