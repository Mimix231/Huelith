const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),root=path.resolve(__dirname,'..');
function moduleOf(name,mocks={}){
 const file=path.join(root,'src/editor',name+'.ts');const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,id=>mocks[id]??{});return m.exports;
}
const expansion=moduleOf('expansion-120');const catalog=moduleOf('effect-catalog',{'./expansion-120':expansion});
test('exactly 120 new non-destructive operations in eight independent feature families',()=>{
 const sizes=[16,14,18,14,16,14,14,14];
 assert.equal(expansion.EXPANSION_120.length,120);
 assert.equal(new Set(expansion.EXPANSION_120.map(item=>item.kind)).size,120);
 for(let section=0;section<8;section++){
   assert.equal(expansion.EXPANSION_120.filter(i=>i.section===section).length,sizes[section]);
   assert.ok(expansion.EXPANSION_120.filter(i=>i.section===section).every(i=>i.label.length>=9));
 }
 assert.equal(catalog.FILTER_CATALOG.filter(i=>i.kind.startsWith('atelier_')).length,120);
});
test('all new operations are integrated into the authoritative effect dispatcher and have dedicated 48x48 SVG icons',()=>{
 const dispatch=fs.readFileSync(path.join(root,'src/editor/effect-ops.ts'),'utf8');
 const icon=fs.readFileSync(path.join(root,'src/components/EffectIcon.tsx'),'utf8');
 assert.match(dispatch,/EXPANSION_LOOKUP\.has\(kind\)/);assert.match(dispatch,/renderExpansion120\(source,effect\)/);
 assert.match(icon,/import\.meta\.glob\('\.\.\/assets\/effect-icons\/atelier_\*\.svg'/);
 for(const entry of expansion.EXPANSION_120){
  const file=path.join(root,'src/assets/effect-icons',entry.kind+'.svg');
  assert.ok(fs.existsSync(file),entry.kind);assert.match(fs.readFileSync(file,'utf8'),/viewBox="0 0 48 48"/);
 }
});
test('topbar Meme Creator and Edit menu are the only creation entrypoints',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');const menus=fs.readFileSync(path.join(root,'src/commands/menus.ts'),'utf8');
 assert.match(app,/className="huelith-create-launcher"/);
 assert.match(menus,/heading:'Creative actions', entries:\[\{id:'create-meme'/);
 assert.doesNotMatch(app,/huelith-rail-create|openMeme=|case 'm':/);
 assert.doesNotMatch(menus,/heading: 'Quick create'/);
});
test('the 8 expansion families are now discoverable inside the Creativity app hub',()=>{
 const ui=fs.readFileSync(path.join(root,'src/components/FxStudio.tsx'),'utf8');
 const apps=fs.readFileSync(path.join(root,'src/editor/studio-apps.ts'),'utf8');
 assert.match(ui,/studio-hub-grid/);
 assert.match(ui,/setSelectedApp/);
 assert.match(ui,/backToHub/);
 assert.match(ui,/favoriteKinds/);
 assert.match(ui,/recentKinds/);
 for(const entry of expansion.EXPANSION_120)assert.ok(apps.includes(`'${entry.group}'`),entry.group);
});
test('all blurs use normalized kernels or edge-extended Gaussian; refraction avoids transparent corners',()=>{
 const core=fs.readFileSync(path.join(root,'src/editor/effect-ops.ts'),'utf8');
 const blur=fs.readFileSync(path.join(root,'src/editor/blur-luminance.ts'),'utf8');
 const box=fs.readFileSync(path.join(root,'src/editor/detail-reconstruction.ts'),'utf8');
 assert.match(core,/gaussianBlurStable/);assert.match(core,/spatialBlurStable/);
 assert.match(core,/Math\.max\(0,Math\.min\(width-1,Math\.round\(sx\)\)\)/);
 assert.match(blur,/pixel\[0\]\*weight/);assert.match(box,/255\/alpha/);
});
