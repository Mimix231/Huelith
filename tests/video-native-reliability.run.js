// Run in the dev desktop after output/stage-dg/relink-fixture.run.js and its
// native chooser have just relinked the overlay. This intentionally reloads an
// unsaved QA edit; reattach/relaunch the desktop if the CDP target is recreated.
async page => {
  await page.getByText('Offline · Relink media',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByText('Offline · Relink media',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await page.getByText('Offline · Relink media',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('slider',{name:'Scrub timeline'}).fill('0.8');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForTimeout(400);
  const relink=await page.evaluate(async()=>{
    const {readProjectFile}=await import('/src/editor/files.ts');
    const p=JSON.parse(await readProjectFile('E:\\ChatGPTProjects\\Huelith\\output\\stage-dg\\relink-fixture.huelith'));
    return p.timeline.assets.find(a=>a.kind==='image');
  });
  if(!relink.path.endsWith('alpha-overlay.png')||relink.revision<1)throw Error('Relink was not saved');
  await page.screenshot({path:'output/stage-dg/relinked-media.png'});
  await page.locator('[data-clip-id="title"]').click();
  const title='Recovered title: unsaved work survives restart';
  await page.getByRole('textbox',{name:'Text',exact:true}).fill(title);
  await page.waitForTimeout(1600);
  const checkpoint=await page.evaluate(async()=>{
    const {readVideoRecovery}=await import('/src/editor/video/recovery.ts');
    const recovery=(await readVideoRecovery()).find(r=>r.project.name==='Relink media QA');
    return recovery?.project.timeline.clips.find(c=>c.id==='title').title;
  });
  if(checkpoint!==title)throw Error('Autosave recovery did not retain the edited title');
  // This is an intentionally unsaved QA title; accept its reload guard so the
  // following navigation exercises the persisted recovery, rather than a save.
  page.once('dialog',dialog=>void dialog.accept());
  await page.reload();await page.getByRole('button',{name:'Restore video',exact:true}).waitFor();
  await page.getByRole('button',{name:'Restore video',exact:true}).click();
  await page.locator('[data-clip-id="title"]').click();
  if(await page.getByRole('textbox',{name:'Text',exact:true}).inputValue()!==title)throw Error('Restoring recovery lost the unsaved title');
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForTimeout(400);
  const remaining=await page.evaluate(async()=>{
    const {readVideoRecovery}=await import('/src/editor/video/recovery.ts');
    return (await readVideoRecovery()).filter(r=>r.project.name==='Relink media QA').length;
  });
  if(remaining)throw Error('Successful save left a stale recovery banner');
  return {relink:relink.path,revision:relink.revision,undoRedo:true,autosave:true,reloadRestore:true,clearedAfterSave:true};
}
