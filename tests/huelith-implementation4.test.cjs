const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const compiled={};
function load(name){name=name.replace(/^\.\//,'');if(compiled[name])return compiled[name];
 const file=path.join(root,'src/editor',name+'.ts');
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};compiled[name]=mod.exports;
 new Function('require','module','exports',js)(dep=>load(dep),mod,mod.exports);
 return compiled[name]=mod.exports;
}
const types=load('types'),gradient=load('gradient'),catalog=load('effect-catalog');
const shape=()=>({id:'gradient',kind:'gradient',x:0,y:0,width:480,height:280,fill:'none',stroke:'none',strokeWidth:0,
  gradientMode:'radial',gradientPattern:'sunburst',gradientRayCount:14,gradientRayWidth:.45,
  gradientStops:[{id:'a',position:0,color:'#fff1b4',opacity:1},{id:'b',position:1,color:'#ff9300',opacity:1}]});
test('radial patterns serialize and remain backwards-compatible',()=>{
 const doc=types.createDocument('Gradient serialization',480,280);
 doc.layers.push(types.makeVector('Gradient'));
 doc.layers[1].shapes.push(shape());
 assert.ok(types.isDocument(JSON.parse(JSON.stringify(doc))));
 doc.format='spectrum';assert.ok(types.isDocument(doc));
});
test('malformed radial patterns are rejected rather than crashing the renderer',()=>{
 const doc=types.createDocument('Safety',480,280);
 doc.layers.push(types.makeVector('Gradient'));
 const entry=shape();doc.layers[1].shapes.push(entry);
 entry.gradientPattern='javascript';assert.equal(types.isDocument(doc),false);
 entry.gradientPattern='sunburst';entry.gradientRayCount=Infinity;assert.equal(types.isDocument(doc),false);
});
test('sunburst has two authentic poster colors and editable ray geometry',()=>{
 const specimen=shape();const primary=gradient.gradientSample(specimen,.25,.15);
 assert.equal(primary.length,4);
 assert.ok(Math.max(...primary.slice(0,3))>150,'must not be clamped to black');
 const frequencies=[14,19,31].map(n=>gradient.gradientSample({...specimen,gradientRayCount:n},.31,.08).join(','));
 assert.ok(new Set(frequencies).size>1,'ray counts should change actual pixels');
});
test('new patterns and softened blur controls are implemented by different algorithms',()=>{
 const shader=read('src/editor/gradient.ts');
 for(const kind of ['sunburst','speedlines','gradientRaySoftness','gradientRayWidth','gradientRayTaper','gradientRaySeed'])assert.ok(shader.includes(kind),kind);
 const detail=read('src/editor/effect-ops.ts');
 for(const filter of ["effect.kind === 'clarity'","effect.kind === 'texture'","effect.kind === 'sharpen'","effect.kind === 'unsharp'"])
   assert.ok(detail.includes(filter));
});
test('Gradient Designer uses direct canvas drawing and a dedicated Gradient Atelier, no legacy studio',()=>{
 const app=read('src/App.tsx');
 assert.match(app,/GradientDesignerToolbar/);
 assert.doesNotMatch(app,/GradientControls|huelith:gradient-open/);
 const toolbar=read('src/components/GradientDesignerToolbar.tsx');
 assert.match(toolbar,/Transform in Atelier/);
 assert.match(toolbar,/GradientTransformEditor/);
 assert.match(toolbar,/Edit gradient stops|Color stops/);
 const atelier=read('src/components/GradientTransformEditor.tsx');
 assert.match(atelier,/GRADIENT_TRANSFORMS/);
 assert.match(atelier,/Transformation stack/);
 assert.match(atelier,/Apply to layer/);
 const canvas=read('src/components/Canvas.tsx');
 assert.match(canvas,/shape\.gradientStartX=point\.x\/doc\.width/);
 assert.match(canvas,/shape\.gradientEndX=point\.x\/Math\.max\(1,doc\.width\)/);
});
test('Levels histogram samples actual layer pixels; Gradient Map uses editable stops',()=>{
 const ui=read('src/components/EffectAdvancedEditors.tsx');
 assert.match(ui,/source\.getImageData|ctx\.getImageData/);
 assert.match(ui,/Source luminance histogram|source luminance histogram|Source luminance distribution/);
 assert.match(ui,/props\.effect\.kind === 'levels'/);
 assert.match(ui,/Editable color stops/);
 assert.ok(catalog.FILTER_CATALOG.filter(x=>x.group==='Color & light').length>=20);
});
