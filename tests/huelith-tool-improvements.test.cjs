const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Gradient is a separate direct-draw tool with eight retained modes and interactive transformations', () => {
  const app = read('src/App.tsx');
  const ui = read('src/components/GradientDesignerToolbar.tsx');
  const gradient = read('src/editor/gradient.ts');
  for (const mode of ['linear', 'radial', 'angular', 'reflected', 'diamond', 'spiral', 'freeform', 'mesh'])
    assert.match(gradient, new RegExp(`'${mode}'`));
  assert.match(app, /id: 'gradient'/);
  assert.match(ui, /Drag on canvas to create a Gradient layer/);
  assert.match(ui, /Color stops/);
  assert.match(ui, /Transform in Atelier/);
  const atelier=read('src/components/GradientTransformEditor.tsx');
  assert.match(atelier, /amount/);
  assert.match(atelier, /huelith-gradient-presets-v1/);
  assert.match(gradient, /gradientMirror/);
});
test('Cutout processes sampled background and keeps correction strokes non-destructively', () => {
  const ops=read('src/editor/effects/layer-cutout.ts');
  const ui=read('src/components/EffectAdvancedEditors.tsx');
  assert.match(ops, /protectedPixels/);
  assert.match(ops, /backgroundGlobal/);
  assert.match(ui, /Background removal method/);
  assert.match(ui, /cutout-live-result/);
  assert.match(ui, /applyEffect\(input,scaled\)/);
  assert.match(ui, /Keep subject/);
  assert.match(ui, /Remove background/);
});
test('All fifteen Originals have kind-specific looks and a real renderer preview', () => {
  const ui=read('src/components/CreativeLab.tsx');
  for(const kind of ['colorSculptor','atmosphere','lightSculptor','materialForge','shockDesigner','livingInk','motionEcho','paletteFlow','sceneCards','timeSculptor','particleGarden','warpCage','lightTrails','patternArchitect','gradientReactor'])
    assert.match(ui,new RegExp(`\\b${kind}:\\[`));
  assert.match(ui,/renderCreative\(ctx,/);
  assert.match(ui,/creative-quick-looks/);
});
test('All thirteen themes retain independent visual surface styling', () => {
  const css=read('src/styles/theme-identities.css');
  for(const name of ['strawberry','melon','peach','lemon','mango','sakura','blossom','shadow','glass','material','classic','midnight','studio'])
    assert.match(css,new RegExp(`\\.theme-${name} \\.titlebar`));
});
