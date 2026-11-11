const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { browserGlobal } = require('./browser-bundle.cjs');

const js = browserGlobal('AuthoritativeFX', ['types', 'effect-ops', 'fx', 'preview-quality']);
const run = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'authoritative-effect-preview.py')], {
  input: js, encoding: 'utf8', timeout: 90000, maxBuffer: 2 * 1024 * 1024,
});
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
if (run.error) process.stderr.write(`${run.error.message}\n`);
process.exit(run.status ?? 1);
