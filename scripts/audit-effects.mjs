#!/usr/bin/env node
/** Regenerate an inventory from source without claiming visual perfection. */
import { readFileSync, writeFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const catalog = read('src/editor/effect-catalog.ts');
const fx = read('src/editor/fx.ts');
const entries = [...catalog.matchAll(/\{\s*group:\s*'([^']+)',\s*kind:\s*'([^']+)',\s*label:\s*'([^']+)'/g)]
  .map(([, group, kind, label]) => ({ group, kind, label }));
const namesSource = fx.match(/export const SIGNATURE_FX_NAMES = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
const signatures = [...namesSource.matchAll(/'([^']+)'/g)].map(match => match[1]);
const counts = Object.fromEntries(new Set(entries.map(item => item.group)).values().map(group =>
  [group, entries.filter(item => item.group === group).length]));
const expected = { 'Color & light': 24, 'Detail & texture': 21, Stylize: 25, 'Creative effects': 2, 'Signature FX': 15 };
for (const [group, count] of Object.entries(expected)) {
  if (counts[group] !== count) throw new Error(`Registry mismatch for ${group}: expected ${count}, got ${counts[group]}`);
}
if (signatures.length !== 15) throw new Error(`Expected 15 standalone FX; got ${signatures.length}`);
const descriptions = {
  exposure: 'Linear-light EV adjustment with highlight protection.',
  selective: 'Chosen color family remains saturated; other color families desaturate.',
  gradientmap: 'Editable multistop luminance ramp.',
  zoomblur: 'Shock Zoom: nonlinear central lens deformation and peripheral blur.',
  boxblur: 'Two-pass, O(pixel-count) sliding-window mean kernel.',
  lensblur: 'Focus-position-controlled simulated depth blur; approximate bokeh.',
  oilpaint: 'Procedural directional dab rendering; not physical pigment simulation.',
  watercolor: 'Procedural pigment pooling and paper grain; not fluid simulation.',
  sketch: 'Sobel edge shading plus deterministic graphite hatching.',
  comicink: 'Black linework and luminance-dependent printed hatching.',
  ink: 'Monochrome threshold and gradient-derived ink linework.',
  cartoon: 'Reduced-color graphic fill with edge-based outlines.',
  cutout: 'Connected corner-color removal; not general-purpose subject segmentation.',
  glow: 'Alpha-distance illumination, inner/outer/bloom, optional multistop spectral colors.',
  radiance: 'Independent seeded light-field and directional rays.',
  miasma: 'Independent deterministic turbulent dark smoke field.',
  backdrop: 'Solid or multistop background behind artwork, with spatial controls.',
  shadow: 'Editable non-destructive independent shadow entries.',
};
const boundaries = [
  ['Stage D: Color & Light', 'Color & light'],
  ['Stage E: Detail & Texture', 'Detail & texture'],
  ['Stage F: Stylize and original layer effects', 'Stylize'],
  ['Stage G: Original creative lighting effects', 'Creative effects'],
  ['Stage H: Standalone signature FX', 'Signature FX'],
];
const lines = [
  '# Huelith 0.1 — Engine Inventory after Stages D–H', '',
  'Generated from the actual effect registry and signature-name list. **A source inventory is not a release certificate.**',
  '', '## Architecture and compatibility', '',
  '- New signature FX use `sig_0` through `sig_14`, each dispatched to `applySignatureFX` and rendered independently of Creativity filters.',
  '- Previous `.huelith` projects containing legacy grouped filter recipes remain loadable through their original effect kinds and Studio metadata.',
  '- Layer effects (glow, outline, shadow, backdrop) and new Radiance/Miasma have separate parameter schemes.',
  '- Stages D–H do not complete performance benchmarking, GPU compositing, real UI build verification, or advanced professional color management.',
  '- Some sophisticated styles are deterministic approximations, not physically modeled fluid or light simulations.', '',
];
for (const [title, group] of boundaries) {
  lines.push(`## ${title}`, '', '| Kind | Display name | Notes |', '|---|---|---|');
  for (const item of entries.filter(item => item.group === group)) {
    const note = descriptions[item.kind] ?? (group === 'Signature FX'
      ? 'Independent parameterized procedural signature FX; visual QA and desktop validation remain required.'
      : 'Canvas2D processor; requires final artistic quality review before v1.0.');
    lines.push(`| ${item.kind} | ${item.label} | ${note} |`);
  }
  lines.push('');
}
lines.push('## Risk and acceptance status', '',
  '- **Automated pixel tests:** Verify filter output, distinct signature FX, parameter changes, alpha integrity, Gradient Map and independent lighting fields.',
  '- **Core TypeScript:** Compile using locally available TypeScript against the real editor modules.',
  '- **Full dependency build / Tauri Windows launch:** Still must be verified on a machine with npm registry access and Rust toolchain.',
  '- **Remaining release gaps:** Artist review of Oil Painting/Watercolor, general subject isolation, complex-image performance, color-profile support, Unicode typography, accessibility and UI E2E.', '',
  'The application stays at **0.1.0** until the release gates have been satisfied.', '');
writeFileSync(new URL('../ENGINE_AUDIT.md', import.meta.url), lines.join('\n'));
console.log(`Audit updated: ${entries.length} catalog entries, ${signatures.length} native signature FX.`);
