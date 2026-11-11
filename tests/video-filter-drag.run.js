async page=>{
 await page.locator('[data-clip-id]').filter({hasText:'oc-human-base.png'}).click();
 await page.getByRole('navigation',{name:'Video library tabs'}).getByRole('button',{name:'Filters',exact:true}).click();
 const effect=page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Midnight Orchid'})});
 if(!await effect.evaluate(e=>e.open))await effect.locator('summary').click();
 const slider=page.getByRole('slider',{name:'Midnight Orchid amount',exact:true}),before=Number(await slider.inputValue());
 await slider.scrollIntoViewIfNeeded();
 await page.evaluate(()=>{const old=window.__filterDrag;if(old){window.removeEventListener('huelith-video-frame',old.listener);old.element?.removeEventListener('input',old.inputListener);}
  const measurement={inputs:[],frames:[]},slider=document.querySelector('input[aria-label="Midnight Orchid amount"]');measurement.element=slider;
  measurement.inputListener=()=>measurement.inputs.push({time:performance.now(),value:+slider.value});slider.addEventListener('input',measurement.inputListener);
  measurement.listener=e=>{const canvas=document.querySelector('.hv-preview-canvas'),ctx=canvas.getContext('2d'),data=ctx.getImageData(Math.floor(canvas.width*.48),Math.floor(canvas.height*.2),16,16).data;
   let hash=0;for(let i=0;i<data.length;i++)hash=(hash*31+data[i])>>>0;
   measurement.frames.push({time:performance.now(),ms:e.detail.processingMs,hash,amount:e.detail.effects.find(f=>f.kind==='video-filter')?.amount});
  };window.__filterDrag=measurement;window.addEventListener('huelith-video-frame',measurement.listener);
 });
 const box=await slider.boundingBox();await page.mouse.move(box.x+box.width*.8,box.y+box.height/2);await page.mouse.down();
 for(let n=0;n<90;n++){const p=.1+.78*(.5+.5*Math.sin(n/90*Math.PI*3));await page.mouse.move(box.x+box.width*p,box.y+box.height/2);await page.waitForTimeout(16);}
 await page.mouse.up();await page.waitForTimeout(500);const final=Number(await slider.inputValue());
 const result=await page.evaluate(()=>{const data=window.__filterDrag;window.removeEventListener('huelith-video-frame',data.listener);data.element.removeEventListener('input',data.inputListener);
  const percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))]??0;
  const ages=data.frames.map(frame=>{const previous=data.inputs.filter(i=>i.time<=frame.time&&i.value===frame.amount).at(-1);return previous?frame.time-previous.time:NaN;}).filter(Number.isFinite);
  return {inputs:data.inputs.length,frames:data.frames.length,visiblePixelStates:new Set(data.frames.map(f=>f.hash)).size,processingP50:percentile(data.frames.map(f=>f.ms),.5),processingP95:percentile(data.frames.map(f=>f.ms),.95),inputAgeP50:percentile(ages,.5),inputAgeP95:percentile(ages,.95),lastAmount:data.frames.at(-1)?.amount};
 });
 if(result.frames<10||result.visiblePixelStates<5)throw Error(`Drag did not visibly update continuously: ${JSON.stringify(result)}`);
 if(result.lastAmount!==final)throw Error('Player did not settle on the final slider value');
 await page.getByRole('button',{name:'Undo',exact:true}).click();result.undoAsOneEdit=Number(await slider.inputValue())===before;
 if(!result.undoAsOneEdit)throw Error('One drag did not undo as one edit');return {...result,width:await page.locator('.hv-preview-canvas').getAttribute('width'),final};
}
