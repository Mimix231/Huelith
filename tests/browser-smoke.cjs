/** Integration smoke test: browser bundle + Python Playwright + Chromium. */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { browserGlobal, workerModule } = require('./browser-bundle.cjs');

const script = browserGlobal('HuelithTest', [
  'types', 'creative', 'creative-render', 'animation', 'geometry', 'render',
  'effect-ops', 'fx', 'preview-quality', 'brush', 'clipboard', 'store',
]) + `\nwindow.HuelithBundledModules = ${JSON.stringify({
  fx: workerModule('fx'),
  'effects-worker': workerModule('effects-worker'),
})};`;

const executable = process.env.PYTHON ?? 'python3';
const result = spawnSync(executable, [path.join(__dirname, 'browser-smoke.py')], {
  input: script,
  encoding: 'utf8',
  maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exit(result.status ?? 1);
