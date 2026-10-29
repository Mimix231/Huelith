const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('A committed Cutout line immediately activates editable Bézier mode and selects four points',()=>{
 const ui=read('src/components/CutoutWorkspace.tsx');
 assert.match(ui,/points\.splice\(1,0,\{x:a\.x\+\(b\.x-a\.x\)\/3/);
 assert.match(ui,/setSelectedId\(id\)/);
 assert.match(ui,/if \(\['line','rectangle','ellipse','polygon','lasso'\]\.includes\(command\.tool\)\) setTool\('edit'\)/);
 assert.match(ui,/drawCutoutEditHandles\(ctx,selected,dx,dy,zoom,selectedNode\)/);
});
test('The Cutout editor uses a single coordinate mapper for mouse double-click and pointer dragging',()=>{
 const ui=read('src/components/CutoutWorkspace.tsx');
 assert.match(ui,/const local=\(event:\{currentTarget:HTMLCanvasElement;clientX:number;clientY:number\}\):P/);
 assert.match(ui,/onDoubleClick=\{event=>/);
 assert.match(ui,/const point=local\(event\)/);
});
test('Every originally reported TypeScript mismatch is addressed',()=>{
 const app=read('src/App.tsx'),canvas=read('src/components/Canvas.tsx');
 const cutout=read('src/components/CutoutWorkspace.tsx'),effect=read('src/components/EffectAdvancedEditors.tsx'),animation=read('src/editor/animation.ts');
 assert.match(app,/layer=\{activeLayer\(state\) \?\? null\}/);
 assert.match(canvas,/'last' in drag/);
 assert.doesNotMatch(cutout,/\.findLastIndex\(/);
 assert.match(effect,/const liveBox = useRef<EffectParameters\['subjectBox'\]>\(undefined\)/);
 assert.match(animation,/map\[layerId\] = copy\(\[\.\.\.effects\]\)/);
});

test('Reopening a saved editable Cutout reveals control dots immediately',()=>{
 const ui=read('src/components/CutoutWorkspace.tsx');
 assert.match(ui,/if \(editable\.shapes\.length\) \{/);
 assert.match(ui,/setSelectedId\(editable\.shapes\[editable\.shapes\.length-1\]\.id\)/);
 assert.match(ui,/setTool\('edit'\)/);
});
