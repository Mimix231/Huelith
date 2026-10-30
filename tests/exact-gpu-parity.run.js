async page => {
  return await page.evaluate(async()=>{
    const {renderExactGpuEffects}=await import('/src/editor/exact-gpu-effects.ts');
    const {applyEffect}=await import('/src/editor/effect-ops.ts');
    const cases=[['brightness',35],['brightness',175],['contrast',35],['contrast',165],['saturate',0],['saturate',170],['hue',35],['hue',240],['grayscale',37],['grayscale',100],['sepia',40],['sepia',100],['invert',30],['invert',100]];
    const result=[];
    for(const transparent of [false,true]){
      const src=document.createElement('canvas');src.width=67;src.height=41;const c=src.getContext('2d');const im=c.createImageData(67,41);
      for(let y=0;y<41;y++)for(let x=0;x<67;x++){const i=(y*67+x)*4;im.data.set([(x*37+y*17)%256,(x*11+y*47)%256,(x*73+y*23)%256,transparent?((x*41+y*13)%256):255],i);}c.putImageData(im,0,0);
      const stacks=cases.map(([kind,amount])=>[{id:kind,kind,amount,enabled:true}]);
      stacks.push([{id:'a',kind:'brightness',amount:160,enabled:true},{id:'b',kind:'invert',amount:45,enabled:true},{id:'c',kind:'hue',amount:72,enabled:true}]);
      stacks.push(Array.from({length:8},(_,i)=>({id:String(i),kind:i%2?'contrast':'brightness',amount:i%2?105:102,enabled:true})));
      for(const effects of stacks){
        let reference=src;for(const effect of effects)reference=applyEffect(reference,effect);
        const output=renderExactGpuEffects(src,effects);if(!output)throw Error('Exact GPU kernel failed to initialize');
        const copy=document.createElement('canvas');copy.width=67;copy.height=41;const ctx=copy.getContext('2d');ctx.drawImage(output,0,0);
        const a=reference.getContext('2d').getImageData(0,0,67,41).data,b=ctx.getImageData(0,0,67,41).data;
        let maxRgb=0,maxAlpha=0,maxPremultiplied=0,sum=0;
        for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(i%4===3)maxAlpha=Math.max(maxAlpha,d);else{maxRgb=Math.max(maxRgb,d);sum+=d;const alpha=a[i-i%4+3]/255;maxPremultiplied=Math.max(maxPremultiplied,Math.abs(Math.round(a[i]*alpha)-Math.round(b[i]*alpha)));}}
        result.push({effect:effects.map(e=>e.kind).join('→'),transparent,maxRgb,maxAlpha,maxPremultiplied,meanRgb:sum/(67*41*3)});
      }
    }
    return result;
  });
}
