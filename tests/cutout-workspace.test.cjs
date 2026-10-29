const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
test('cutout is accessible through Inspector, not new Effect choices', () => {
  const app = read('src/App.tsx');
  const catalog = read('src/editor/studio-catalog.ts');
  assert.match(app,/CutoutWorkspace/);
  assert.match(app,/panel === 'inspector'/);
  assert.match(app,/Remove Background/);
  assert.match(catalog,/item.kind !== 'cutout'/);
  assert.doesNotMatch(catalog,/LAYER_EFFECT_KINDS = \['cutout'/);
  assert.match(catalog,/effect.kind === 'cutout'/); // legacy FX kept readable
});
test('mask workspace offers explicit selection tools and Process only', () => {
  const ui = read('src/components/CutoutWorkspace.tsx');
  for (const text of ['Keep brush','Remove brush','Erase selection','Line','Freehand lasso','Polygon lasso',
    'Rectangle','Ellipse','Pan','Process mask','Reset selection','Undo','Redo','Original','Mask']) {
    assert.ok(ui.toLowerCase().includes(text.toLowerCase()),text);
  }
  assert.match(ui,/onProcess\(output.toDataURL\('image\/png'\)/);
  assert.doesNotMatch(ui,/newEffect\(/);
});
test('non-destructive mask renders through the same compositing path for preview and export', () => {
  const render = read('src/editor/render.ts');
  assert.match(render,/globalCompositeOperation = 'destination-in'/);
  assert.match(render,/maskImage \? maskedRaster\(image, maskImage\)/);
  const store = read('src/editor/store.ts');
  assert.match(store,/applyCutoutMask: \(layerId, data, width, height,editable\)/);
  assert.match(store,/toggleCutoutMask: layerId/);
  assert.match(store,/removeCutoutMask: layerId/);
  assert.match(store,/track\[layerId\] = .*filter\(effect => effect.kind !== 'cutout'\)/);
});
test('layer model validates PNG cutout data and accepts existing legacy documents', () => {
  const src = read('src/editor/types.ts');
  assert.match(src,/cutoutMask\?:/);
  assert.match(src,/validCutoutMask\(value.cutoutMask\)/);
  assert.match(src,/value.width \* value.height <= 64_000_000/);
  assert.match(src, /format !== 'huelith' && value.format !== 'spectrum'/);
});


test('new raster alpha masks survive real document validation and reject malicious payloads', () => {
  const ts = require('typescript');
  const src = read('src/editor/types.ts');
  const js = ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m = {exports:{}};
  new Function('require','module','exports',js)(id => id === './creative' ? {validCreative:()=>true} : id === './effect-catalog' ? {FILTER_CATALOG:[{kind:'glow'}]} : {},m,m.exports);
  const doc = m.exports.createDocument('Huelith Cutout',32,32);
  const source = doc.layers[0];
  assert.equal(source.type,'raster');
  source.cutoutMask = {data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',width:1,height:1,enabled:true};
  assert.equal(m.exports.isDocument(doc),true);
  doc.format='spectrum';assert.equal(m.exports.isDocument(doc),true);
  source.cutoutMask.width=50000;assert.equal(m.exports.isDocument(doc),false);
  source.cutoutMask.width=1;source.cutoutMask.data='javascript:bad';assert.equal(m.exports.isDocument(doc),false);
});


test('SVG exports embed the user-drawn alpha mask instead of the unmasked source', () => {
  const ts = require('typescript');
  const input = read('src/editor/svg.ts');
  const js = ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{}};
  new Function('module','exports','require',js)(mod,mod.exports,() => ({}));
  const image = 'data:image/png;base64,aGVsbG8=';
  const mask = 'data:image/png;base64,bWFzaw==';
  const layer = {id:'image-one',type:'raster',name:'Cutout',x:5,y:7,visible:true,locked:false,opacity:1,blend:'source-over',
    image,imageWidth:10,imageHeight:10,cutoutMask:{data:mask,width:10,height:10,enabled:true}};
  const svg = mod.exports.documentToSVG({width:20,height:20,background:'transparent',layers:[layer]});
  assert.match(svg,/mask-type:alpha/);
  assert.ok(svg.includes(mask));
  assert.match(svg,/mask="url\(#cutout-image-one\)"/);
  layer.cutoutMask.enabled=false;
  const plain = mod.exports.documentToSVG({width:20,height:20,background:'transparent',layers:[layer]});
  assert.ok(!plain.includes(mask));
});
