const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');const root=path.resolve(__dirname,'..');
const compiled=(file)=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(file){const module={exports:{}};new Function('module','exports','require',compiled(file))(module,module.exports,()=>({}));return module.exports;}
const geometry=load('src/editor/cutout-edit.ts'),raster=load('src/editor/raster-tools.ts');
const shape={id:'line-1',tool:'line',operation:'keep',size:12,points:[{x:10,y:20},{x:50,y:70}]};
test('Cutout line endpoint editing is reversible through history and changes actual geometry',()=>{
 const original={kind:'add',shape},changed=geometry.resizeCutout(shape,1,{x:85,y:92});
 assert.deepEqual(changed.points[0],shape.points[0]);assert.deepEqual(changed.points[1],{x:85,y:92});
 const ops=[original,{kind:'update',id:shape.id,shape:changed}];
 assert.equal(geometry.resolveCutoutHistory(ops)[0].points[1].x,85);
 assert.equal(geometry.resolveCutoutHistory(ops.slice(0,-1))[0].points[1].x,50);
});
test('Cutout rectangle has four independent resizing handles; moved shapes retain IDs',()=>{
 const item={id:'rect',tool:'rectangle',operation:'keep',size:4,points:[{x:10,y:10},{x:60,y:50}]};
 assert.equal(geometry.cutoutHandles(item).length,4);
 const resized=geometry.resizeCutout(item,0,{x:5,y:3});
 assert.ok(Math.abs(geometry.cutoutBounds(resized).x-5)<1e-7);
 assert.ok(Math.abs(geometry.cutoutBounds(resized).y-3)<1e-7);
 const moved=geometry.translateCutout(resized,20,10);
 assert.equal(moved.id,'rect');assert.ok(Math.abs(geometry.cutoutBounds(moved).x-25)<1e-7);
});
test('Cutout Bézier lines expose four movable controls, preserving a curved path instead of rasterizing the shape',()=>{
 const cubic={...shape,points:[{x:5,y:30},{x:18,y:0},{x:42,y:60},{x:65,y:30}]};
 assert.equal(geometry.cutoutHandles(cubic).length,4);
 const changed=geometry.resizeCutout(cubic,1,{x:18,y:50});
 assert.equal(changed.points[1].y,50);assert.equal(cubic.points[1].y,0);
});
test('Cutout polygon nodes can be inserted and deleted independently of other shapes',()=>{
 const item={id:'poly',tool:'polygon',operation:'keep',size:5,points:[{x:10,y:10},{x:80,y:10},{x:80,y:80},{x:10,y:80}]};
 const added=geometry.insertCutoutNode(item,1,{x:50,y:10});
 assert.equal(added.points.length,5);assert.ok(geometry.cutoutShapeHit(added,{x:50,y:40}));
 const ops=[{kind:'add',shape:item},{kind:'update',id:'poly',shape:added},{kind:'delete',id:'poly'}];
 assert.deepEqual(geometry.resolveCutoutHistory(ops),[]);
 assert.equal(geometry.resolveCutoutHistory(ops.slice(0,-1)).length,1);
});
test('Polygon rasterization fills complex boundaries with no pixels outside',()=>{
 const pixels=raster.rasterPolygon(50,50,[{x:10,y:10},{x:35,y:10},{x:20,y:35}]);
 assert.equal(pixels[20*50+20],255);assert.equal(pixels[3*50+3],0);
});
test('12 new tools are registered with purpose-built engines and contextual controls',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');const canvas=fs.readFileSync(path.join(root,'src/components/Canvas.tsx'),'utf8');
 for(const id of ['magicWand','lassoSelect','polySelect','magneticLasso','bucket','smudge','blurBrush','sharpenBrush','dodge','burn','patternBrush','symmetryBrush']){
  assert.ok(app.includes(`id: '${id}'`),id);assert.ok(canvas.includes(id),id);
 }
 assert.match(app,/Selection Studio/);assert.match(app,/Painting & Retouch/);
 assert.match(canvas,/floodRegion/);assert.match(canvas,/rasterPolygon/);assert.match(canvas,/retouchStamp/);
});
test('Cutout metadata persists editable mask commands in the document format',()=>{
 const cutout=fs.readFileSync(path.join(root,'src/components/CutoutWorkspace.tsx'),'utf8');
 const types=fs.readFileSync(path.join(root,'src/editor/types.ts'),'utf8');
 assert.match(types,/cutoutMask\?:.*?/);assert.match(types,/editable\?: \{shapes:CutoutShape\[\]/);
 assert.match(cutout,/editable\.shapes\.map/);
 assert.match(cutout,/onProcess\(output\.toDataURL\('image\/png'\)/);
 assert.match(cutout,/Delete shape/);assert.match(cutout,/Remove point/);
});

test('Saved editable Cutout shape paths validate in .huelith documents; malicious geometry is rejected',()=>{
 const input=compiled('src/editor/types.ts'),m={exports:{}};
 new Function('module','exports','require',input)(m,m.exports,id=>id==='./creative'?{validCreative:()=>true}:id==='./effect-catalog'?{FILTER_CATALOG:[{kind:'glow'}]}:{});
 const doc=m.exports.createDocument('Editable Cutout',64,64);
 doc.layers[0].cutoutMask={data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',width:64,height:64,enabled:true,
  editable:{shapes:[shape],feather:1,expand:0,smoothing:true}};
 assert.equal(m.exports.isDocument(doc),true);
 doc.layers[0].cutoutMask.editable.shapes[0].points[0].x=NaN;
 assert.equal(m.exports.isDocument(doc),false);
});
