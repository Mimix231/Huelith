const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root=path.resolve(__dirname,'..');
const read = name=>fs.readFileSync(path.join(root,name),'utf8');
function load(name, dependencies={}) {
 const code=ts.transpileModule(read(name), {fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',code)((id)=>{if(!(id in dependencies))throw Error(`Missing module: ${id}`);return dependencies[id]},mod,mod.exports);
 return mod.exports;
}
const schema=load('src/editor/effect-schema.ts');
const presetStore=new Map();
global.localStorage={getItem:key=>presetStore.get(key)??null,setItem:(key,value)=>presetStore.set(key,value)};
let counter=0;
const fx=load('src/editor/fx.ts', {
 './canvas-surface': {}, './types':{uid:()=>`preset-${++counter}`}, './effect-catalog':{
  FILTER_CATALOG:[{kind:'glow',initial:22},{kind:'outline',initial:10},{kind:'cutout',initial:38}],
  FILTER_CONTROL_MAP:{glow:{min:0,max:100},outline:{min:0,max:100},cutout:{min:0,max:150}}
 }, './effect-ops':{}, './effect-schema':schema,'./preview-quality':{},
});
const recipes=load('src/editor/studio-presets.ts', {'./fx':{newEffect:fx.newEffect}});

test('N: all seven Effects-tab tools retain independent controls',()=>{
 for(const kind of ['cutout','outline','glow','shadow','backdrop','radiance','miasma']) {
  assert.ok(Array.isArray(schema.EFFECT_PARAMETER_SCHEMA[kind]),kind);
  assert.ok(schema.defaultParameters(kind));
 }
 assert.equal(schema.defaultParameters('outline').outlineStyle,'neon');
 assert.equal(schema.defaultParameters('glow').glowMode,'outer','existing glow defaults preserved');
 assert.equal(schema.defaultParameters('backdrop').backdropMode,'solid');
 assert.equal(schema.defaultParameters('cutout').decontaminate,0);
 assert.equal(schema.defaultParameters('miasma').windX,0);
 assert.equal(schema.defaultParameters('radiance').raySpread,100);
});
test('N: transparent edge, dual outline and procedural field controls exist in actual renderer source',()=>{
 assert.match(read('src/editor/effect-ops.ts'),/renderSubjectOutline\(source, effect\)/);
 assert.match(read('src/editor/subject-outline.ts'),/secondaryWidth/);
 assert.match(read('src/editor/creative-reconstruction.ts'),/raySpread/);
 assert.match(read('src/editor/creative-reconstruction.ts'),/windX/);
 assert.match(read('src/editor/effect-ops.ts'),/createRadialGradient\(0, 0/);
 assert.match(read('src/editor/effect-ops.ts'),/style === 'perspective'/);
});
test('O: recipes retain effect ID and stack identity; reset restores the original kind',()=>{
 const effect={...fx.newEffect('glow'),id:'same-layer-effect',studioGroupId:'chain',studioPreset:'custom FX',color:'#123456'};
 effect.parameters.softness=73;
 assert.ok(recipes.saveStudioRecipe(effect,'Purple bloom'));
 const saved=recipes.studioRecipes('glow');
 assert.equal(saved.length,1);
 assert.equal(saved[0].parameters.softness,73);
 const loaded=recipes.applyStudioRecipe({...effect,amount:4},saved[0]);
 assert.equal(loaded.id,'same-layer-effect');
 assert.equal(loaded.studioGroupId,'chain');
 assert.equal(loaded.studioPreset,'custom FX');
 assert.equal(loaded.parameters.softness,73);
 const reset=recipes.resetStudioEffect(loaded);
 assert.equal(reset.id,'same-layer-effect');
 assert.equal(reset.parameters.glowMode,'outer');
 assert.equal(reset.amount,22);
 assert.equal(recipes.applyStudioRecipe(fx.newEffect('outline'), saved[0]).kind,'outline');
});
test('O: presets are bounded and invalid storage fails safely',()=>{
 global.localStorage.getItem=()=>'{malformed json';
 assert.deepEqual(recipes.studioRecipes('glow'),[]);
 global.localStorage.getItem=key=>presetStore.get(key)??null;
 assert.ok(recipes.studioRecipes('glow').length===1);
});
test('P: no cheap approximation path is reintroduced by phase N',()=>{
 assert.doesNotMatch(read('src/editor/effect-ops.ts'),/paintGpuEffectDraft/);
 assert.match(read('src/editor/fx.ts'),/current = applyEffect\(current, effect\)/);
 assert.match(read('src/components/FxStudio.tsx'),/studio-compare-hold/);
 assert.match(read('src/components/FxStudio.tsx'),/showAdvanced/);
});
