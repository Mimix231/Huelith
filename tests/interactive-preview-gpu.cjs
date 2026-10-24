/** Exercises the *new* Studio provisional renderer in an actual Chromium GPU context. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const moduleText = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/editor/live-preview-mixer.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const result = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'interactive-preview-gpu.py')], {
  input: moduleText, encoding: 'utf8', maxBuffer: 1024 * 1024 * 4,
});
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
