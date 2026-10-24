#!/usr/bin/env node
/**
 * Spectrum 0.1 obsolete-source cleanup.
 * Default is a dry run. --apply deletes only explicitly identified legacy paths
 * or source backup/reject files, never current .ts/.tsx/.css files or dependencies.
 * No recursive directory deletion, shell globbing or external filesystem traversal.
 */
import { existsSync, lstatSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const knownObsolete = Object.freeze([
  'src/components/LegacyWelcome.tsx',
  'src/components/OldFxPanel.tsx',
  'src/editor/legacy-renderer.ts',
  'src/editor/obsolete-frame-cache.ts',
  'src/styles/legacy-welcome.css',
  'src/styles/old-fx.css',
  'src/components/LegacyCanvas.tsx',
  'src/editor/obsolete.ts',
  'src/editor/live-gpu-effects.ts',
  'src/editor/live-preview-mixer.ts',
  'src/editor/live-color-lut.ts',
]);

const scanRoots = ['src', 'scripts', 'tests'];
const candidates = new Set(knownObsolete);
const backupSuffix = /(?:\.bak|\.old|\.orig|\.rej|\.tmp|~)$/i;
const apply = process.argv.includes('--apply');
const allowedFlags = new Set(['--apply', '--dry-run', '--list']);
const unknownFlags = process.argv.slice(2).filter(flag => !allowedFlags.has(flag));
if (unknownFlags.length) {
  process.stderr.write(`Unknown options: ${unknownFlags.join(', ')}\n`);
  process.exitCode = 2;
} else {
  /** Traverse source directories but never follow symbolic links. */
  function discover(dir) {
    const full = resolve(root, dir);
    if (!existsSync(full)) return;
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) discover(name);
      else if (entry.isFile() && backupSuffix.test(entry.name)) candidates.add(name);
    }
  }
  scanRoots.forEach(discover);

  const found = [];
  let absent = 0;
  for (const name of [...candidates].sort()) {
    if (isAbsolute(name) || name.includes('..') || name.includes('\\')) throw new Error(`Unsafe cleanup entry: ${name}`);
    const full = resolve(root, name);
    if (!full.startsWith(root + sep) || relative(root, full).startsWith('..')) throw new Error(`Path escaped project: ${name}`);
    if (!existsSync(full)) {
      absent++;
      continue;
    }
    const parent = realpathSync(dirname(full));
    if (parent !== root && !parent.startsWith(root + sep)) throw new Error(`External symlink parent: ${name}`);
    const stat = lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not an ordinary file: ${name}`);
    if (apply) rmSync(full);
    found.push(name);
  }
  process.stdout.write(`${apply ? 'Applied' : 'Dry run'}: ${found.length} obsolete file(s) ${apply ? 'deleted' : 'identified'}; ${absent} known legacy paths absent.\n`);
  for (const name of found) process.stdout.write(`  ${apply ? 'Removed' : 'Would remove'}: ${name}\n`);
  if (!apply) process.stdout.write('No files changed. Run npm run clean:obsolete to explicitly apply cleanup.\n');
}
