const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const project = path.resolve(__dirname, '..');
const files = [
  'src/App.tsx', 'src/main.tsx',
  ...fs.readdirSync(path.join(project, 'src/components')).filter(name => name.endsWith('.tsx'))
    .map(name => `src/components/${name}`),
  ...fs.readdirSync(path.join(project, 'src/editor')).filter(name => name.endsWith('.ts'))
    .map(name => `src/editor/${name}`),
  'vite.config.ts',
];

test('all TS/TSX entry points parse successfully', () => {
  for (const name of files) {
    const fullPath = path.join(project, name);
    const source = ts.createSourceFile(fullPath, fs.readFileSync(fullPath, 'utf8'),
      ts.ScriptTarget.ES2022, true, name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.equal(source.parseDiagnostics.length, 0, `${name}: unexpected syntax error`);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const base = path.resolve(path.dirname(fullPath), specifier.split('?')[0]);
      assert.ok(['.ts', '.tsx', '.css', '.svg', '/index.ts', '/index.tsx', ''].some(suffix =>
        fs.existsSync(base + suffix)), `${name}: unresolved local import ${specifier}`);
    }
  }
});

test('project metadata and Tauri capability JSON are valid', () => {
  const names = ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/capabilities/default.json'];
  for (const name of names) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(project, name), 'utf8')), name);
  }
  const packageData = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.equal(packageData.version, '0.2.0');
  assert.equal(packageData.name, 'huelith-editor');
  assert.ok(packageData.scripts.check);
  assert.ok(packageData.scripts.build);
});

test('stylesheets have balanced braces', () => {
  for (const name of [...fs.readdirSync(path.join(project, 'src/styles')).map(file => `src/styles/${file}`), 'src/components/Canvas.css']) {
    const css = fs.readFileSync(path.join(project, name), 'utf8');
    const opens = css.match(/{/g)?.length ?? 0;
    const closes = css.match(/}/g)?.length ?? 0;
    assert.equal(opens, closes, name);
  }
});
