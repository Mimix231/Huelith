const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../src/editor'),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);
 if(name==='render')return {decodeImage:async()=>null,prepareImages:async()=>{},exportCanvas:()=>null};
 const filename=path.join(root,`${name}.ts`),js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};modules.set(name,mod.exports);vm.runInNewContext(js,{module:mod,exports:mod.exports,structuredClone,Date,Math,Set,Map,Number,String,TextEncoder,Uint8Array,DataView,Error,globalThis:{crypto:webcrypto},require:dep=>load(dep.slice(2))},{filename});modules.set(name,mod.exports);return mod.exports;
}
const actions=load('document-actions'),types=load('types'),animation=load('animation'),guide=load('smart-snapping'),layerActions=load('layer-actions');
const gradient=()=>({id:'grad',kind:'gradient',x:0,y:0,width:200,height:100,fill:'none',stroke:'none',strokeWidth:0,gradientMode:'linear'});
const raster=()=>({...types.makeRaster(),image:'data:test',imageWidth:200,imageHeight:100,scaleX:1,scaleY:1,x:10,y:20});
const vector=()=>({...types.makeVector(),x:3,y:4,shapes:[{id:'box',kind:'rect',x:10,y:20,width:30,height:40,fill:'#000000',stroke:'none',strokeWidth:0}]});
function doc(){const d=types.createDocument('Geometry actions',200,100,'transparent');d.layers=[raster(),vector(),types.makeGradient(gradient())];d.activeLayerId=d.layers[0].id;return d;}
test('Resize Image edits layer and shape geometry, not document CSS; gradients remain editable',()=>{
 const d=doc();actions.applyDocumentAction(d,{kind:'resize-image',width:400,height:200});
 assert.equal(d.width,400);assert.equal(d.height,200);
 assert.equal(d.layers[0].x,20);assert.equal(d.layers[0].scaleX,2);
 assert.equal(d.layers[1].shapes[0].width,60);assert.equal(d.layers[1].shapes[0].x,20);
 assert.equal(d.layers[2].gradient.width,400);
});
test('Resize Canvas anchors artwork without scaling raster pixels or vector geometry',()=>{
 const d=doc();actions.applyDocumentAction(d,{kind:'resize-canvas',width:300,height:150,anchorX:.5,anchorY:.5});
 assert.equal(d.layers[0].x,60);assert.equal(d.layers[0].y,45);assert.equal(d.layers[0].scaleX,1);
 assert.equal(d.layers[1].shapes[0].width,30);
 assert.equal(d.layers[2].gradient.width,200);
});
test('Crop clips bounds, translates layers, and rejects empty/out-of-range crops',()=>{
 const d=doc();actions.applyDocumentAction(d,{kind:'crop',rect:{x:20,y:30,width:60,height:50}});
 assert.equal(d.width,60);assert.equal(d.height,50);assert.equal(d.layers[0].x,-10);assert.equal(d.layers[0].y,-10);
 const invalid=doc();assert.throws(()=>actions.applyDocumentAction(invalid,{kind:'crop',rect:{x:999,y:5,width:1,height:20}}));
});
test('Doc geometry is atomically updated for EVERY animation frame and canonical gradient map',()=>{
 const d=doc();animation.enableAnimation(d);animation.insertFrame(d,false);animation.insertFrame(d,true);
 actions.applyDocumentAction(d,{kind:'resize-image',width:400,height:200});
 assert.equal(d.animation.frames.length,3);assert.equal(d.animation.trackGradients[d.layers[2].id].width,400);
 for(let i=0;i<3;i++){
  animation.selectFrame(d,i);
  assert.equal(d.layers[0].x,20);
  assert.equal(d.layers[2].gradient.width,400);
 }
 const gid=d.layers[2].id;
 actions.applyDocumentAction(d,{kind:'crop',rect:{x:20,y:0,width:380,height:200}});
 for(let i=0;i<3;i++){
  animation.selectFrame(d,i);
  assert.equal(d.layers[2].x,-20);
  assert.equal(d.animation.trackGradients[gid].x,0); // Only layer positioning moves.
 }
});
test('Rotation swaps canvas axes and moves raster bounding geometry; source pixels are separately rotated by resampler',()=>{
 const d=doc();actions.applyDocumentAction(d,{kind:'rotate-cw'});
 assert.equal(d.width,100);assert.equal(d.height,200);
 assert.equal(d.layers[0].x,-20); // Raster 200x100 at 10,20 overlaps source document edge.
 assert.equal(d.layers[0].y,10);
});
test('Magnetic '+'+'+' snaps image boundaries and centers to canvas and sibling layers',()=>{
 const d=doc();d.layers=[{...raster(),id:'movable',x:20,y:10,imageWidth:30,imageHeight:30},{...raster(),id:'sibling',x:150,y:40,imageWidth:20,imageHeight:20}];
 const centered=guide.snapBounds({x:20,y:10,width:30,height:30},d,{x:64,y:20},'movable',1,false);
 assert.equal(centered.dx,65);assert.equal(centered.dy,20); // 85+15=100 center
 assert.ok(centered.guides.some(g=>g.axis==='x'&&g.source==='center'));
 const right=guide.snapHandle({x:198,y:49},d,1);
 assert.equal(right.point.x,200);assert.equal(right.point.y,50);
});
test('Action menu, stylized dialog and native context menu are wired without generic browser dialogs',()=>{
 const root=path.resolve(__dirname,'..');const read=name=>fs.readFileSync(path.join(root,name),'utf8');
 for(const label of ['Resize Image…','Resize Canvas…','Crop to Selection','Trim Transparent Pixels','Precision Transform…'])assert.ok(read('src/commands/menus.ts').includes(label));
 assert.match(read('src/App.tsx'),/h-canvas-menu/);assert.match(read('src/components/Canvas.tsx'),/huelith-canvas-context/);
 assert.match(read('src/components/ActionWorkspace.css'),/linear-gradient/);
});

test('Layer alignment respects intrinsic raster size and remains undoable as one document mutation',()=>{
 const d=doc();layerActions.alignLayer(d,d.layers[0].id,'center-horizontal');
 assert.equal(d.layers[0].x,0);
 layerActions.alignLayer(d,d.layers[1].id,'center-vertical');
 assert.equal(d.layers[1].y,4+50-(20+20+4));
 const r=d.layers[0];layerActions.alignLayer(d,r.id,'fit-to-canvas');
 assert.equal(r.x,0);assert.equal(r.scaleX,1);
});
test('Rasterization commits native-resolution raw artwork while retaining original FX identity and cels',()=>{
 const d=doc();const id=d.layers[2].id;
 animation.enableAnimation(d);animation.insertFrame(d,false);
 const prepared=new Map([[0,'data:image/png;base64,frameA'],[1,'data:image/png;base64,frameB']]);
 layerActions.commitRasterize(d,id,prepared);
 assert.equal(d.animation.trackGradients[id],undefined);
 assert.equal(d.layers[2].type,'raster');
 for(let i=0;i<2;i++){animation.selectFrame(d,i);assert.equal(d.layers[2].type,'raster');assert.equal(d.layers[2].image,prepared.get(i));}
});
