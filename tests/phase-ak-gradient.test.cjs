const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const cache=new Map();
function load(name){name=name.replace(/^\.\//,'');if(cache.has(name))return cache.get(name);
 const file=path.join(root,'src/editor',name+'.ts');
 const source=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};cache.set(name,module.exports);
 new Function('module','exports','require',js)(module,module.exports,id=>load(id));
 cache.set(name,module.exports);return module.exports;
}
const transforms=load('gradient-transforms'),gradient=load('gradient'),types=load('types');
const base={kind:'gradient',id:'g',x:0,y:0,width:320,height:240,fill:'none',stroke:'none',strokeWidth:0,
 gradientStops:[{id:'a',color:'#5511dd',opacity:1,position:0},{id:'b',color:'#ffdb38',opacity:1,position:1}],gradientMode:'linear'};
const settings={amount:100,frequency:2,count:15,phase:0,seed:9,centerX:.5,centerY:.5};

test('Phase AK: categorized procedural transforms have unique identifiers and descriptions',()=>{
 assert.ok(transforms.GRADIENT_TRANSFORMS.length>=25);
 assert.equal(new Set(transforms.GRADIENT_TRANSFORMS.map(t=>t.id)).size, transforms.GRADIENT_TRANSFORMS.length);
 for(const def of transforms.GRADIENT_TRANSFORMS){assert.ok(def.name&&def.description&&def.category)}
});
test('Phase AK: every transform returns finite coordinates or fields, including edges',()=>{
 for(const entry of transforms.GRADIENT_TRANSFORMS){
  for(const [x,y] of [[0,0],[.5,.5],[1,1],[.33,.71]]){
   const result=transforms.transformGradient(entry.id,x,y,settings);
   assert.ok(Number.isFinite(result.x)&&Number.isFinite(result.y),entry.id);
   if(result.field!==undefined)assert.ok(Number.isFinite(result.field),entry.id);
  }
 }
});
test('Phase AK: transformation intensity 0 is a true identity operation',()=>{
 for(const entry of transforms.GRADIENT_TRANSFORMS){
  const result=transforms.transformGradient(entry.id,.3,.42,{...settings,amount:0});
  assert.deepEqual(result,{x:.3,y:.42},entry.id);
 }
});
test('Phase AK: every transformation changes evaluated gradient pixels',()=>{
 const baseline=Array.from({length:16},(_,i)=>[.08+(i%4)*.235,.1+Math.floor(i/4)*.235]);
 for(const entry of transforms.GRADIENT_TRANSFORMS.filter(item=>item.id!=='none')){
  const original=baseline.map(([x,y])=>gradient.gradientSample(base,x,y).slice(0,3).map(v=>Math.round(v)).join(','));
  const transformed=baseline.map(([x,y])=>gradient.gradientSample({...base,gradientTransform:entry.id},x,y).slice(0,3).map(v=>Math.round(v)).join(','));
  assert.ok(original.some((value,i)=>value!==transformed[i]),entry.id+' did not change pixels');
 }
});
test('Phase AK: strength slider is continuous instead of jumping to a full effect at 1%',()=>{
 const point=[.29,.64];const original=gradient.gradientSample(base,...point);
 for(const recipe of transforms.GRADIENT_TRANSFORMS.filter(item=>item.id!=='none')){
  const near=gradient.gradientSample({...base,gradientTransform:recipe.id,gradientTransformAmount:1},...point);
  const error=Math.max(...near.slice(0,3).map((v,i)=>Math.abs(v-original[i])));
  assert.ok(error<15,`${recipe.id}: 1% strength jumped by ${error} RGB units`);
 }
});
test('Phase AK: stroke direction is projected onto user-drawn canvas guide',()=>{
 const leftRight={...base,gradientStartX:.1,gradientStartY:.2,gradientEndX:.9,gradientEndY:.2};
 const topBottom={...base,gradientStartX:.2,gradientStartY:.1,gradientEndX:.2,gradientEndY:.9};
 assert.notDeepEqual(gradient.gradientSample(leftRight,.8,.2), gradient.gradientSample(topBottom,.8,.2));
 assert.deepEqual(gradient.gradientSample(leftRight,.1,.2).slice(0,3),[85,17,221]);
 assert.deepEqual(gradient.gradientSample(leftRight,.9,.2).slice(0,3),[255,219,56]);
});
test('Phase AK: gradient and transform settings survive document validation',()=>{
 const doc=types.createDocument('Gradient AK',320,240);
 const vector=types.makeVector('Editable gradient');
 vector.shapes=[{...base,gradientStartX:.2,gradientStartY:.2,gradientEndX:.8,gradientEndY:.8,
   gradientTransform:'celestialWeave',gradientTransformAmount:45,gradientTransformCount:33}];
 doc.layers.push(vector);
 assert.equal(types.isDocument(JSON.parse(JSON.stringify(doc))),true);
 vector.shapes[0].gradientTransform='not-a-real-transform';
 assert.equal(types.isDocument(doc),false);
});
test('Phase AK upgraded: canvas drag creates a dedicated gradient layer, keeps guides and avoids the legacy studio',()=>{
 const canvas=fs.readFileSync(path.join(root,'src/components/Canvas.tsx'),'utf8');
 const ui=fs.readFileSync(path.join(root,'src/components/GradientDesignerToolbar.tsx'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 assert.match(canvas,/shape\.x=0; shape\.y=0; shape\.width=doc\.width;shape\.height=doc\.height/);
 assert.match(canvas,/kind:'gradient-guide'/);
 assert.match(canvas,/state\.setTool\(shape\.kind === 'gradient' \? 'gradient'/);
 assert.match(ui,/GradientTransformEditor/);
 assert.match(canvas,/state.addGradientLayer\(shape\)/);
 const atelier=fs.readFileSync(path.join(root,'src/components/GradientTransformEditor.tsx'),'utf8');
 assert.match(atelier,/huelith-gradient-presets-v1/);
 assert.doesNotMatch(app,/GradientControls|huelith:gradient-open/);
});
