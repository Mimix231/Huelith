const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');

test('Huelith 0.2 package, lock, native Rust and installer versions agree', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const native = JSON.parse(read('src-tauri/tauri.conf.json'));
  const rust = read('src-tauri/Cargo.toml');
  const rustLock = read('src-tauri/Cargo.lock');
  assert.equal(pkg.name, 'huelith-editor');
  assert.equal(pkg.version, '0.2.0');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(native.version, pkg.version);
  assert.equal(native.productName, 'Huelith');
  assert.equal(native.app.windows[0].title, 'Huelith');
  assert.equal(native.identifier, 'org.huelith.editor');
  assert.match(rust, /^name = "huelith"$/m);
  assert.match(rust, /^version = "0.2.0"$/m);
  assert.match(rust, /^name = "huelith_lib"$/m);
  assert.match(rustLock, /name = "huelith"\nversion = "0.2.0"/);
});

test('Huelith visible UI and native entry point are rebranded', () => {
  assert.match(read('index.html'), /Huelith — Create without limits/);
  assert.match(read('src-tauri/src/main.rs'), /huelith_lib::run\(\)/);
  assert.match(read('src/App.tsx'), /Huelith 0.2/);
  assert.match(read('src/components/FxStudio.tsx'), /Huelith Studio/);
});

test('Huelith projects are written by default but legacy formats remain accepted', () => {
  assert.match(read('src/editor/types.ts'), /format: 'huelith' \| 'spectrum'/);
  assert.match(read('src/editor/files.ts'), /extensions: \['huelith', 'spectrum'\]/);
  assert.match(read('src/editor/files.ts'), /\.huelith`/);
  assert.match(read('src/editor/types.ts'), /glowPalette\?: 'single' \| 'spectrum'/);
  assert.match(read('src/editor/effect-catalog.ts'), /label: 'Spectrum glow'/);
  assert.match(read('src/editor/fx.ts'), /'Spectrum Burst'/);
});

test('the README and changelog describe the correct release eras', () => {
  assert.match(read('README.md'), /^# 🌈 Huelith$/m);
  assert.match(read('CHANGELOG.md'), /^## 0\.2\.0 — Huelith/m);
  assert.match(read('CHANGELOG.md'), /^## 0\.1\.0 — Initial public release/m);
  assert.match(read('ACCEPTANCE.md'), /Huelith 0\.2 — Release Acceptance Checklist/);
});


test('Glow palette uses the stable serialized spectrum value after app rename', () => {
  const ui = read('src/components/EffectAdvancedEditors.tsx');
  const rendering = read('src/editor/effect-ops.ts');
  const types = read('src/editor/types.ts');
  assert.match(types, /glowPalette\?: 'single' \| 'spectrum'/);
  assert.match(ui, /value="spectrum">Spectral gradient<\/option>/);
  assert.match(ui, /palette === 'spectrum' && <GradientEditor/);
  assert.match(ui, /glowPalette: event\.target\.value as 'single' \| 'spectrum'/);
  assert.match(rendering, /effect\.parameters\?\.glowPalette === 'spectrum'/);
  assert.doesNotMatch(ui, /glowPalette: event\.target\.value as 'single' \| 'huelith'/);
});
