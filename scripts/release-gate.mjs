/** Noninteractive source/release gate. Fails closed when toolchains/dependencies
 * are absent; never claim a passing native build based on TS syntax alone. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageData = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
const required = ['README.md', 'CHANGELOG.md', 'ACCEPTANCE.md', 'LICENSE', 'package.json', 'package-lock.json',
  'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'src-tauri/icons/icon.ico'];
let failures = 0;
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) { console.error(`MISSING ${file}`); failures++; }
}
const expected = packageData.version;
for (const [label, value] of Object.entries({ 'package-lock': lock.version, 'package-lock root': lock.packages[''].version,
  tauri: tauri.version })) {
  if (value !== expected) { console.error(`Version mismatch: ${label} = ${value}, expected ${expected}`); failures++; }
}
if (packageData.name !== 'huelith-editor' || lock.name !== packageData.name ||
    tauri.productName !== 'Huelith' || tauri.app.windows[0]?.title !== 'Huelith' ||
    tauri.identifier !== 'org.huelith.editor') { console.error('Application branding identifiers disagree.'); failures++; }
const cargo = read('src-tauri/Cargo.toml');
if (!cargo.includes(`version = "${expected}"`) || !cargo.includes('name = "huelith"')) {
  console.error('Rust manifest version/name disagree with npm.'); failures++;
}
const cargoLock = read('src-tauri/Cargo.lock');
if (!cargoLock.includes(`name = "huelith"\nversion = "${expected}"`)) {
  console.error('Rust Cargo.lock package identity/version disagrees with npm.'); failures++;
}
const commands = [
  ['Dependency-aware TypeScript', 'npm', ['run', 'check']],
  ['Node regression suite', 'npm', ['test']],
  ['Vite/TypeScript production', 'npm', ['run', 'build']],
  ['Rust native', 'cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml']],
];
// The source/static gate can be used offline on machines without Rust.
if (process.argv.includes('--source-only')) commands.splice(0, commands.length,
  ['Node regression suite', 'npm', ['test']], ['Syntax checks', 'npm', ['run', 'check:source']]);
for (const [label, executable, args] of commands) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(executable, args, {cwd:root, stdio:'inherit', shell:process.platform==='win32'});
  if (result.error || result.status !== 0) {
    console.error(`FAIL: ${label}${result.error ? ` (${result.error.message})` : `, exit ${result.status}`}`); failures++;
  } else console.log(`PASS: ${label}`);
}
if (failures) {
  console.error(`\nRelease gate NOT passed (${failures} failure(s)). Do not publish as a verified installer.`);
  process.exit(1);
}
console.log(`\nHuelith ${expected}: automated checks passed. Manual Windows installation/performance checks are still required.`);
