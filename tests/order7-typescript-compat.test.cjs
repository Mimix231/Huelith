const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

test('Vite client typings supply ImportMeta.glob for eager SVG URL manifests', () => {
  const env = fs.readFileSync(path.join(root,'src/vite-env.d.ts'),'utf8');
  const icons = fs.readFileSync(path.join(root,'src/components/EffectIcon.tsx'),'utf8');
  assert.match(env, /^\/\/\/ <reference types="vite\/client"\s*\/>/m);
  assert.match(icons, /import\.meta\.glob\('\.\.\/assets\/effect-icons\/atelier_\*\.svg'/);
  assert.match(icons, /eager:\s*true,\s*query:\s*'\?url',\s*import:\s*'default'/);
});

test('Motion and radial blur keep their authoritative early return without unreachable case labels', () => {
  const file = fs.readFileSync(path.join(root,'src/editor/effect-ops.ts'),'utf8');
  const apply = file.slice(file.indexOf('export function applyEffect('));
  assert.match(apply,/if \(kind === 'motionblur'\|\|kind === 'radialblur'\) return spatialBlurStable/);
  const switchBody = apply.slice(apply.indexOf('switch (kind)'));
  assert.doesNotMatch(switchBody,/case 'motionblur'\s*:/);
  assert.doesNotMatch(switchBody,/case 'radialblur'\s*:/);
  assert.match(apply,/if \(kind === 'surfaceblur'\) return renderSurfaceBlur/);
  assert.doesNotMatch(switchBody,/case 'surfaceblur'\s*:/);
  assert.match(apply,/if \(kind === 'blur'\) return renderGaussianBlur/);
  assert.doesNotMatch(switchBody,/case 'blur'\s*:/);
  const result = ts.transpileModule(file,{fileName:'effect-ops.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  assert.equal(result.diagnostics?.filter(item=>item.category === ts.DiagnosticCategory.Error).length ?? 0,0);
});
