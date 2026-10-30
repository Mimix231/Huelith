const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
test('native migration has one module per independently modeled effect',()=>{
  const modules=['pixel_sorting','manga_screentones','film_halation','anamorphic_streak'];
  for(const name of modules) assert.match(read(`src-tauri/src/aurora/native_effects/${name}.rs`), /pub fn render\(/);
  const registry=read('src-tauri/src/aurora/native_effects/mod.rs');
  for(const name of modules) assert.ok(registry.includes(`mod ${name};`));
});
test('native binary source transport validates input and raw graph response is registered',()=>{
  const lib=read('src-tauri/src/lib.rs');
  for(const name of ['aurora_register_image_raw','aurora_render_graph_bytes'])assert.ok(lib.includes(name));
  const bridge=read('src/editor/native-effect-preview.ts');
  assert.match(bridge, /Uint8Array/);assert.match(bridge,/ArrayBuffer/);
  assert.match(bridge,/experimentalNativePreviewEnabled/);
});
test('native gate is opt-in until export parity is verified',()=>{
  assert.match(read('src/editor/native-effect-preview.ts'),/=== '1'/);
  assert.equal(JSON.parse(read('scripts/obsolete-migration-files.json')).obsolete.length,0);
  assert.match(read('package.json'),/"pretauri": "node scripts\/cleanup-migrated.mjs --apply"/);
});
