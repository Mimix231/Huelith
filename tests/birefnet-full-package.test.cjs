const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Cutout uses full BiRefNet exclusively and reports HTML config fallback',()=>{
  const adapter=read('src/editor/effects/birefnet-cutout.ts');
  const workspace=read('src/components/CutoutWorkspace.tsx');
  assert.match(adapter,/const MODEL='birefnet';/);
  assert.match(adapter,/dtype:'fp32'/);
  assert.match(adapter,/allowRemoteModels=false/);
  assert.match(adapter,/HTML page/);
  assert.match(workspace,/Remove Background · BiRefNet \(Full\)/);
  assert.doesNotMatch(adapter+workspace,/birefnet-lite|BiRefNet Lite/i);
});

test('full model source and published hashes are verified, without a duplicate public model',()=>{
  const script=read('scripts/prepare-birefnet.mjs');
  const docs=read('BIREFNET-README.md');
  const vite=read('vite.config.ts');
  assert.match(script,/58f621f00f5d756097615970a88a791584600dcf7c45b18a0a6267535a1ebd3c/);
  assert.match(script,/MIN_MODEL_BYTES=750_000_000/);
  assert.match(script,/src-tauri\/resources\/models\/birefnet/);
  assert.match(script,/LICENSE\.txt/);
  assert.match(vite,/src-tauri\/resources\/models\/birefnet\/model\.onnx/);
  assert.match(vite,/createReadStream\(file\)/);
  assert.match(vite,/await link\(weights,dest\)/);
  assert.match(docs,/Full BiRefNet/);
  assert.equal(JSON.parse(read('public/models/birefnet/config.json')).model_type,'birefnet');
  assert.equal(JSON.parse(read('public/models/birefnet/preprocessor_config.json')).size.width,1024);
  assert.doesNotMatch(script+vite,/BiRefNet_lite-ONNX|birefnet-lite/);
});

test('release check fails closed without actual full model assets',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.match(pkg.scripts['desktop:build'],/verify:birefnet/);
  assert.match(pkg.scripts['release:with-birefnet'],/verify:birefnet/);
  const result=spawnSync(process.execPath,[path.join(root,'scripts/prepare-birefnet.mjs'),'--verify'],{
    cwd:root,encoding:'utf8',timeout:12000
  });
  if(fs.existsSync(path.join(root,'src-tauri/resources/models/birefnet/model.onnx'))){
    assert.equal(result.status,0,result.stderr);
  }else{
    assert.notEqual(result.status,0,'Verifier must reject installer without full model assets');
  }
});
