/** The effect dispatcher stays active after extracting its legacy kernels.
 * Migration cleanup must never delete it, and native worker cache budgets
 * must govern the actual dedicated processors, not abandoned functions.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('effect-ops remains the live dispatcher, with no duplicate abandoned kernels', () => {
  const ops = read('src/editor/effect-ops.ts');
  assert.match(ops, /export function applyEffect\(/);
  assert.match(read('src/editor/effect-stack-cache.ts'), /import \{ applyEffect \} from '\.\/effect-ops'/);
  for (const stale of [
    'function filtered(', 'function detailEffect(', 'function silhouetteEffect(',
    'function removeCornerBackground(', 'function smartSubjectCutout(',
    'function applyBackgroundMask(', 'function chromaticShift(',
    'function vhsTracking(', 'function digitalGlitch(',
    'function shadowEffect(', 'function auroraEffect(',
    'function burstEffect(', 'function backdropEffect(',
  ]) assert.ok(!ops.includes(stale), `Obsolete duplicate processor remained: ${stale}`);
  assert.match(ops, /renderNeonEdges\(source,effect\)/);
  assert.match(ops, /renderLayerCutout\(source,effect\)/);
});

test('worker cache settings affect active processors, not removed caches', () => {
  const ops = read('src/editor/effect-ops.ts');
  const worker = read('src/editor/effects-worker.ts');
  assert.match(ops, /export \{ setEdgeCacheBudget \} from '\.\/effects\/edge-field'/);
  assert.match(ops, /export \{ setSilhouetteCacheBudget \} from '\.\/effects\/layer-distance'/);
  assert.match(worker, /setEdgeCacheBudget\(event.data.edgeMb/);
  assert.match(worker, /setSilhouetteCacheBudget\(event.data.silhouetteMb/);
  assert.match(read('src/editor/effects/neon-edges.ts'), /getNeonEdgeStrength\(source,d,w,h\)/);
  assert.match(read('src/editor/effects/edge-field.ts'), /isImmutableEffectSource\(source\)/);
  assert.match(read('src/editor/effects/layer-distance.ts'), /while\(bytes>maxBytes/);
});

test('obsolete cleanup leaves active rendering code intact', () => {
  const manifest = JSON.parse(read('scripts/obsolete-migration-files.json'));
  assert.ok(!manifest.obsolete.includes('src/editor/effect-ops.ts'));
  const cleanup = read('scripts/cleanup-migrated.mjs');
  assert.match(cleanup, /protectedEntrypoints\.has\(rel\)/);
  const dryRun = cp.spawnSync(process.execPath, ['scripts/cleanup-migrated.mjs', '--dry-run'], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /would remove 0/);
});
