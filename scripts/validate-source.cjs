/** Offline parse pass for every application TypeScript module. Not a dependency-aware tsc replacement. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const projectRoot = path.resolve(__dirname, '..');
const files = [];
function gather(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) gather(file);
    else if (/\.tsx?$/.test(file) && !/\.d\.ts$/.test(file)) files.push(file);
  }
}
gather(path.join(projectRoot, 'src'));
let errors = 0;
for (const file of files) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    process.stderr.write(`${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}\n`);
    errors++;
  }
}
if (errors) process.exitCode = 1;
else process.stdout.write(`Source syntax pass: ${files.length} TS/TSX files, no syntax errors.\n`);
