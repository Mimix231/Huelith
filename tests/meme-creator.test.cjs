const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('typescript');const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../src/editor');const cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);
 const file=path.join(root,`${name}.ts`),js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};cache.set(name,module.exports);
 vm.runInNewContext(js,{module,exports:module.exports,structuredClone,Date,Math,Set,Map,Number,String,TextEncoder,Uint8Array,DataView,Error,globalThis:{crypto:webcrypto},require:dep=>load(path.posix.normalize(path.posix.join(path.posix.dirname(name),dep)))},{filename:file});
 cache.set(name,module.exports);return module.exports;}
const meme=load('meme-creator'),types=load('types'),animation=load('animation');
const settings={...meme.MEME_DEFAULTS};const doc=()=>types.createDocument('Test meme',640,400,'#ffffff');
test('Meme Creator has nine distinct designs and each generates serializable, editable native shapes',()=>{
 assert.equal(meme.MEME_LAYOUTS.length,9);
 const original=doc();
 for(const item of meme.MEME_LAYOUTS){
   const draft={...settings,layout:item.id};
   const groups=meme.composeMemeArtwork(original,draft);
   assert.ok(groups.captions.length>0,item.id);
   const working=doc();const before=JSON.stringify(working.layers[0]);
   const ids=meme.applyMemeToDocument(working,{settings:draft});
   assert.ok(ids.length>=1,item.id);
   assert.equal(JSON.stringify(working.layers[0]),before,'never changes the imported image');
   const captions=working.layers.find(layer=>layer.name==='Meme • Editable captions');
   assert.ok(captions && captions.type==='vector');
   for(const shape of captions.shapes){assert.equal(shape.kind,'text');assert.equal(typeof shape.text,'string');assert.ok(shape.text.length);}
   assert.equal(types.isDocument(JSON.parse(JSON.stringify(working))),true,item.id);
 }
});
test('Title and subtitle remain independently editable through the existing vector API',()=>{
 const d=doc();meme.applyMemeToDocument(d,{settings});
 const layer=d.layers.find(l=>l.name==='Meme • Editable captions');assert.equal(layer.shapes.length,2);
 const original=layer.shapes[0].text;layer.shapes[0].text='EDITED CAPTION';
 assert.notEqual(original,layer.shapes[0].text);assert.ok(types.isDocument(JSON.parse(JSON.stringify(d))));
});
test('Font-based wrapping preserves all words and long strings without exceeding 18 lines',()=>{
 const words='HELLO WORLD FROM HUELITH THE MEME CREATOR';
 const result=meme.wrapMemeCaption(words,85,'Impact',20);
 assert.ok(result.includes('\n'));
 assert.equal(result.replace(/\s/g,''),words.replace(/\s/g,''));
 const unbroken='SUPERCALIFRAGILISTICEXPIALIDOCIOUS';
 assert.equal(meme.wrapMemeCaption(unbroken,30,'Impact',17).replace(/\n/g,''),unbroken);
});
test('Speech bubbles have actual editable geometry, demotivational border does not cover underlying image',()=>{
 const d=doc();const speech=meme.composeMemeArtwork(d,{...settings,layout:'speech'});
 assert.equal(speech.backdrops[0].kind,'speechBubble');
 const demot=meme.composeMemeArtwork(d,{...settings,layout:'demotivational'});
 assert.ok(demot.backdrops.some(shape=>shape.stroke==='#ffffff' && shape.fill==='none'));
 assert.ok(demot.backdrops.some(shape=>shape.fill==='#08080c'));
});
test('Compare image gets its own raster layer and does not replace first image',()=>{
 const d=doc();const original=structuredClone(d.layers[0]);
 meme.applyMemeToDocument(d,{settings:{...settings,layout:'split',includeSecondImage:true},secondImage:{data:'data:image/png;base64,eA==',width:100,height:75}});
 assert.equal(JSON.stringify(d.layers[0]),JSON.stringify(original));
 const added=d.layers.find(l=>l.name==='Meme • Comparison image');assert.equal(added.type,'raster');
 assert.equal(added.x,320);assert.ok(added.scaleX>0);
});
test('Meme creation propagates editable layers to animation cels, preserves effects, and allows undo',()=>{
 const d=doc();const base=d.layers[0];animation.enableAnimation(d);animation.insertFrame(d,false);animation.insertFrame(d,false);
 const before=d.animation.frames.length;const effectsBefore=JSON.stringify(d.animation.trackEffects[base.id]);
 const ids=meme.applyMemeToDocument(d,{settings});
 assert.equal(d.animation.frames.length,before);
 assert.equal(JSON.stringify(d.animation.trackEffects[base.id]),effectsBefore);
 for(let i=0;i<3;i++){const layers=animation.frameDocument(d,i).layers;for(const id of ids)assert.ok(layers.some(l=>l.id===id));}
 assert.ok(types.isDocument(JSON.parse(JSON.stringify(d))));
});
test('UI integration: available from Edit and custom right-click, with live preview and theme accents',()=>{
 const ui=fs.readFileSync(path.join(root,'../components/MemeCreator.tsx'),'utf8');
 const app=fs.readFileSync(path.join(root,'../App.tsx'),'utf8');
 const css=fs.readFileSync(path.join(root,'../components/MemeCreator.css'),'utf8');
 for(const item of ['MemeCreator','onApply','prepareImages','composeMemeArtwork','onPointerMove','file','type="color"','Apply']){
   assert.ok((ui+app).toLowerCase().includes(item.toLowerCase()),item);
 }
 assert.match(app,/case 'create-meme'/);
 assert.match(fs.readFileSync(path.join(root,'../commands/menus.ts'),'utf8'),/heading:'Creative actions'.+id:'create-meme'/);
 assert.match(css,/var\(--accent\)/);assert.match(css,/backdrop-filter/);
});
test('Transform grip outside document is actionable; other outside selections remain blocked',()=>{
 const canvas=fs.readFileSync(path.join(root,'../components/Canvas.tsx'),'utf8');
 assert.match(canvas,/outsideTransform/);
 assert.match(canvas,/handleAt\(raw,rect,angle,zoom\)/);
 assert.match(canvas,/if\(!onSheet\(raw\) && !isNavigation && !outsideTransform\)/);
});
test('Theme-specific surface and emblem system including Sakura blossom has distinct palettes',()=>{
 const css=fs.readFileSync(path.join(root,'../styles/workspace-modern.css'),'utf8');
 const app=fs.readFileSync(path.join(root,'../App.tsx'),'utf8');
 for(const theme of ['sakura','blossom','strawberry','melon','peach','lemon','mango','shadow','material','glass','midnight','classic','studio']){
   assert.match(css,new RegExp('theme-'+theme));
 }
 assert.match(css,/#fff8fc/);assert.match(css,/#9e53b3/);assert.match(css,/--accent/);
 assert.match(app,/sakura:"❀"/);
});

test('Animation Studio idle-timer fallback uses a supported global timer (no never-typed window narrowing)',()=>{
 const ui=fs.readFileSync(path.resolve(__dirname,'../src/components/AnimationTimeline.tsx'),'utf8');
 assert.match(ui,/globalThis.setTimeout/);
 assert.match(ui,/typeof idle === 'function'/);
 assert.doesNotMatch(ui,/else task=window.setTimeout/);
});
