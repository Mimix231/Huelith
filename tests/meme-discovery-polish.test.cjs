const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('Meme Creator is reachable only through titlebar and Edit menu',()=>{
 const app=read('src/App.tsx');const menus=read('src/commands/menus.ts');
 assert.match(app,/className="huelith-create-launcher"/);
 assert.doesNotMatch(app,/className="huelith-rail-create"/);
 assert.match(app,/aria-label="Open Huelith Meme Creator"/);
 assert.doesNotMatch(app,/openMeme=\{\(\) => setMemeOpen\(true\)\}/);
 assert.match(menus,/heading:'Creative actions'.+id:'create-meme'/);
 assert.doesNotMatch(menus,/heading: 'Quick create'/);
 assert.match(app,/case 'create-meme':setMemeOpen\(true\)/);
});
test('The editor reuses a single Meme Creator implementation',()=>{
 const app=read('src/App.tsx');
 assert.doesNotMatch(app,/if\(event\.altKey\)\{event\.preventDefault\(\);setMemeOpen/);
 assert.match(app,/<MemeCreator key=\{doc\.id\}/);
 assert.match(app,/applyMemeToDocument\(document,request\)/);
});
test('Second-image async decode repaints the preview, not just the React state',()=>{
 const ui=read('src/components/MemeCreator.tsx');
 assert.match(ui,/const \[secondReady,setSecondReady\]=useState\(0\)/);
 assert.match(ui,/await im\.decode\(\)/);
 assert.match(ui,/setSecondReady\(n=>n\+1\)/);
 assert.match(ui,/\[paint,renderReady,secondReady\]/);
});
test('theme icon glyph is centered independently from the shape of its badge',()=>{
 const ui=read('src/App.tsx'),css=read('src/styles/huelith-hybrid-shell.css');
 assert.match(ui,/className="brand-mark__glyph"/);
 assert.match(css,/\.app \.titlebar \.brand-mark\s*\{/);
 assert.match(css,/transform:none!important/);
 assert.match(css,/\.brand-mark__glyph\s*\{[\s\S]*?place-items:center/);
 assert.match(css,/\.theme-sakura \.brand-mark__glyph\{transform:rotate/);
 assert.match(css,/@media \(max-width:1240px\)/);
 assert.match(ui,/import '\.\/styles\/huelith-hybrid-shell\.css'/);
});
