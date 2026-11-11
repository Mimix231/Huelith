async page => {
 await page.getByRole('main',{name:'Video Editor workspace'}).waitFor();
 await page.getByRole('slider',{name:'Scrub timeline'}).fill('0.9');
 await page.locator('[data-clip-id="scene"]').click();
 const panel=page.locator('.hv-effect').filter({has:page.locator('summary',{hasText:'Exposure'})});
 if(!(await panel.evaluate(e=>e.open)))await panel.locator('summary').click();
 const slider=page.getByRole('slider',{name:'Exposure amount',exact:true}),before=Number(await slider.inputValue());
 await slider.focus();await slider.press('End');
 if(Number(await slider.inputValue())===before)throw Error('Packaged slider did not change');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 if(Number(await slider.inputValue())!==before)throw Error('Packaged slider undo failed');
 const count=await page.getByRole('combobox',{name:'Add video effect'}).locator('option').evaluateAll(options=>options.filter(o=>o.value).length);
 if(count!==223)throw Error(`Packaged catalog has ${count} operations`);
 const resize=page.getByRole('separator',{name:'Resize video timeline'}),initial=Number(await resize.getAttribute('aria-valuenow'));
 await resize.focus();await resize.press('ArrowUp');
 const adjusted=Number(await resize.getAttribute('aria-valuenow'));
 if(adjusted===initial)throw Error('Timeline keyboard resizing failed');await resize.press('ArrowDown');
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForTimeout(500);
 await page.getByRole('button',{name:'Home',exact:true}).click();
 await page.getByRole('button',{name:'Open Video pipeline QA',exact:true}).click();
 await page.getByRole('slider',{name:'Scrub timeline'}).fill('0.9');await page.waitForTimeout(700);
 await page.screenshot({path:'output/stage-dg/release-video-editor.png'});
 await page.setViewportSize({width:1024,height:720});
 await page.screenshot({path:'output/stage-dg/release-video-narrow.png'});
 const layout=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,
  canvasWidth:document.querySelector('.hv-preview-canvas').width,status:document.querySelector('.hv-statusbar').textContent}));
 await page.setViewportSize({width:1500,height:920});
 if(layout.overflow>1)throw Error('Video layout overflows the narrow window');
 if(await page.locator('.hv-statusbar [role="alert"]').count())throw Error('Packaged renderer reported an error');
 return {origin:new URL(page.url()).origin,effectCount:count,savedAndReopened:true,sliderUndo:true,timelineKeyboardResize:true,layout};
}
