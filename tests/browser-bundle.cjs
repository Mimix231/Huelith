const path = require('node:path');
const esbuild = require('esbuild');

const sourceRoot = path.resolve(__dirname, '../src/editor');

function bundle(contents, format = 'iife') {
  return esbuild.buildSync({
    stdin: { contents, resolveDir: sourceRoot, sourcefile: 'browser-test-entry.js' },
    bundle: true,
    format,
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  }).outputFiles[0].text;
}

function browserGlobal(name, modules) {
  return bundle(`window[${JSON.stringify(name)}] = Object.assign({}, ${
    modules.map(module => `require(${JSON.stringify(`./${module}`)})`).join(', ')
  });`);
}

function workerModule(name) {
  return bundle(`module.exports = require(${JSON.stringify(`./${name}`)});`, 'cjs');
}

module.exports = { browserGlobal, workerModule };
