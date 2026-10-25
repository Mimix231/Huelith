const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
const data = new Map();
global.localStorage = { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
const doc = { documentElement: { dataset: {}, classList: { contains: () => false }, style: { values: {}, setProperty(name, value) { this.values[name] = value; } } } };
global.document = doc;
global.window = { dispatchEvent() {} };
global.CustomEvent = class CustomEvent { constructor(type, detail) { this.type = type; this.detail = detail; } };
const code = ts.transpileModule(read('src/settings/preferences.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} }; new Function('module', 'exports', code)(mod, mod.exports);
const {loadPreferences, savePreferences, resetPreferences, normalizePreferences, DEFAULT_PREFERENCES} = mod.exports;

test('safe defaults and local persistence without touching project documents', () => {
  assert.deepEqual(loadPreferences(), DEFAULT_PREFERENCES);
  savePreferences({ ...DEFAULT_PREFERENCES, gpuAcceleration: false, cpuThreads: 8, canvasCheckerSize: 32 });
  assert.equal(loadPreferences().gpuAcceleration, false);
  assert.equal(loadPreferences().cpuThreads, 8);
  assert.equal(doc.documentElement.dataset.huelithDensity, 'compact');
  assert.equal(doc.documentElement.style.values['--aurora-checker-size'], '32px');
  assert.equal(resetPreferences().gpuAcceleration, true);
  assert.equal(loadPreferences().canvasCheckerSize, 16);
});

test('malformed values do not corrupt settings or crash startup', () => {
  const value = normalizePreferences({ cpuThreads: Infinity, memoryCacheMb: -50, brushStabilization: -1, canvasCheckerSize: 11, interfaceDensity: 'huge', gpuAcceleration: 'false' });
  assert.equal(value.cpuThreads, 0);
  assert.equal(value.memoryCacheMb, 64);
  assert.equal(value.brushStabilization, 0);
  assert.equal(value.canvasCheckerSize, 16);
  assert.equal(value.interfaceDensity, 'compact');
  assert.equal(value.gpuAcceleration, true);
  data.set('huelith-aurora-preferences-v1', '{not-json');
  assert.deepEqual(loadPreferences(), DEFAULT_PREFERENCES);
});

test('diagnostics preference drives the existing FPS monitor', () => {
  savePreferences({ ...DEFAULT_PREFERENCES, diagnostics: true });
  assert.equal(data.get('huelith:perf'), '1');
  savePreferences({ ...DEFAULT_PREFERENCES, diagnostics: false });
  assert.equal(data.get('huelith:perf'), '0');
});

test('native API is explicit, retains sources, and never silently replaces legacy effects', () => {
  const api = read('src/settings/native-cpu.ts');
  const native = read('src-tauri/src/aurora/mod.rs');
  const tauri = read('src-tauri/src/lib.rs');
  assert.match(api, /aurora_register_image/);
  assert.match(api, /aurora_render_cpu/);
  assert.match(api, /aurora_release_image/);
  assert.match(native, /std::thread::scope/);
  assert.match(native, /fn cpu_blur/);
  assert.match(native, /mod tests/);
  assert.match(tauri, /aurora::aurora_render_cpu/);
  assert.doesNotMatch(read('src/editor/fx.ts'), /aurora_render_cpu/, 'Legacy processors must not be silently replaced before parity testing');
});
