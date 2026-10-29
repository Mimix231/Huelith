const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function load(file,mocks={}){const mod={exports:{}};
  const compiled=ts.transpileModule(read(file),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('module','exports','require',compiled)(mod,mod.exports,id=>mocks[id]??{});
  return mod.exports;
}
const expansion=load('src/editor/expansion-120.ts');
const groups=[
 'Color & light','Color Science','Lighting & Atmosphere','Detail & texture','Stylize','Artistic Painting',
 'Distortion & Geometry','Anime & Comics','Materials & Surfaces','Digital & Experimental','Cinematic & Optical',
];
const builtin={CREATIVITY_FILTERS:groups.map((group,index)=>({kind:`sample-${index}`,group})),
 LAYER_EFFECTS:[{kind:'glow',group:'Stylize'},{kind:'miasma',group:'Creative effects'}]};
const studio=load('src/editor/studio-apps.ts',{'./studio-catalog':builtin,'./fx':{FX_PRESETS:{'Huelith Burst':[]}}});
test('Creativity hub contains every existing family and all 120 expansion operations by app',()=>{
 assert.equal(studio.STUDIO_APPS.filter(a=>a.destination==='creativity'&&!['favorites','recent'].includes(a.id)).length,10);
 assert.ok(studio.STUDIO_APPS.some(a=>a.destination==='effects'));
 assert.ok(studio.STUDIO_APPS.some(a=>a.destination==='fx'));
 for(const entry of expansion.EXPANSION_120){
  assert.ok(studio.STUDIO_APPS.some(app=>app.destination==='creativity'&&app.groups.includes(entry.group)),entry.group);
 }
 for(const entry of builtin.CREATIVITY_FILTERS)assert.ok(studio.STUDIO_APPS.some(app=>studio.appContainsKind(app,entry.kind)),entry.group);
 for(const entry of builtin.LAYER_EFFECTS)assert.ok(studio.STUDIO_APPS.some(app=>studio.appContainsKind(app,entry.kind)),entry.group);
 assert.equal(studio.appOperationCount(studio.STUDIO_APP_BY_ID.get('signature')),1);
});
test('App hub navigates to a dedicated grouped catalog and back, with applied effects untouched',()=>{
 const ui=read('src/components/FxStudio.tsx');
 for(const marker of ['studio-hub-grid','setSelectedApp(id)','setCategory(next.destination)','backToHub','Back to Creativity app hub','← All apps','studio-app-breadcrumb'])assert.ok(ui.includes(marker),marker);
 assert.match(ui,/appContainsKind\(app,item\.kind,favoriteKinds,recentKinds\)/);
 assert.match(ui,/category==='creativity' && !browsingApp && !term/);
 assert.match(ui,/studio-applied-section/);
});
test('Catalog opening never launches Order 7 pixel kernels on mount; card icon remains visible',()=>{
 const studioUi=read('src/components/FxStudio.tsx'),preview=read('src/components/EffectPreview.tsx');
 assert.match(studioUi,/!item\.kind\.startsWith\('atelier_'\) && <EffectPreview/);
 assert.match(studioUi,/<EffectIcon kind=\{item\.kind\}/);
 assert.match(studioUi,/<EffectPreview preset=\{name\} onDemand/);
 assert.match(preview,/if\(onDemand\)/);
 assert.match(preview,/parent\?\.addEventListener\('pointerenter',askRender/);
 assert.match(preview,/cancelJob\?\.\(\)/);
});
test('An editor draws its panel before requesting exact processing and cancels late openings',()=>{
 const ui=read('src/components/FxStudio.tsx');
 assert.match(ui,/openingFrame\.current=requestAnimationFrame/);
 assert.match(ui,/openingTimer\.current=window\.setTimeout/);
 assert.match(ui,/generation!==openGeneration\.current/);
 assert.match(ui,/schedulePreview\(active\.id,current\.current\)/);
 assert.match(ui,/function cancelOpening\(\):void/);
 assert.match(ui,/function cancel\(\): void \{\s*cancelOpening\(\)/);
});
test('All 120 operations are scheduled inside the native dedicated worker; no extra fallback module',()=>{
 const graph=read('src/editor/effect-stack-cache.ts'),worker=read('src/editor/effects-worker-client.ts');
 assert.match(graph,/createExpansion120Job\(current,effect\)/);
 assert.match(graph,/job\.runRows\(8\)/);
 assert.match(graph,/if \(superseded\(\)\)/);
 assert.doesNotMatch(worker,/installCooperativeEffectsFallback/);
 assert.match(worker,/huelith-renderer-error/);
 assert.equal(fs.existsSync(path.join(root,'src/editor/cooperative-effects-fallback.ts')),false);
});
