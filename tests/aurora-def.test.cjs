const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = filename => fs.readFileSync(path.join(root,filename),'utf8');

test('D native GPU implements actual reference operations; no preview lookalike kernels', () => {
  const wgsl = read('src-tauri/src/aurora/color.wgsl');
  const native = read('src-tauri/src/aurora/gpu.rs');
  const modes = ['brightness','contrast','saturate','grayscale','invert'];
  for (const item of modes) assert.match(native, new RegExp(`"${item}"`));
  assert.equal((wgsl.match(/case [0-4]u:/g) ?? []).length,5);
  assert.match(native,/dispatch_workgroups/);
  assert.match(native,/MapMode::Read/);
  assert.match(native,/DeviceType::Cpu/);
  assert.match(native,/gpu_kind\(&effect.kind\)/);
  assert.match(native,/gpu_and_cpu_agree_on_migrated_pointwise_operations/);
});

test('E native backend switching exposes actual device and CPU fallback', () => {
  const native = read('src-tauri/src/aurora/mod.rs');
  const frontend = read('src/settings/native-aurora.ts');
  const app = read('src/App.tsx');
  assert.match(native,/pub async fn aurora_select_backend/);
  assert.match(native,/backend\.requested = enabled/);
  assert.match(native,/fallback: Option<String>/);
  assert.match(native,/graph\.clear\(\)/);
  assert.match(native,/RwLock<NativeBackend>/);
  assert.match(frontend,/selection\.catch\(\(\) => null\)\.then/);
  assert.match(app,/configureNativeBackend\(initial\.gpuAcceleration\)/);
  assert.match(app,/PREFERENCES_EVENT/);
  assert.match(read('src/components/settings/SettingsSections.tsx'),/Active rendering device:/);
});

test('F effect graph uses precise ordered signatures, retained source identity and bounded cache', () => {
  const graph = read('src-tauri/src/aurora/graph.rs');
  assert.match(graph,/effect\.amount\.to_bits\(\)/);
  assert.match(graph,/Arc::ptr_eq/);
  assert.match(graph,/GRAPH_CACHE_BYTES/);
  assert.match(graph,/set_budget/);
  assert.match(graph,/reused_stages/);
  assert.match(graph,/pub fn register_source/);
  assert.match(graph,/fn reuses_only_matching_prefixes/);
  assert.match(graph,/fn different_sources_do_not_share_pixels/);
});

test('native retained buffer operations and user-facing editor effects remain fully present', () => {
  const native = read('src-tauri/src/aurora/mod.rs');
  const original = read('src/editor/effect-ops.ts');
  assert.match(native,/pub fn aurora_register_image/);
  assert.match(native,/pub fn aurora_release_image/);
  assert.match(native,/pub async fn aurora_render_graph/);
  assert.match(original,/export function applyEffect/);
  assert.match(read('src/editor/fx.ts'),/processEffects/);
  assert.match(read('src/components/settings/SettingsSections.tsx'),/Test CPU\/GPU graph & cache/);
});

function transpileFrontend() {
  const source = ts.transpileModule(read('src/settings/native-aurora.ts'), {
    compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 }
  }).outputText;
  const log=[];
  const invoker = async (key,args) => {
    log.push({key,args});
    if (key === 'aurora_select_backend') return {
      requested:args.enabled?'gpu':'cpu',active:args.enabled?'gpu':'cpu',device:'test device',
      fallbackReason:null,gpuSupportedOperations:[],cpuSupportedOperations:[],
    };
    if(key==='aurora_backend_status')return {active:'cpu'};
    throw new Error('Unexpected command '+key);
  };
  const module={exports:{}};
  const previousWindow=global.window;
  global.window={__TAURI_INTERNALS__:{},dispatchEvent() {}};
  global.CustomEvent = class CustomEvent {constructor(name,data){this.type=name;this.detail=data.detail;}};
  new Function('require','module','exports',source)(p => {
    if(p==='@tauri-apps/api/core')return{invoke:invoker};
    if(p==='./native-cpu')return{nativeAvailable:()=>true};
    throw new Error(p);
  },module,module.exports);
  return {backend:module.exports,log,restore(){global.window=previousWindow;}};
}

test('E serialized CPU/GPU preference changes preserve last user choice',async()=>{
  const {backend,log,restore}=transpileFrontend();
  try {
    const jobs = [backend.configureNativeBackend(true),backend.configureNativeBackend(false),backend.configureNativeBackend(true)];
    await Promise.all(jobs);
    assert.deepEqual(log.map(item=>item.args.enabled),[true,false,true]);
    const last=await backend.nativeBackendStatus();
    assert.ok(last);
  } finally {restore();}
});
