/** Project Fluidity source invariants complement the real pixel-level browser tests. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
test('Studio apps own Layer Effects and Signature FX; removed tabs cannot be clicked',()=>{
 const studio=read('src/components/FxStudio.tsx');
 const apps=read('src/editor/studio-apps.ts');
 assert.doesNotMatch(studio,/className="fx-studio-tabs"/);
 assert.doesNotMatch(studio,/role="tablist"/);
 assert.match(apps,/id:'layerfx',name:'Layer Effects'/);
 assert.match(apps,/id:'signature',name:'Signature FX'/);
 assert.match(studio,/appOperationCount\(item,favoriteKinds,recentKinds\)/);
 assert.match(studio,/searchAll/);
 assert.match(studio,/Applied to this layer/);
 assert.match(studio,/LAYER_EFFECTS\.some\(layerItem/);
});
test('Native spatial blurs own exact GPU pass, alpha-aware CPU and bounded ROI',()=>{
 const kernels=read('src/editor/effects/spatial-gpu.ts');
 const roi=read('src/editor/effects/alpha-roi.ts');
 const compositor=read('src/editor/blur-luminance.ts');
 assert.match(kernels,/UNPACK_PREMULTIPLY_ALPHA_WEBGL/);
 assert.match(kernels,/uFocus/);
 assert.match(kernels,/uMode/);
 assert.match(kernels,/userAllowsGpu/);
 assert.match(roi,/cw\*ch>w\*h\*\.78/);
 assert.match(roi,/focusRadius:/);
 assert.match(compositor,/renderSpatialRoi\(source,effect,mode,process\)/);
});
test('Renderer honors GPU acceleration preference and retains CPU fallback',()=>{
 const client=read('src/editor/effects-worker-client.ts');
 const worker=read('src/editor/effects-worker.ts');
 assert.match(client,/gpuAcceleration: savedGpuAcceleration\(\)/);
 assert.match(worker,/setSpatialGpuEnabled\(event\.data\.gpuAcceleration !== false\)/);
 for(const name of ['motion-blur','radial-blur','lens-blur','sharpen','unsharp-mask','clarity','texture-detail','surface-blur','noise-reduction','shock-zoom'])
  assert.ok(fs.existsSync(path.join(root,`src/editor/effects/${name}.ts`)),`${name} needs its own source`);
});
