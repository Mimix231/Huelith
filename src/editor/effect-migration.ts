import type { Document, Effect, EffectParameters, Layer } from './types';
import { defaultParameters } from './effect-schema';

/** Upgrade older Spectrum 0.1 effect settings on load without mutating source pixels. */
function migrateEffect(effect: Effect): void {
  const current = effect.parameters ?? {};
  const defaults = defaultParameters(effect.kind);
  const parameters: EffectParameters = { ...defaults, ...current };
  const legacy = !effect.parameters;

  if (effect.kind === 'gradientmap' && !current.stops) {
    parameters.stops = [
      { id: 'legacy-black', position: 0, color: '#221142', opacity: 1 },
      { id: 'legacy-light', position: 1, color: /^#[a-f0-9]{6}$/i.test(effect.color ?? '') ? effect.color! : '#b579ff', opacity: 1 },
    ];
  }
  if (effect.kind === 'duotone' && !current.stops) {
    parameters.stops = [
      { id: 'legacy-shade', position: 0, color: '#182141', opacity: 1 },
      { id: 'legacy-highlight', position: 1, color: /^#[a-f0-9]{6}$/i.test(effect.color ?? '') ? effect.color! : '#b579ff', opacity: 1 },
    ];
  }
  if (effect.kind === 'curves' && !current.curvePoints) {
    const legacyAmount = effect.amount / 100;
    parameters.curvePoints = [0, 0.25, 0.5, 0.75, 1].map(x => ({
      x,
      y: Math.max(0, Math.min(1, x + legacyAmount * x * (1 - x) * (2 * x - 1) * 2)),
    }));
    effect.amount = 100;
  }
  if (effect.kind === 'levels' && legacy) {
    parameters.inputBlack = Math.max(0, effect.amount) * 0.65;
    parameters.inputWhite = 255 + Math.min(0, effect.amount) * 0.65;
    parameters.gammaMid = 1;
    effect.amount = 100;
  }
  if (effect.kind === 'balance' && legacy) {
    parameters.highlightsRed = effect.amount * 0.65;
    parameters.shadowsBlue = -effect.amount * 0.8;
    effect.amount = 100;
  }
  if (effect.kind === 'mixer' && legacy) {
    parameters.redRed = 100 + effect.amount / 2.2;
    parameters.redGreen = effect.amount / 6;
    parameters.redBlue = -effect.amount / 3.8;
    parameters.greenRed = effect.amount / 5;
    parameters.greenGreen = 100;
    parameters.greenBlue = -effect.amount / 5;
    parameters.blueGreen = effect.amount / 3;
    parameters.blueBlue = 100 - effect.amount / 2.4;
    effect.amount = 100;
  }
  if (effect.kind === 'shadow' && !current.shadows) {
    parameters.shadows = [{
      id: `legacy-${effect.id}`,
      enabled: true,
      offsetX: current.offsetX ?? 10,
      offsetY: current.offsetY ?? 10,
      radius: current.blur ?? 20,
      spread: 0,
      opacity: Math.min(1, Math.max(0, (current.opacity ?? 100) / 100)),
      color: /^#[0-9a-f]{6}$/i.test(effect.color ?? '') ? effect.color! : '#172035',
    }];
  }
  effect.parameters = parameters;
}

function migrateLayer(layer: Layer): void {
  layer.effects?.forEach(migrateEffect);
  if (layer.type === 'group') layer.children.forEach(migrateLayer);
}

export function migrateLegacyEffects(document: Document): Document {
  document.layers.forEach(migrateLayer);
  if (document.animation) {
    for (const frame of document.animation.frames) frame.layers.forEach(migrateLayer);
  }
  return document;
}
