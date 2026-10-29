const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(base,file),'utf8');
const catalogJs = ts.transpileModule(read('src/editor/effect-catalog.ts'), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
const catalogExports = {};
vm.runInNewContext(catalogJs,{exports:catalogExports,module:{exports:catalogExports},require:id=>id==='./expansion-120'?{EXPANSION_120:[]}:undefined});
const v01 = read('docs/changelog/v0.1-alpha.md');
const v02 = read('docs/changelog/v0.2-alpha.md');

test('0.1 alpha inventory individually lists all 101 registered filters, Effects and FX',()=>{
  const bullets = new Set(v01.split('\n').filter(line=>line.startsWith('- ')).map(line=>line.slice(2).trim().toLowerCase()));
  const notFound = catalogExports.FILTER_CATALOG.filter(entry=>!bullets.has(entry.label.toLowerCase()));
  assert.deepEqual(Array.from(notFound, item=>item.label),[]);
  assert.equal(catalogExports.FILTER_CATALOG.length,101);
});
test('0.1 includes user historical tool list, animation, Studio and 13 theme families',()=>{
  for(const item of ['Spectrum Studio','Move & Transform','Edit Bézier Nodes','Rectangular Selection','Pan / Hand','Brush','Eraser',
    'Eyedropper','Rectangle','Ellipse','Line','Precision Pen','Freehand Path','Text','Frame-by-frame animation projects',
    'Economy budget profile','Balanced budget profile','Responsive budget profile','Strawberry','Melon','Peach','Lemon','Mango',
    'Sakura','Blossom','Shadow','Glass','Material','Midnight','Classic','Studio']) assert.ok(v01.includes(item),item);
});
test('0.2 alpha inventory documents current editor features, not superseded Cutout experiments',()=>{
  for(const name of ['Particle Garden','Warp Cage','Light Trails','Pattern Architect','Gradient Reactor','Pixel Pencil',
    'Clip Below alpha masking','One persistent FX stack per animation layer',
    'Effect removal cannot reappear from an older cel','Inspector Remove Background operation',
    'Full Huelith Cutout workspace','Gradient Atelier full-workspace interface',
    'Black & White Burst one-click preset','Multicolor pattern-palette mode',
    'Canvas-center cross (+) snapping']) assert.ok(v02.includes(name),name);
  assert.doesNotMatch(v02,/^- Guided graph-cut foreground segmentation$/m);
  assert.doesNotMatch(v02,/^- Smart, Color, and Manual removal modes$/m);
  assert.doesNotMatch(v02,/^- Gradient Transform overlay$/m);
  assert.match(v02,/effect-parameter animation is not part of this release/i);
});
