const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function moduleFrom(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const transpiled = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS}}).outputText;
  const scope={exports:{}, document:undefined, Map, Math, JSON, require:(name)=>{if(name === './gradient-transforms') return moduleFrom('src/editor/gradient-transforms.ts'); if(name === './gradient-patterns') return moduleFrom('src/editor/gradient-patterns.ts'); throw new Error('Unexpected import '+name);}};
  vm.runInNewContext(transpiled,scope,{filename:file});
  return scope.exports;
}
const gradient = moduleFrom('src/editor/gradient.ts');
const geometry = moduleFrom('src/editor/geometry.ts');
const colors = ['#112233','#aabbcc'];
const shape = {kind:'gradient', x:10,y:10,width:100,height:100,gradientStops:[{id:'1',position:0,color:colors[0],opacity:1},{id:'2',position:1,color:colors[1],opacity:1}]};
test('eight distinct gradient types are implemented as vector data',()=> {
  assert.deepEqual(Array.from(gradient.GRADIENT_MODES),['linear','radial','angular','reflected','diamond','spiral','freeform','mesh']);
  for(const mode of gradient.GRADIENT_MODES){
    const pixel=gradient.gradientSample({...shape,gradientMode:mode},.2,.7);
    assert.equal(pixel.length,4);
    for(const value of pixel) assert.ok(Number.isFinite(value));
  }
});
test('linear gradient preserves both color stops',()=> {
  const a=Array.from(gradient.gradientSample({...shape,gradientMode:'linear'},0,.5)).slice(0,3);
  const b=Array.from(gradient.gradientSample({...shape,gradientMode:'linear'},1,.5)).slice(0,3);
  assert.deepEqual(a,[17,34,51]);assert.deepEqual(b,[170,187,204]);
});
test('spiral gradient changes with twist while remaining opaque',()=> {
  const base=Array.from(gradient.gradientSample({...shape,gradientMode:'spiral',gradientTwist:0},.2,.8));
  const twisted=Array.from(gradient.gradientSample({...shape,gradientMode:'spiral',gradientTwist:3},.2,.8));
  assert.notDeepEqual(base,twisted);assert.equal(twisted[3],255);
});
test('mesh gradient uses its own editable color corners',()=> {
  const input={...shape,gradientMode:'mesh',gradientPoints:[
    {x:0,y:0,color:'#ff0000'},{x:1,y:0,color:'#00ff00'},{x:0,y:1,color:'#0000ff'},{x:1,y:1,color:'#ffffff'},
  ]};
  assert.deepEqual(Array.from(gradient.gradientSample(input,0,0)).slice(0,3),[255,0,0]);
  assert.deepEqual(Array.from(gradient.gradientSample(input,1,1)).slice(0,3),[255,255,255]);
});
test('freehand node conversion is valid even at zero smoothing',()=> {
  const input=[{x:0,y:0},{x:10,y:10},{x:30,y:20}];
  const nodes=geometry.smoothPath(input,0);
  assert.equal(nodes.length,3); assert.equal(nodes[0].nodeMode,'corner');
  assert.equal(nodes[1].x,10);
});
test('cubic node insertion preserves segment geometry',()=> {
  const path={kind:'path',x:0,y:0,width:100,height:100,nodes:[
    {x:0,y:0,out:{x:20,y:80}}, {x:100,y:0,in:{x:80,y:80}}
  ]};
  geometry.splitPathSegment(path,0,.5);
  assert.equal(path.nodes.length,3);
  assert.equal(path.nodes[1].x,50);assert.equal(path.nodes[1].y,60);
});
test('Shape Studio, palette, drawing, gradient controls and node editing wired',()=> {
  const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
  const canvas=fs.readFileSync(path.join(root,'src/components/Canvas.tsx'),'utf8');
  const types=fs.readFileSync(path.join(root,'src/editor/types.ts'),'utf8');
  for(const token of ['huelith-shape-menu','StudioColorPicker','huelith-color-pair','GradientDesignerToolbar','swapColors','selectedNodeIndex'])assert.ok(app.includes(token),token);
  for(const token of ["tool === 'pencil'","kind: 'gradient-point'",'splitPathSegment','smoothPath(shape.points, smoothing)'])assert.ok(canvas.includes(token),token);
  for(const token of ['gradientStops?:','gradientMode?:','speechBubble','pencil','nodeMode?']) assert.ok(types.includes(token),token);
});
