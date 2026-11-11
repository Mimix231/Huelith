const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { browserGlobal } = require('./browser-bundle.cjs');

const script = browserGlobal('Creatives', ['creative', 'creative-render', 'types', 'render', 'animation']);
const result = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'creative-browser.py')], {
  input: script, encoding: 'utf8', timeout: 110000, maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exit(result.status ?? 1);
