const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(id) {
  id = id.replace(/^\.\//, '');
  if (cache.has(id)) return cache.get(id);
  const source = fs.readFileSync(path.join(root, 'src/editor', `${id}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module = {exports:{}};
  cache.set(id,module.exports);
  new Function('module','exports','require',compiled)(module,module.exports,dep=>load(dep));
  cache.set(id,module.exports);
  return module.exports;
}
const gradient=load('gradient'), model=load('types'), patterns=load('gradient-patterns');
const base={id:'ink',kind:'gradient',x:0,y:0,width:740,height:740,fill:'none',stroke:'none',strokeWidth:0,
  gradientMode:'linear',gradientPattern:'sunburst',gradientColorMode:'alternating',gradientRayCount:20,
  gradientRayWidth:.5,gradientRaySoftness:0,gradientTwist:0,gradientRotation:0,gradientCenterX:.5,gradientCenterY:.5,
  gradientStops:[{id:'black',position:0,color:'#000000',opacity:1},{id:'white',position:1,color:'#ffffff',opacity:1}]};
const sampleRay=(shape,deg,radius=.36)=>gradient.gradientSample(shape,.5+Math.cos(deg*Math.PI/180)*radius,.5+Math.sin(deg*Math.PI/180)*radius);
const rgb=a=>a.slice(0,3).map(Math.round);

test('AM1: a black/white sunburst has hard, alternating wedges with no blended interior pixels',()=>{
  assert.deepEqual(rgb(sampleRay(base,2)),[0,0,0]);
  assert.deepEqual(rgb(sampleRay(base,14)),[255,255,255]);
  assert.deepEqual(rgb(sampleRay(base,20)),[0,0,0]);
  assert.deepEqual(rgb(sampleRay(base,32)),[255,255,255]);
  for(let n=0;n<10;n++){
    const pixel=rgb(sampleRay(base,2+n*9));
    assert.ok(pixel.every(v=>v===0||v===255),'produced unintended blends');
  }
});
test('AM1: ray pair count, width, center and rotation genuinely change geometry',()=>{
  assert.notDeepEqual(rgb(sampleRay(base,14)),rgb(sampleRay({...base,gradientRayCount:10},14)));
  assert.notDeepEqual(rgb(sampleRay(base,14)),rgb(sampleRay({...base,gradientRayWidth:.9},14)));
  assert.notDeepEqual(rgb(sampleRay(base,14)),rgb(sampleRay({...base,gradientRotation:10},14)));
  assert.ok([2,5,10,14,20,32,48,80].some(angle=>rgb(sampleRay(base,angle)).join()!=rgb(sampleRay({...base,gradientCenterX:.70},angle)).join()));
});
test('AM1: ray angle is calculated with true document aspect ratio',()=>{
  const wide={...base,width:1200,height:600};
  const angle=(deg,width,height)=>gradient.gradientSample(wide,.5+Math.cos(deg*Math.PI/180)*240/width,.5+Math.sin(deg*Math.PI/180)*240/height);
  assert.deepEqual(rgb(sampleRay(base,14)),rgb(angle(14,1200,600)));
});
test('AM1: palette has six independently selectable color modes',()=>{
  assert.equal(patterns.GRADIENT_COLOR_MODES.length,6);
  assert.deepEqual(patterns.GRADIENT_COLOR_MODES.map(e=>e.id),['smooth','hardStops','bands','alternating','stepped','pattern']);
  const palette=base.gradientStops.map(s=>({position:s.position,color:s.color==='#000000'?[0,0,0]:[255,255,255],alpha:255}));
  assert.deepEqual(rgb(patterns.paletteSample(palette,.1,'hardStops')),[0,0,0]);
  assert.deepEqual(rgb(patterns.paletteSample(palette,.6,'hardStops')),[255,255,255]);
  for(const mode of patterns.GRADIENT_COLOR_MODES.filter(e=>e.id!=='smooth')){
    const left=patterns.paletteSample(palette,.07,mode.id,8);
    assert.ok(left.slice(0,3).every(v=>v===0||v===255),mode.id);
  }
});
test('AM1: multicolor pattern selects actual stop colors instead of inventing intermediates',()=>{
  const multicolor={...base,gradientColorMode:'pattern',gradientRayCount:6,gradientStops:[
    {id:'a',position:0,color:'#ff0000',opacity:1},{id:'b',position:.5,color:'#00ff00',opacity:1},
    {id:'c',position:1,color:'#0000ff',opacity:1}]};
  const rgbHex=pixel=>rgb(pixel).map(n=>n.toString(16).padStart(2,'0')).join('');
  const observed=new Set();for(let a=0;a<360;a+=2) observed.add(rgbHex(sampleRay(multicolor,a)));
  assert.deepEqual([...observed].sort(),['0000ff','00ff00','ff0000']);
});
test('AM1: pattern respects active transform stack without becoming raster or losing source colors',()=>{
  const step={id:'wave-1',kind:'twirl',enabled:true,amount:100,frequency:2,count:16,phase:0,seed:1,centerX:.5,centerY:.5};
  const twisted={...base,gradientTransformStack:[step]};
  const points=[[.53,.73],[.12,.22],[.6,.35],[.33,.68],[.91,.44]];
  assert.ok(points.some(([x,y])=>rgb(gradient.gradientSample(base,x,y)).join()!=rgb(gradient.gradientSample(twisted,x,y)).join()));
  const doc=model.createDocument('Pattern',740,740);doc.layers.push(model.makeGradient(twisted));
  assert.equal(model.isDocument(JSON.parse(JSON.stringify(doc))),true);
  const invalid=structuredClone(doc);invalid.layers.at(-1).gradient.gradientColorMode='not-a-mode';
  assert.equal(model.isDocument(invalid),false);
  invalid.layers.at(-1).gradient.gradientColorMode='alternating';invalid.layers.at(-1).gradient.gradientBandCount=1000;
  assert.equal(model.isDocument(invalid),false);
});
test('AM1: original smooth gradients still render identically without new optional properties',()=>{
  const normal={...base,gradientPattern:'smooth',gradientColorMode:undefined};
  assert.deepEqual(gradient.gradientSample(normal,.13,.38),gradient.gradientSample({...normal,gradientBandCount:undefined},.13,.38));
  assert.deepEqual(rgb(gradient.gradientSample(normal,.5,.5)),[128,128,128]);
});
test('AM1: gradient atelier contains functional color mode, one-click ink preset and editing controls',()=>{
  const ui=fs.readFileSync(path.join(root,'src/components/GradientTransformEditor.tsx'),'utf8');
  for(const token of ['Black & White Burst','gradientColorMode','gradientBandCount','gradientRayCount','gradientRayWidth','gradientRaySoftness','gradientRayTaper','gradientTwist','gradientRotation','Ray center X','PatternPreview'])assert.ok(ui.includes(token),token);
  const native=fs.readFileSync(path.join(root,'src/editor/gradient.ts'),'utf8');
  for(const token of ['gradientColorMode, shape.gradientBandCount','paletteSample','radialRayCoordinate'])assert.ok(native.includes(token),token);
});
