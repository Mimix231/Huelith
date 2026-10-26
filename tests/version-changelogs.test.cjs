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
vm.runInNewContext(catalogJs,{exports:catalogExports,module:{exports:catalogExports}});
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
test('0.2 alpha inventory contains post-rename increments and Phase AI without effect keyframing',()=>{
  for(const name of ['Particle Garden','Warp Cage','Light Trails','Pattern Architect','Gradient Reactor','Pixel Pencil','Clip Below alpha masking',
    'One persistent FX stack per animation layer','Effect removal cannot reappear from an older cel', 'Guided graph-cut foreground segmentation', 'Huelith Mask Workspace', 'CPU-only offline segmentation']) assert.ok(v02.includes(name),name);
  assert.match(v02,/Effect parameter animation is intentionally \*\*not\*\* part of Phase AI/);
});
