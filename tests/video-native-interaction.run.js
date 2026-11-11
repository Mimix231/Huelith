async page=>{
  await page.getByRole('main',{name:'Video Editor workspace'}).waitFor();
  await page.getByRole('slider',{name:'Scrub timeline'}).fill('0');
  await page.waitForFunction(()=>{const c=document.querySelector('.hv-preview-canvas');if(!c)return false;const p=c.getContext('2d').getImageData(30,30,1,1).data;return p[0]!==11||p[1]!==14||p[2]!==24;});
  // Select the already observed three-second scene in the native fixture timeline.
  await page.locator('[data-clip-id="scene"]').click();
  const exposurePanel=page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Exposure'})});
  if(!(await exposurePanel.getAttribute('open'))&&!(await exposurePanel.evaluate(e=>e.open)))await exposurePanel.locator('summary').click();
  const slider=page.getByRole('slider',{name:'Exposure amount',exact:true});await slider.scrollIntoViewIfNeeded();
  const original=Number(await slider.inputValue());
  const destination=original===80?100:80;
  await page.evaluate(()=>{
    const old=window.__huelithDragHandlers;if(old){window.removeEventListener('huelith-video-frame',old.frame);document.removeEventListener('input',old.input);}
    window.__huelithDrag={frames:[],inputs:[]};
    const frame=e=>{const canvas=document.querySelector('.hv-preview-canvas'),bytes=canvas.getContext('2d').getImageData(20,20,32,1).data;
      const pixelHash=bytes.reduce((sum,n,i)=>(sum+Math.imul(n,i+13))>>>0,0);window.__huelithDrag.frames.push({...e.detail,pixelHash,at:performance.now()});};
    const input=e=>{if(e.target.getAttribute('aria-label')==='Exposure amount')window.__huelithDrag.inputs.push({value:Number(e.target.value),at:performance.now()});};
    window.__huelithDragHandlers={frame,input};window.addEventListener('huelith-video-frame',frame);document.addEventListener('input',input);
  });
  const box=await slider.boundingBox();if(!box)throw Error('Exposure slider is not visible');
  const min=Number(await slider.getAttribute('min')),max=Number(await slider.getAttribute('max'));
  const x=value=>box.x+8+(box.width-16)*(value-min)/(max-min),y=box.y+box.height/2;
  await page.mouse.move(x(original),y);await page.mouse.down();
  for(let step=0;step<100;step++){
    const value=50+40*Math.sin(step/99*Math.PI*3)+(destination-50)*step/99;await page.mouse.move(x(value),y);await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const final=Number(await slider.inputValue());
  if(final===original)throw Error('The drag must end at a different amount to verify undo');
  await page.waitForTimeout(600);
  const drag=await page.evaluate(()=>{
    const d=window.__huelithDrag,first=d.inputs[0]?.at??Infinity,last=d.inputs[d.inputs.length-1]?.at??-Infinity;
    const during=d.frames.filter(f=>f.at>=first&&f.at<=last),latency=[];
    for(const f of during){const value=f.effects.find(e=>e.clip==='scene'&&e.kind==='exposure')?.amount;
      const input=[...d.inputs].reverse().find(i=>i.value===value&&i.at<=f.at);if(input)latency.push(f.at-input.at);}
    const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??null;};
    return {inputs:d.inputs.length,framesDuringDrag:during.length,visibleFrameChanges:new Set(during.map(f=>f.pixelHash)).size,processingP50:percentile(during.map(f=>f.processingMs),.5),processingP95:percentile(during.map(f=>f.processingMs),.95),inputToFrameP50:percentile(latency,.5),inputToFrameP95:percentile(latency,.95)};
  });
  if(drag.framesDuringDrag<12||drag.visibleFrameChanges<6)throw Error(`Continuous preview stalled: ${JSON.stringify(drag)}`);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  if(Number(await slider.inputValue())!==original)throw Error('One drag was not one undo transaction');
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  if(Number(await slider.inputValue())!==final)throw Error('Redo did not restore the slider drag');
  const add=page.getByRole('combobox',{name:'Add video effect'});
  if(!(await page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Manga Screentones'})}).count()))await add.selectOption('atelier_4_0');
  if(!(await page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Temporal Echo'})}).count()))await add.selectOption('video-temporal-echo');
  if(!(await page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Temporal Echo'})}).evaluate(e=>e.open)))await page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Temporal Echo'})}).locator('summary').click();
  const echo=page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Temporal Echo'})});
  await echo.getByRole('checkbox',{name:'Enabled'}).uncheck();await echo.getByRole('checkbox',{name:'Enabled'}).check();
  const order=await page.locator('.hv-effect summary').allTextContents();if(order.findIndex(t=>t.includes('Temporal Echo'))>order.findIndex(t=>t.includes('Manga Screentones')))await page.getByTitle('Move Temporal Echo up').click();
  // Known timestamp: source white flash and soundtrack beep overlap here.
  const scrub=page.getByRole('slider',{name:'Scrub timeline'});await scrub.fill('0.8');
  await page.waitForTimeout(900);
  const alert=page.locator('.hv-statusbar [role="alert"]');if(await alert.count())throw Error(await alert.innerText());
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForTimeout(400);
  const saved=await page.evaluate(async()=>{
    const {readProjectFile}=await import('/src/editor/files.ts');
    const {readRecentProjects}=await import('/src/editor/project-hub.ts');
    const recent=readRecentProjects().find(r=>r.name==='Video pipeline QA');return JSON.parse(await readProjectFile(recent.path));
  });
  const effects=saved.timeline.clips.find(c=>c.id==='scene').effects;
  if(effects.length!==3||effects[0].amount!==final||effects[1].kind!=='video-temporal-echo'||effects[2].kind!=='atelier_4_0')throw Error('Saved video stack differs from the inspector');
  await page.screenshot({path:'output/stage-dg/native-video-effects.png'});
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'Open Video pipeline QA',exact:true}).click();
  await page.locator('[data-clip-id="scene"]').click();
  const reopenedExposure=page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Exposure'})});
  if(!(await reopenedExposure.evaluate(e=>e.open)))await reopenedExposure.locator('summary').click();
  if(Number(await page.getByRole('slider',{name:'Exposure amount',exact:true}).inputValue())!==final)throw Error('Reopened value changed');
  await scrub.fill('0');
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForTimeout(3400);
  const playback=await page.evaluate(()=>{
    const frames=window.__huelithDrag.frames.filter(f=>f.playing),unique=new Set(frames.map(f=>Math.floor((f.timestamp+1e-7)*30)));
    const processing=frames.map(f=>f.processingMs).sort((a,b)=>a-b);
    return {completed:frames.length,uniqueFrames:unique.size,processingP50:processing[Math.floor(processing.length*.5)],processingP95:processing[Math.floor(processing.length*.95)]};
  });
  if(playback.completed<5)throw Error('Video playback did not publish frames');
  return {drag,playback,original,final,savedEffects:effects.map(e=>e.kind)};
}
