#!/usr/bin/env node
/** Tauri startup cleanup: manifest-only, safe root containment, and a reference check.
 * By design new native .rs files DO NOT make their TS counterparts obsolete.
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
const sources=scan('src').concat(scan('src-tauri/src'),scan('scripts'),scan('tests'))
  .filter(file => file !== 'scripts/obsolete-migration-files.json');
// These are live integration points. They must never be deleted even if a
// future migration incorrectly lists them in the obsolete-file manifest.
const protectedEntrypoints = new Set([
  'src/editor/effect-ops.ts',
  'src/editor/effects-worker.ts',
  'src/editor/effect-stack-cache.ts',
  'src/editor/fx.ts',
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
  // Stop if any source mentions its exact basename (including common extensionless imports).
  const stem=rel.split('/').at(-1).replace(/\.[^.]+$/,'');
  const references=sources.filter(file=>file!==rel &&
    readFileSync(resolve(root,file),'utf8').includes(stem));
  if(references.length) {skipped.push(`${rel}: referenced by ${references.slice(0,4).join(', ')}`);continue;}
  if(apply) rmSync(absolute);
  removed.push(rel);
}
console.log(`[migration-cleanup] ${apply?'removed':'would remove'} ${removed.length}; skipped ${skipped.length}`);
for(const path of removed)console.log(`  ${apply?'Removed':'Would remove'} ${path}`);
for(const reason of skipped)console.log('  Kept '+reason);
if(skipped.some(reason=>reason.includes('referenced by')))process.exitCode=1;
