async page=>{
 await page.getByRole('button',{name:/VIDEO WORKSPACE Video Editor/}).click();
 await page.getByRole('textbox',{name:'Document name',exact:true}).fill('Filter drag QA');
 await page.getByRole('button',{name:'Create video project',exact:true}).click();
 await page.locator('input[type=file]').first().setInputFiles('public/video-library/previews/oc-human-base.png');
 await page.getByRole('button',{name:'Add oc-human-base.png',exact:true}).click();
 await page.getByRole('navigation',{name:'Video library tabs'}).getByRole('button',{name:'Filters',exact:true}).click();
 await page.getByRole('button',{name:'Add Midnight Orchid',exact:true}).click();return {width:await page.locator('.hv-preview-canvas').getAttribute('width'),height:await page.locator('.hv-preview-canvas').getAttribute('height')};
}
