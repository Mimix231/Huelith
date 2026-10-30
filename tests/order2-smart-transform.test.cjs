const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'../src/editor'),loaded=new Map();
function load(name){if(loaded.has(name))return loaded.get(name);
 const file=path.join(root,`${name}.ts`),mod={exports:{}};
 loaded.set(name,mod.exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('module','exports','require','structuredClone',code)(mod,mod.exports,dep=>load(path.posix.normalize(path.posix.join(path.posix.dirname(name),dep))),structuredClone);
 loaded.set(name,mod.exports);return mod.exports;}
const gradient=load('gradient'),ops=load('operations'),snap=load('smart-snapping'),types=load('types');
const stops=[{id:'black',position:0,color:'#000000',opacity:1},{id:'white',position:1,color:'#ffffff',opacity:1}];
const base={id:'burst',kind:'gradient',x:0,y:0,width:500,height:400,gradientPattern:'sunburst',gradientMode:'linear',gradientColorMode:'alternating',gradientBandCount:8,gradientRayCount:18,gradientRayWidth:.5,gradientRaySoftness:0,fill:'none',stroke:'none',strokeWidth:0,gradientStops:stops};
const variants=['diamondGrid','checkerWaves','hexFlow','interference','perspectiveBands','starburst','speedRays','pinwheel','solarRings'];
const step=kind=>({id:kind,kind,enabled:true,amount:100,frequency:2,count:11,phase:14,seed:17,centerX:.5,centerY:.5});
const scan=shape=>{
 const pixels=[];for(let y=.085;y<.95;y+=.037)for(let x=.08;x<.96;x+=.035){const rgba=gradient.gradientSample(shape,x,y);pixels.push(Math.round(rgba[0]));}
 return pixels;
};
test('AM Order 2: all nine formerly invisible transforms alter full sunburst pattern output',()=>{
 const before=scan(base);
 for(const kind of variants){const after=scan({...base,gradientTransformStack:[step(kind)]});
  let difference=0;for(let i=0;i<after.length;i++)if(Math.abs(after[i]-before[i])>10)difference++;
  assert.ok(difference>70,`${kind} only changed ${difference} sample pixels`);
 }
});
test('AM Order 2: disabled/zero-strength transformation preserves reference artwork',()=>{
 const baseline=scan(base);
 for(const kind of variants){
  assert.deepEqual(scan({...base,gradientTransformStack:[{...step(kind),enabled:false}]}),baseline,kind+' disabled');
  assert.deepEqual(scan({...base,gradientTransformStack:[{...step(kind),amount:0}]}),baseline,kind+' zero');
 }
});
test('AM Order 2: band-count changes pixels on smooth geometry and radial pattern; intended mode is contextual',()=>{
 const gradientBase={...base,gradientPattern:'smooth',gradientColorMode:'bands'};
 assert.notDeepEqual(scan({...gradientBase,gradientBandCount:3}),scan({...gradientBase,gradientBandCount:13}));
 const radial={...base,gradientColorMode:'bands'};
 assert.notDeepEqual(scan({...radial,gradientBandCount:3}),scan({...radial,gradientBandCount:27}));
 const ui=fs.readFileSync(path.join(root,'../components/GradientTransformEditor.tsx'),'utf8');
 assert.match(ui,/setColorBands/);assert.match(ui,/next\.gradientColorMode='bands'/);
 assert.doesNotMatch(ui,/<span>0[1234]<\/span>/);
});
test('AM Order 2: canvas center cross magnetic-snaps to edges, sibling boundaries and midpoints',()=>{
 const doc={width:1280,height:800,layers:[
  {...types.makeRaster(),id:'moving',x:100,y:120,imageWidth:280,imageHeight:160},
  {...types.makeRaster(),id:'other',x:870,y:380,imageWidth:200,imageHeight:80}]};
 const box={x:100,y:120,width:280,height:160};
 const centered=snap.snapBounds(box,doc,{x:399,y:199},'moving',1,false);
 assert.equal(centered.dx,400);assert.equal(centered.dy,200);
 assert.ok(centered.guides.some(g=>g.axis==='x'&&g.at===640));
 assert.ok(centered.guides.some(g=>g.axis==='y'&&g.at===400));
 const handle=snap.snapBounds({x:868,y:378,width:0,height:0},doc,{x:0,y:0},'moving',1,false);
 assert.equal(handle.dx,2);assert.equal(handle.dy,2);
 assert.ok(handle.guides.some(g=>g.source==='layer'));
});
test('AM Order 2: corner scaling respects aspect locking, Shift toggle and opposite anchor',()=>{
 const bounds={x:40,y:30,width:200,height:100};
 const action={kind:'transform',shapeId:null,mode:'scale',handle:'se',bounds,start:{x:240,y:130},last:{x:350,y:170},rotation:0,keepAspect:true};
 const locked=ops.resizedTransform(action),free=ops.resizedTransform({...action,keepAspect:false});
 assert.equal(locked.width/locked.height,2);assert.notEqual(free.width/free.height,2);
 assert.equal(locked.x,40);assert.equal(locked.y,30);
 const rotated=ops.resizedTransform({...action,rotation:45});
 assert.ok(Math.abs(rotated.width-locked.width)>2);
});
test('AM Order 2: pivot rotates raster around chosen origin rather than default bounds center',()=>{
 const original={...types.makeRaster(),x:40,y:30,imageWidth:200,imageHeight:100};
 const transformed=ops.previewDrag(original,{kind:'transform',shapeId:null,mode:'rotate',handle:'rotate',bounds:{x:40,y:30,width:200,height:100},
  pivot:{x:40,y:30},start:{x:140,y:30},last:{x:40,y:130}},1280,800);
 assert.equal(Math.round(transformed.rotation),90);
 assert.notEqual(Math.round(transformed.x),40);
 assert.equal(original.x,40);
});
test('AM Order 2: native Gradient layer scales procedurally without mutating source/flattening',()=>{
 const original=types.makeGradient({...base,x:22,y:17,width:200,height:100});original.x=5;original.y=7;
 const bounds={x:27,y:24,width:200,height:100};
 const transformed=ops.previewDrag(original,{kind:'transform',shapeId:null,mode:'scale',handle:'se',bounds,
  rotation:0,start:{x:227,y:124},last:{x:327,y:174},keepAspect:true},1280,800);
 assert.equal(transformed.type,'gradient');assert.equal(original.gradient.width,200);
 assert.equal(transformed.gradient.width,300);
 assert.equal(transformed.gradient.height,150);
 assert.equal(transformed.gradient.gradientPattern,'sunburst');
});
test('AM Order 2: live handles, persistent guides, pivot handle and numeric transform launch are wired',()=>{
 const canvas=fs.readFileSync(path.join(root,'../components/Canvas.tsx'),'utf8');
 for(const key of ['setTrackGradient','transformPivot','pivotFor','huelith-precision-transform','W ${Math.round(outline.width)}','current.keepAspect=!event.shiftKey',"snapScale({...current,kind:'transform',last:raw}"])assert.ok(canvas.includes(key),key);
 assert.match(canvas,/Math\.abs\(bounds\.x\+bounds\.width\/2-doc\.width\/2\)/);
 assert.match(canvas,/ctx\.roundRect/);
});
