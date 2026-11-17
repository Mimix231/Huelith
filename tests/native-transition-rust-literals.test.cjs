// Prevent malformed Rust numeric literals from breaking native video export.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const sources=[
  'src-tauri/src/media/native_timeline/authored_transition.rs',
  'src-tauri/src/media/native_timeline/authored_transition/fx.rs',
];
for(const name of sources){
  test(`${name}: no leading-dot fractional literals`,()=>{
    const content=fs.readFileSync(path.join(root,name),'utf8');
    const invalid=/(?<![A-Za-z_\d.])\.\d+/g;
    const matches=[...content.matchAll(invalid)];
    assert.deepEqual(matches.map(m=>({literal:m[0],line:content.slice(0,m.index).split('\n').length})),[],
      'Rust requires a whole-number part before the decimal point (0.5 rather than .5).');
  });
}
test('transition color and mask constants retain their values',()=>{
  const fx=fs.readFileSync(path.join(root,sources[1]),'utf8');
  const authored=fs.readFileSync(path.join(root,sources[0]),'utf8');
  assert.match(fx,/0\.2126/);
  assert.match(fx,/0\.7152/);
  assert.match(fx,/0\.0722/);
  assert.match(authored,/mask_coverage\("horizontal",0\.2,0\.1,0\.5,0\.5\)/);
});
