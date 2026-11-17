#!/usr/bin/env node
/** Tauri startup cleanup: manifest-only, safe root containment, and runtime reference checks.
 * Only files explicitly listed in the manifest are removed. Browser-rendering
 * tests are migrated separately; they are not runtime imports.
 */
import { readFileSync, existsSync, lstatSync, realpathSync, rmSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'scripts/obsolete-migration-files.json'),'utf8'));
if (!Array.isArray(manifest.obsolete)) throw Error('Invalid cleanup manifest');
const apply=process.argv.includes('--apply');
if (process.argv.slice(2).some(arg=>!['--apply','--dry-run'].includes(arg))) throw Error('Unknown cleanup option');
function scan(folder,files=[]) {
  const path=resolve(root,folder);
  if(!existsSync(path))return files;
  for(const entry of readdirSync(path,{withFileTypes:true})) {
    if (entry.isSymbolicLink()) continue;
    const file=folder+'/'+entry.name;
    if(entry.isDirectory())scan(file,files);
    else if(entry.isFile() && /\.(ts|tsx|js|mjs|cjs|rs|json)$/.test(entry.name))files.push(file);
  }
  return files;
}
// Do not treat the manifest itself as a code reference to every path it lists.
const sources=scan('src').concat(scan('src-tauri/src'),scan('scripts'))
  .filter(file => file !== 'scripts/obsolete-migration-files.json');
// These are live integration points. They must never be deleted even if a
// future migration incorrectly lists them in the obsolete-file manifest.
const protectedEntrypoints = new Set([
  'src/editor/effect-ops.ts',
  'src/editor/effects-worker.ts',
  'src/editor/effect-stack-cache.ts',
  'src/editor/fx.ts',
  'src/editor/video/native-timeline-export.ts',
  'src/editor/video/export-timeline.ts',
  'src-tauri/src/media/native_timeline.rs',
]);
const removed=[];const skipped=[];
for (const rel of manifest.obsolete) {
  if (protectedEntrypoints.has(rel)) throw Error(`Refusing to delete active rendering entrypoint: ${rel}`);
  if(typeof rel!=='string' || !/^(src|src-tauri)\/[a-zA-Z0-9_./-]+$/.test(rel) || rel.split('/').includes('..')) throw Error('Unsafe manifest path');
  const absolute=resolve(root,rel);
  if(relative(root,absolute).startsWith('..') || !absolute.startsWith(root+sep))throw Error('Escaped project');
  if(!existsSync(absolute)) {skipped.push(`${rel}: already absent`);continue;}
  if(realpathSync(dirname(absolute)).startsWith(root+sep)===false)throw Error('Symlinked directory');
  if(!lstatSync(absolute).isFile())throw Error('Not a regular file');
  // Only actual module imports count, not incidental words in comments,
  // CSS, or unrelated modules with the same basename. Resolve references
  // against their importer so e.g. editor/effects-worker-client is distinct
  // from the retired editor/video/effects-worker-client module.
  const references=sources.filter(file=>file!==rel && existsSync(resolve(root,file)) && (()=>{
    const source=readFileSync(resolve(root,file),'utf8');
    const imports=source.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bnew\s+URL\s*\(|\bimport\s+)['"]([^'"]+)['"]/g);
    for(const match of imports){
      const name=match[1];if(!name.startsWith('.'))continue;
      const target=resolve(dirname(resolve(root,file)),name);
      if(target===absolute||['.ts','.tsx','.js','.mjs','.cjs','.rs'].some(ext=>target+ext===absolute))return true;
    }
    return false;
  })());
  if(references.length) {skipped.push(`${rel}: referenced by ${references.slice(0,4).join(', ')}`);continue;}
  if(apply) rmSync(absolute);
  removed.push(rel);
}
console.log(`[migration-cleanup] ${apply?'removed':'would remove'} ${removed.length}; skipped ${skipped.length}`);
for(const path of removed)console.log(`  ${apply?'Removed':'Would remove'} ${path}`);
for(const reason of skipped)console.log('  Kept '+reason);
if(skipped.some(reason=>reason.includes('referenced by')))process.exitCode=1;
