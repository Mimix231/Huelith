'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const catalog=fs.readFileSync(path.join(root,'src/editor/effect-catalog.ts'),'utf8').split('...EXPANSION_120')[0];
const ops=fs.readFileSync(path.join(root,'src/editor/effect-ops.ts'),'utf8');
const body=ops.slice(ops.indexOf('export function applyEffect('));
const kinds=Array.from(catalog.matchAll(/\{ group: '[^']+', kind: '([^']+)', label: '([^']+)'/g),match=>({kind:match[1],name:match[2]}));
const legacy={
 boxblur:'box-blur.ts',motionblur:'motion-blur.ts',radialblur:'radial-blur.ts',lensblur:'lens-blur.ts',
 zoomblur:'shock-zoom.ts',surfaceblur:'surface-blur.ts',sharpen:'sharpen.ts',unsharp:'unsharp-mask.ts',
 clarity:'clarity.ts',texture:'texture-detail.ts',denoise:'noise-reduction.ts'
};
test('All 101 original effects have directly integrated production kernels',()=>{
 assert.equal(kinds.length,101);const sourcefiles=[];
 for(const {kind,name} of kinds){
  if(kind in legacy){
   assert.ok(fs.existsSync(path.join(root,'src/editor/effects',legacy[kind])),`${name} missing ${legacy[kind]}`);
   assert.ok(body.includes(`kind === '${kind}'`),`${name} missing early production dispatch`);
   continue;
  }
  const line=new RegExp(`if \\(kind === '${kind}'\\) return (\\w+)\\(source,effect\\);`).exec(body);
  assert.ok(line,`${name} (${kind}) not dispatched to a dedicated renderer`);
  const importer=new RegExp(`import \\{\\s*${line[1]}\\s*\\} from './effects/([^']+)'`).exec(ops);
  assert.ok(importer,`${name} missing dedicated module import`);
  const file=importer[1]+'.ts',target=path.join(root,'src/editor/effects',file);
  assert.ok(fs.existsSync(target),`${name} processor missing`);
  assert.match(fs.readFileSync(target,'utf8'),new RegExp(`export function ${line[1]}\\(`));
  sourcefiles.push(file);
  const fallback=body.indexOf('if (AURORA_NEW_KINDS.has(kind))');
  assert.ok(body.indexOf(line[0])<fallback,`${name} is incorrectly behind the legacy fallback`);
 }
 assert.equal(sourcefiles.length,90);
 assert.equal(new Set(sourcefiles).size,90,'two independent legacy effect IDs share a processor source file');
});
test('Expansion-120 remains intact and preview/export share the same dispatcher',()=>{
 const text=fs.readFileSync(path.join(root,'src/editor/expansion-120.ts'),'utf8');
 assert.match(text,/EXPANSION_120/);assert.match(body,/renderExpansion120\(source,effect\)/);
 const worker=fs.readFileSync(path.join(root,'src/editor/effects-worker.ts'),'utf8');
 const cache=fs.readFileSync(path.join(root,'src/editor/effect-stack-cache.ts'),'utf8');
 assert.match(worker,/stackCache\.renderCooperatively/);
 assert.match(cache,/import \{ applyEffect \} from '\.\/effect-ops'/);
});
