async page=>{
 const result={tabs:{},errors:[]};page.on('pageerror',error=>result.errors.push(String(error)));
 const library=page.getByRole('navigation',{name:'Video library tabs'}),tab=name=>library.getByRole('button',{name,exact:true});
 await page.getByRole('main',{name:'Video Editor workspace'}).waitFor();
 async function dragToClip(card,clip,highlight){
   await card.scrollIntoViewIfNeeded();
   await clip.scrollIntoViewIfNeeded();
   const from=await card.boundingBox(),to=await clip.boundingBox();
   if(!from||!to)throw Error('The drag source and timeline clip must be visible');
   await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
   await page.mouse.down();
   try{
     await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:16});
     await page.locator(highlight).first().waitFor({timeout:3000});
   }finally{await page.mouse.up();}
 }
 await page.locator('input[type=file]').first().setInputFiles('public/video-library/previews/oc-human-base.png');
 await page.getByRole('button',{name:'Add oc-human-base.png',exact:true}).waitFor();
 if(await page.locator('[data-clip-id]').count()!==0)throw Error('Import should populate media without inserting timeline clips.');
 await page.getByRole('button',{name:'Add oc-human-base.png',exact:true}).click();
 await page.locator('[data-clip-id]').first().waitFor();
 await tab('Filters').click();result.tabs.filters=await page.locator('.hv-catalog-card').count();
 if(result.tabs.filters!==270)throw Error('Incomplete filter library');
 await page.locator('[data-lane-id="video2"]').click({position:{x:30,y:20}});
 await dragToClip(page.locator('.hv-catalog-card').first(),page.locator('[data-clip-id]').first(),'.hv-clip.is-card-drop-target');
 await page.locator('.hv-effect').last().waitFor();
 const filter=page.locator('.hv-effect').last();if(!await filter.evaluate(e=>e.open))await filter.locator('summary').click();
 const filterAmount=filter.getByRole('slider').first();await filterAmount.fill('35');await filterAmount.press('ArrowRight');await filterAmount.press('Tab');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 result.filterUndo=Number(await filterAmount.inputValue())===100;if(!result.filterUndo)throw Error('Filter strength gesture did not undo as one edit');
 await page.screenshot({path:'output/video-studio/studio-filters-1920.png'});
 await tab('Effects').click();result.tabs.effects=await page.locator('.hv-catalog-card').count();
 await page.getByRole('searchbox',{name:'Search effects'}).fill('Manga');
 result.effectSearch=await page.locator('.hv-catalog-card').count();if(result.effectSearch<1)throw Error('Effect search failed');
 await tab('Text').click();result.tabs.text=await page.locator('.hv-catalog-card').count();
 await dragToClip(page.getByRole('button',{name:'Add Violet glow · Headline',exact:true}),
   page.locator('.hv-clip-video').first(),'.hv-library-drop-line:visible');
 await page.getByRole('textbox',{name:'Text',exact:true}).fill('EVERY MOMENT\nIS YOURS');
 await tab('Animation').click();await page.getByRole('button',{name:'Rise In',exact:true}).click();
 await page.getByRole('slider',{name:'Scrub timeline'}).fill('1');
 await page.screenshot({path:'output/video-studio/studio-text-1920.png'});
 await tab('Stickers').click();result.tabs.stickers=await page.locator('.hv-catalog-card').count();
 await page.getByRole('button',{name:'Add Black cat',exact:true}).click();
 const [stickerChooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('region',{name:'Stickers library',exact:true}).getByRole('button',{name:'Import',exact:true}).click()]);
 await stickerChooser.setFiles(['output/video-studio/test-sticker.gif','output/video-studio/test-sticker.tga']);
 await page.getByRole('button',{name:'Add test-sticker.gif',exact:true}).waitFor();
 await page.getByRole('button',{name:'Add test-sticker.gif',exact:true}).click();
 await tab('Audio').click();
 await page.getByRole('searchbox',{name:'Search audio'}).fill('Exotic Battle');
 const play=page.getByRole('button',{name:/^Preview Exotic Battle/}).first();
 await play.waitFor({timeout:25000});result.tabs.audio=await page.locator('.hv-audio-item').count();
 await play.click();
 await page.waitForFunction(()=>{const audio=document.querySelector('.hv-library-scroll audio');return audio&&!audio.paused&&audio.currentTime>.1;});
 await page.getByRole('button',{name:/^Pause Exotic Battle/}).first().click();
 await page.getByRole('button',{name:/^Download and add Exotic Battle/}).first().click();
 await page.locator('.hv-clip-audio').filter({hasText:'Exotic Battle'}).first().waitFor({timeout:90000});
 await tab('Captions').click();await page.getByRole('button',{name:'Add caption',exact:true}).click();
 await page.getByRole('textbox',{name:'Caption 1 text',exact:true}).fill('Create without limits.');
 result.captions=await page.locator('.hv-caption-cue').count();
 await tab('Templates').click();result.tabs.templates=await page.locator('.hv-catalog-card').count();
 await tab('Canvas').click();await page.getByRole('textbox',{name:'Project name',exact:true}).fill('Video Studio QA');
 await page.getByRole('textbox',{name:'Project name',exact:true}).press('Enter');
 await page.screenshot({path:'output/video-studio/studio-canvas-1920.png'});
 const snapshots=[];for(const [width,height] of [[1440,900],[1024,720],[1920,1038]]){
  await page.setViewportSize({width,height});snapshots.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,
   library:Math.round(document.querySelector('.hv-library').getBoundingClientRect().width),player:Math.round(document.querySelector('.hv-stage').getBoundingClientRect().width),inspector:Math.round(document.querySelector('.hv-inspector').getBoundingClientRect().width)})));
  await page.screenshot({path:`output/video-studio/studio-${width}.png`});
 }result.layout=snapshots;if(snapshots.some(s=>s.overflow>1))throw Error('Responsive layout has horizontal page overflow');
 if(await page.locator('.hv-statusbar [role=alert]').count())throw Error(await page.locator('.hv-statusbar [role=alert]').textContent());
 if(result.errors.length)throw Error(result.errors.join('\n'));await page.evaluate(value=>{window.__huelithStudioQA=value;},result);return result;
}
