'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = path.join(__dirname, '..');
const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function loadTimelineLayout(initial = {}) {
  const stored = new Map(Object.entries(initial));
  const code = ts.transpileModule(source('src/editor/timeline-layout.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { exports: module.exports, module, localStorage: {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  } });
  return { ...module.exports, stored };
}

test('timeline docking clamps drag height and preserves minimum canvas area', () => {
  const layout = loadTimelineLayout();
  assert.equal(layout.clampTimelineHeight(1500, 900), 680);
  assert.equal(layout.clampTimelineHeight(680, 500), 325);
  assert.equal(layout.clampTimelineHeight(0, 600), 190);
  assert.equal(layout.clampTimelineHeight(-500, 350), 175);
  assert.equal(layout.clampTimelineHeight(Infinity, 900), 305);
  assert.equal(layout.timelineHeightBounds(250).max, 116);
});

test('timeline size is a safe app preference, not project history', () => {
  const layout = loadTimelineLayout();
  assert.equal(layout.readTimelineHeight(), 305);
  layout.saveTimelineHeight(413.7);
  assert.equal(layout.stored.get(layout.TIMELINE_HEIGHT_KEY), '414');
  assert.equal(layout.readTimelineHeight(), 414);
  assert.equal(loadTimelineLayout({ [layout.TIMELINE_HEIGHT_KEY]: '<malformed>' }).readTimelineHeight(), 305);
  assert.equal(loadTimelineLayout({ [layout.TIMELINE_HEIGHT_KEY]: '50000' }).readTimelineHeight(), 305);
});

test('effect editor is portaled above the timeline and remains theme-aware', () => {
  const app = source('src/App.tsx');
  const portal = source('src/components/FloatingFxPortal.tsx');
  const css = source('src/components/FloatingFxPortal.css');
  assert.match(app, /<FloatingFxPortal anchorRef=\{inspectorRef\}/);
  assert.match(portal, /createPortal\(/);
  assert.match(portal, /querySelector<HTMLElement>\('\.app'\)/);
  assert.match(portal, /ResizeObserver\(schedule\)/);
  assert.match(portal, /\.animation-timeline/);
  assert.match(css, /z-index:\s*120/);
  assert.match(css, /\.portal-fx-host \.studio-editor-footer\s*\{ flex:\s*0 0 auto/);
});

test('timeline pointer events resize without React state commits per move', () => {
  const component = source('src/components/AnimationTimeline.tsx');
  const timelineCSS = source('src/styles/animation.css');
  const canvas = source('src/components/Canvas.tsx');
  const onMove = component.split('onPointerMove={event => {')[1]?.split('onPointerUp={finishResize}')[0];
  assert.ok(onMove, 'resize pointermove exists');
  assert.doesNotMatch(onMove, /setTimelineHeight|setActiveFrame|drawDocument/);
  assert.match(component, /setPointerCapture\(event.pointerId\)/);
  assert.match(component, /onPointerCancel=\{finishResize\}/);
  assert.match(component, /onKeyDown=\{event => \{/);
  assert.match(timelineCSS, /touch-action:\s*none/);
  assert.match(timelineCSS, /\.timeline-sheet-scroll\s*\{[\s\S]*?max-height:\s*none/);
  assert.match(canvas, /classList\.contains\('huelith-timeline-resizing'\)/);
  assert.match(canvas, /huelith-timeline-resize-end/);
});
