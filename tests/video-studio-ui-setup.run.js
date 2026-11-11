async page=>{
 await page.getByRole('button',{name:/VIDEO WORKSPACE Video Editor/}).click();
 await page.getByRole('textbox',{name:'Document name',exact:true}).fill('Video Studio QA');
 await page.getByRole('button',{name:'Create video project',exact:true}).click();
 return {workspace:await page.getByRole('main',{name:'Video Editor workspace'}).count()};
}
