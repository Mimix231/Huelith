import { FILTER_CATALOG } from './effect-catalog';
import { FX_PRESETS, newEffect } from './fx';
import { uid, type Effect, type EffectKind } from './types';

export type StudioCategory = 'creativity' | 'effects' | 'fx';
export const LAYER_EFFECT_KINDS = ['outline', 'glow', 'shadow', 'backdrop', 'radiance', 'miasma'] as const;
const layerEffectSet = new Set<string>(LAYER_EFFECT_KINDS);

export const STUDIO_CATEGORIES: Record<StudioCategory, string> = {
  creativity: 'Creativity',
  effects: 'Effects',
  fx: 'FX',
};

export function inferStudioCategory(effect: Effect): StudioCategory {
  if (effect.studioCategory) return effect.studioCategory;
  return effect.kind.startsWith('sig_') ? 'fx' : (effect.kind === 'cutout' || layerEffectSet.has(effect.kind)) ? 'effects' : 'creativity';
}

export function createStudioFilter(kind: EffectKind): Effect {
  const effect = newEffect(kind);
  effect.studioCategory = layerEffectSet.has(kind) ? 'effects' : 'creativity';
  return effect;
}

/** Each new signature FX is one independent non-destructive processor. Legacy
 * multi-step FX chains still load and render from existing .huelith documents. */
export function createStudioPreset(name: string): Effect[] {
  const names = Object.keys(FX_PRESETS);
  const index = names.indexOf(name);
  if (index < 0) throw new Error(`Unknown Huelith FX: ${name}`);
  const recipe = FX_PRESETS[name][0];
  const effect = newEffect(recipe.kind, recipe.amount, recipe.color, recipe.parameters);
  effect.studioCategory = 'fx';
  effect.studioGroupId = uid();
  effect.studioPreset = name;
  return [effect];
}

export interface AppliedStudioItem {
  id: string;
  category: StudioCategory;
  title: string;
  icon: string;
  effects: Effect[];
  startIndex: number;
}

/** Legacy project effects are inferred without changing their serialized order or content. */
export function appliedStudioItems(effects: readonly Effect[]): AppliedStudioItem[] {
  const groups = new Map<string, AppliedStudioItem>();
  effects.forEach((effect, index) => {
    const id = effect.studioGroupId ?? effect.id;
    const previous = groups.get(id);
    if (previous) {
      previous.effects.push(effect);
      return;
    }
    const category = inferStudioCategory(effect);
    const definition = FILTER_CATALOG.find(item => item.kind === effect.kind);
    groups.set(id, {
      id,
      category,
      title: effect.studioPreset ?? (effect.kind === 'cutout' ? 'Remove background' : definition?.label ?? effect.kind),
      icon: effect.studioPreset ?? effect.kind,
      effects: [effect],
      startIndex: index,
    });
  });
  return [...groups.values()].sort((a, b) => a.startIndex - b.startIndex);
}

export const CREATIVITY_FILTERS = FILTER_CATALOG.filter(item => item.kind !== 'cutout' && !layerEffectSet.has(item.kind) && item.group !== 'Signature FX');
export const LAYER_EFFECTS = FILTER_CATALOG.filter(item => layerEffectSet.has(item.kind));

/** Move one applied icon (including all steps in a legacy FX chain) as one unit. */
export function moveStudioItem(effects: readonly Effect[], itemId: string, direction: -1 | 1): Effect[] {
  const items = appliedStudioItems(effects);
  const index = items.findIndex(item => item.id === itemId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return [...effects];
  [items[index], items[next]] = [items[next], items[index]];
  return items.flatMap(item => item.effects);
}
