import type { Effect, EffectKind } from './types';
import { newEffect } from './fx';

/** Phase O: user-defined Studio recipes are application preferences, never document effects.
 * A recipe cannot import a new effect kind or replace a project effect ID. */
export interface StudioRecipe {
  name: string;
  kind: EffectKind;
  amount: number;
  color?: string;
  parameters?: Effect['parameters'];
}
const STORAGE = 'spectrum-studio-user-presets-v1';
const MAX_RECIPES = 64;
const HEX = /^#[a-f\d]{6}$/i;

function valid(recipe: unknown): recipe is StudioRecipe {
  if (!recipe || typeof recipe !== 'object') return false;
  const value = recipe as StudioRecipe;
  return typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 56 &&
    typeof value.kind === 'string' && Number.isFinite(value.amount) && value.amount >= -200 && value.amount <= 400 &&
    (value.color === undefined || HEX.test(value.color)) &&
    (value.parameters === undefined || (typeof value.parameters === 'object' && value.parameters !== null &&
      !Array.isArray(value.parameters) && Object.keys(value.parameters).length <= 96));
}

export function studioRecipes(kind?: EffectKind): StudioRecipe[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, MAX_RECIPES).filter(valid).filter(recipe => !kind || recipe.kind === kind);
  } catch { return []; }
}

export function saveStudioRecipe(effect: Effect, title: string): boolean {
  const name = title.trim().slice(0, 56);
  if (!name) return false;
  const recipe: StudioRecipe = { name, kind: effect.kind, amount: effect.amount,
    color: effect.color, parameters: structuredClone(effect.parameters ?? {}) };
  const list = studioRecipes().filter(item => item.name !== name || item.kind !== effect.kind);
  list.push(recipe);
  try { localStorage.setItem(STORAGE, JSON.stringify(list.slice(-MAX_RECIPES))); return true; }
  catch { return false; }
}

export function applyStudioRecipe(effect: Effect, recipe: StudioRecipe): Effect {
  if (effect.kind !== recipe.kind || !valid(recipe)) return effect;
  const checked = newEffect(effect.kind, recipe.amount, recipe.color, recipe.parameters);
  // The layer's non-destructive identity/order must never change during a preset load.
  return { ...effect, amount: checked.amount, color: checked.color, parameters: checked.parameters };
}

export function resetStudioEffect(effect: Effect): Effect {
  const standard = newEffect(effect.kind);
  return { ...effect, enabled: true, amount: standard.amount, color: standard.color, parameters: standard.parameters };
}
