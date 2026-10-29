const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const transpiled=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const source=transpiled('src/editor/ink-engine.ts');const mod={exports:{}};
new Function('module','exports','require',source)(mod,mod.exports,()=>({}));
const ink=mod.exports;
const cfg={size:20,opacity:1,flow:1,spacing:.1,taper:.2,pressureSize:true,pressureOpacity:false,color:'#8451ff'};

test('Continuous ink: smooth geometry preserves actual first and last input coordinates',()=>{
 const original=[{x:1,y:4,pressure:.3},{x:8,y:10,pressure:.9},{x:21,y:2,pressure:.8},{x:45,y:15,pressure:.4}];
 const curve=ink.smoothInkPoints(original,2);
 assert.deepEqual(curve[0],original[0]);assert.deepEqual(curve.at(-1),original.at(-1));
 assert.ok(curve.length>original.length);
 assert.equal(original[1].x,8); // the sampled gesture stays immutable
});
test('Continuous ink: all tapered widths are finite, positive and pressure-sensitive',()=>{
 const middle=ink.inkWidth(10,21,1,cfg),ends=ink.inkWidth(0,21,1,cfg);
 assert.ok(ends<middle);assert.ok(ends>0);
 assert.ok(ink.inkWidth(10,21,.2,cfg)<middle);
 for(let i=0;i<21;i++)assert.ok(Number.isFinite(ink.inkWidth(i,21,.8,cfg)));
});
test('Continuous ink: untapered strokes retain consistent diameter and pressure toggle works',()=>{
 const untapered={...cfg,taper:0,pressureSize:false};
 assert.equal(ink.inkWidth(0,15,.2,untapered),ink.inkWidth(8,15,1,untapered));
});
test('Continuous ink: high-speed pointer movement is filled without gaps and maintains pressure interpolation',()=>{
 const points=ink.interpolateInkSamples({x:0,y:0,pressure:.2},{x:110,y:0,pressure:1},4);
 assert.ok(points.length>=27);
 assert.equal(points.at(-1).x,110);assert.equal(points.at(-1).pressure,1);
 assert.ok(points[0].pressure<points.at(-1).pressure);
 for(let i=1;i<points.length;i++)assert.ok(points[i].x-points[i-1].x<=4.01);
});
test('Brush library: 6 distinct presets, distinct engine families and bounded defaults',()=>{
 assert.equal(ink.INK_PRESETS.length,6);
 assert.equal(new Set(ink.INK_PRESETS.map(item=>item.id)).size,6);
 assert.ok(ink.INK_PRESETS.some(item=>item.engine==='ink'));
 assert.ok(ink.INK_PRESETS.some(item=>item.engine==='paint'));
});
test('Canvas: ink is a dedicated tool with pressure, full continuous fill and one history commit',()=>{
 const canvas=fs.readFileSync(path.join(root,'src/components/Canvas.tsx'),'utf8');
 const store=fs.readFileSync(path.join(root,'src/editor/store.ts'),'utf8');
 for(const fragment of ['drawInkContour','interpolateInkSamples','paintInkGesture','inkPoints:isInk','commitDrawing(current)',"tool === 'ink'",'getCoalescedEvents','requestAnimationFrame'])assert.ok(canvas.includes(fragment),fragment);
 for(const fragment of ['brushFlow','brushSpacing','inkTaper','pressureSize','pressureOpacity','applyBrushPreset'])assert.ok(store.includes(fragment),fragment);
 assert.match(canvas,/const image = current.canvas.toDataURL\('image\/png'\)/);
});
test('Brush Atelier: theme aware controls and persistent saved presets, no generic confirm/prompt',()=>{
 const ui=fs.readFileSync(path.join(root,'src/components/BrushStudio.tsx'),'utf8');
 const css=fs.readFileSync(path.join(root,'src/components/BrushStudio.css'),'utf8');
 for(const text of ['Continuous Ink','Raster Paint','Pressure controls stroke width','End taper','Flow','Spacing','huelith-brush-presets-v1'])assert.ok(ui.includes(text));
 for(const token of ['var(--accent)','var(--panel-bg)','var(--text)','var(--surface-input)'])assert.ok(css.includes(token),token);
 assert.doesNotMatch(ui,/window\.prompt|window\.confirm/);
});
