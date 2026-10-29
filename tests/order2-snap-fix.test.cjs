const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'../src/editor'),loaded=new Map();
function load(name){if(loaded.has(name))return loaded.get(name);
 const file=path.join(root,`${name}.ts`),mod={exports:{}};loaded.set(name,mod.exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('module','exports','require','structuredClone',code)(mod,mod.exports,dep=>load(dep.replace(/^\.\//,'')),structuredClone);
 loaded.set(name,mod.exports);return mod.exports;
}
const ops=load('operations'),scale=load('smart-scale');
const doc={width:1280,height:800,layers:[]};
const drag=(last,handle='se',keepAspect=true,rotation=0,bounds={x:100,y:120,width:280,height:160})=>({kind:'transform',mode:'scale',shapeId:null,handle,start:{x:bounds.x+bounds.width,y:bounds.y+bounds.height},last,bounds,keepAspect,rotation});
test('Ctrl+T selects whole active image layer with no modal; Ctrl+Alt+T is optional numeric editor',()=>{
 const app=fs.readFileSync(path.resolve(root,'../App.tsx'),'utf8');
 assert.match(app,/case 't':[\s\S]{0,350}current\.setTool\('move'\)/);
 assert.match(app,/current\.selectShape\(null\)/);
 assert.match(app,/if\(event\.altKey\)\{setActionMode\('transform'\)/);
 assert.doesNotMatch(app,/case 't':\s*event\.preventDefault\(\);current\.setTool\('move'\);setActionMode\('transform'\)/);
});
test('Smart scale snaps actual proportional image right edge precisely to canvas',()=>{
 const incoming=drag({x:1277,y:790});const result=scale.snapScale(incoming,doc,'image',1);
 const final=ops.resizedTransform({...incoming,last:result.point});
 assert.ok(Math.abs(final.x+final.width-1280)<.7,JSON.stringify({final,result}));
 assert.ok(Math.abs(final.width/final.height-280/160)<1e-8);
 assert.ok(result.guides.some(g=>g.axis==='x'&&g.at===1280));
});
test('Smart scale snaps actual image height to canvas bottom',()=>{
 const incoming=drag({x:1273,y:797});const result=scale.snapScale(incoming,doc,'image',1);
 const final=ops.resizedTransform({...incoming,last:result.point});
 assert.ok(Math.abs(final.y+final.height-800)<.7,JSON.stringify({final,result}));
 assert.ok(result.guides.some(g=>g.axis==='y'&&g.at===800));
});
test('Smart scale handles independent edge resizing without changing the other dimension',()=>{
 const incoming=drag({x:1277,y:280},'e',false);const result=scale.snapScale(incoming,doc,'image',1);
 const final=ops.resizedTransform({...incoming,last:result.point});
 assert.ok(Math.abs(final.x+final.width-1280)<.7,JSON.stringify({final,result}));
 assert.equal(final.height,160);
});
test('Free corner scaling snaps both right and bottom image boundaries, showing an actual (+) intersection',()=>{
 const incoming=drag({x:1277,y:797},'se',false);
 const result=scale.snapScale(incoming,doc,'image',1);
 const rect=ops.resizedTransform({...incoming,last:result.point});
 assert.ok(Math.abs(rect.x+rect.width-1280)<.7,JSON.stringify({rect,result}));
 assert.ok(Math.abs(rect.y+rect.height-800)<.7,JSON.stringify({rect,result}));
 assert.ok(result.guides.some(g=>g.axis==='x'&&g.at===1280));
 assert.ok(result.guides.some(g=>g.axis==='y'&&g.at===800));
});
test('Out-of-range pointer selections blocked; Move only begins on a hit, not anywhere',()=>{
 const canvas=fs.readFileSync(path.resolve(root,'../components/Canvas.tsx'),'utf8');
 assert.match(canvas,/if\(!onSheet\(raw\) && !isNavigation && !outsideTransform\)/);
 assert.match(canvas,/find\(item=>layerHit\(point,item\)\)/);
 assert.match(canvas,/clampToSheet\(raw\)/);
 const store=fs.readFileSync(path.join(root,'store.ts'),'utf8');assert.match(store,/snap: true/);
});
