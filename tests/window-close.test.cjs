'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const controls = fs.readFileSync(path.join(root, 'src/components/WindowControls.tsx'), 'utf8');
const files = fs.readFileSync(path.join(root, 'src/editor/files.ts'), 'utf8');

// Node 22 is already the project's minimum runtime. Running the real
// dependency-free TypeScript module catches both close-guard behavior and
// compilation-time errors in its TS syntax rather than just matching strings.
function runGuardScenario(script) {
  const location = path.join(root, 'src/components/close-guard.ts');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '--input-type=module',
    '-e', `import {guardCloseRequest} from ${JSON.stringify(`file://${location}`)}; ${script}`,
  ], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), 'ok');
}

test('clean windows are allowed to close normally', () => {
  runGuardScenario(`
    let prevented = 0;
    let prompts = 0;
    guardCloseRequest({preventDefault() { prevented++; }}, 0, false, () => prompts++);
    if (prevented !== 0 || prompts !== 0) throw new Error('Clean close was blocked');
    console.log('ok');
  `);
});

test('dirty documents prevent native closing synchronously, before prompting', () => {
  runGuardScenario(`
    const order = [];
    guardCloseRequest({preventDefault() { order.push('prevent'); }}, 2, false, () => order.push('prompt'));
    if (order.join(',') !== 'prevent,prompt') throw new Error(order);
    console.log('ok');
  `);
});

test('an active text draft triggers the same close confirmation', () => {
  runGuardScenario(`
    let prevented = false;
    let prompted = false;
    guardCloseRequest({preventDefault() { prevented = true; }}, 0, true, () => { prompted = prevented; });
    if (!prevented || !prompted) throw new Error('Text draft lost');
    console.log('ok');
  `);
});

test('no await is used in the synchronous native onCloseRequested handler', () => {
  assert.match(controls, /onCloseRequested\(event\s*=>/);
  assert.doesNotMatch(controls, /onCloseRequested\(async\s+event/);
  assert.match(controls, /guardCloseRequest\(/);
  assert.match(controls, /removeCloseListener\(\)/);
});

test('Save All handles every dirty tab, verifies revision and respects canceled Save dialogs', () => {
  assert.match(files, /export async function saveAllProjects\(/);
  assert.match(files, /\.tabs\s*\.filter\(tab => tab\.dirty\)/);
  assert.match(files, /if \(!selectedPath\) return false/);
  assert.match(files, /markSaved\(id, revision, path\)/);
  assert.match(files, /state\.tabs\.every\(tab => !tab\.dirty\)/);
  assert.match(controls, /if \(!saved\)/);
  assert.match(controls, /await getCurrentWindow\(\)\.destroy\(\)/);
  assert.match(controls, /Save All &amp; Close/);
  assert.match(controls, /Discard &amp; Close/);
});
