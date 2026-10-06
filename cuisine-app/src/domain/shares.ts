// ─────────────────────────────────────────────────────────────
// Parts de chacun : les plats sont cuisinés une fois pour la tablée,
// chacun se sert une part qui correspond à SON énergie du jour (jours
// d'entraînement compris). Si la part ne suffit pas (plafond de 2
// portions, journée légère), on propose un complément en vrais aliments.
// ─────────────────────────────────────────────────────────────
import type { Ingredient, IndexedRecipe, PlanEntry, Slot } from './types';
import type { IngredientLookup } from './indexing';
import { gramsEaten } from './indexing';
import { MICROS, type NutritionProfile } from './micronutrients';
import { dayKcal, needs } from './profile';
import { ingredientConflict } from './allergens';
import { COMPLEMENTS, type ComplementDef } from '../config/complements';

export const SHARE_LIMITS = { min: 0.5, max: 2, step: 0.05 };

/** Part de l'énergie de la journée apportée par chaque repas (repère) */
export const SLOT_SHARE: Record<Slot, number> = { matin: 0.22, midi: 0.33, collation: 0.12, soir: 0.33 };

export interface Meal {
  recipe: IndexedRecipe;
  slot: Slot;
}

export interface Complement {
  def: ComplementDef;
  kcal: number;
  protein: number;
  micros: Record<string, number>;
}

export interface Share {
  profile: NutritionProfile;
  /** portions de chaque plat de la journée */
  portion: number;
  kcal: number;
  protein: number;
  target: { kcal: number; protein: number };
  complements: Complement[];
}

/** 0 = lundi … 6 = dimanche */
export const weekdayOf = (date: string) => (new Date(date + 'T12:00:00').getDay() + 6) % 7;

export function complementValue(def: ComplementDef, lookup: IngredientLookup): Complement {
  let kcal = 0;
  let protein = 0;
  const micros: Record<string, number> = {};
  for (const [id, g] of def.items) {
    const ing = lookup(id);
    if (!ing) continue;
    kcal += (ing.kcal * g) / 100;
    protein += (ing.protein * g) / 100;
    for (const [k, v] of Object.entries(MICROS[id] ?? {})) micros[k] = (micros[k] ?? 0) + ((v ?? 0) * g) / 100;
  }
  return { def, kcal: Math.round(kcal), protein: Math.round(protein), micros };
}

/** Compléments qui comblent le manque, en respectant allergies et goûts */
export function pickComplements(p: NutritionProfile, kcalGap: number, proteinGap: number, lookup: IngredientLookup): Complement[] {
  const ok = COMPLEMENTS.filter((c) => c.items.every(([id]) => {
    const ing = lookup(id);
    return ing && !ingredientConflict(p, ing as Ingredient);
  })).map((c) => complementValue(c, lookup));
  const out: Complement[] = [];
  let k = kcalGap;
  let pr = proteinGap;
  while (out.length < 3 && (k > 150 || pr > 10)) {
    const pool = ok.filter((c) => !out.includes(c));
    if (!pool.length) break;
    // protéines d'abord si elles manquent, sinon l'énergie ; pénalité si on dépasse franchement
    const score = (c: Complement) => (pr > 10 ? Math.min(c.protein, pr) * 12 : 0) + Math.min(c.kcal, Math.max(0, k)) - Math.max(0, c.kcal - k - 100) * 0.8 + (p.likes?.some((l) => c.def.items.some(([id]) => id === l)) ? 40 : 0);
    const best = pool.sort((a, b) => score(b) - score(a))[0];
    out.push(best);
    k -= best.kcal;
    pr -= best.protein;
  }
  return out;
}

/**
 * Parts de la journée pour chaque personne. Si certains repas ne sont pas
 * planifiés (dehors, restes…), seule la part correspondante de l'énergie
 * du jour est visée.
 */
export function dayShares(meals: Meal[], profiles: NutritionProfile[], date: string, lookup: IngredientLookup): Share[] {
  const wd = weekdayOf(date);
  const kcalAtOne = meals.reduce((s, m) => s + m.recipe.nutrition.kcal, 0);
  const protAtOne = meals.reduce((s, m) => s + m.recipe.nutrition.protein, 0);
  const frac = Math.min(1, [...new Set(meals.map((m) => m.slot))].reduce((s, sl) => s + SLOT_SHARE[sl], 0));
  return profiles.map((p) => {
    const tKcal = dayKcal(p, wd) * frac;
    const tProt = (needs(p)?.protein ?? p.weight * p.proteinPerKg) * frac;
    const raw = kcalAtOne ? tKcal / kcalAtOne : 1;
    const portion = Math.round(Math.min(SHARE_LIMITS.max, Math.max(SHARE_LIMITS.min, raw)) / SHARE_LIMITS.step) * SHARE_LIMITS.step;
    const kcal = kcalAtOne * portion;
    const protein = protAtOne * portion;
    const complements = meals.length ? pickComplements(p, tKcal - kcal, tProt - protein, lookup) : [];
    return { profile: p, portion: Math.round(portion * 100) / 100, kcal, protein, target: { kcal: Math.round(tKcal), protein: Math.round(tProt) }, complements };
  });
}

/** Quantité à cuisiner : somme des parts, arrondie à la demi-portion supérieure */
export function cookServings(shares: Array<Pick<Share, 'portion'>>): number {
  return Math.max(1, Math.ceil(shares.reduce((s, x) => s + x.portion, 0) * 2 - 0.05) / 2);
}

/** Ingrédient principal d'un plat et ses grammes pour une portion (« ≈ 180 g de cuisse de poulet ») */
export function mainPortion(r: IndexedRecipe, lookup: IngredientLookup): { ing: Ingredient; grams: number } | null {
  let best: { ing: Ingredient; grams: number } | null = null;
  const MAIN = ['viande', 'volaille', 'abats', 'poisson', 'fruits-de-mer', 'oeufs', 'legumineuse', 'laitier', 'feculent'];
  for (const ri of r.ingredients) {
    const ing = lookup(ri.id);
    if (!ing || !MAIN.includes(ing.category)) continue;
    const g = gramsEaten(ri, ing) / Math.max(1, r.servings);
    const rank = (c: string) => (['viande', 'volaille', 'abats', 'poisson', 'fruits-de-mer'].includes(c) ? 2 : c === 'oeufs' || c === 'legumineuse' ? 1 : 0);
    if (!best || rank(ing.category) > rank(best.ing.category) || (rank(ing.category) === rank(best.ing.category) && g > best.grams)) best = { ing, grams: g };
  }
  return best;
}

/**
 * Portions à cuisiner pour chaque créneau du planning : somme des parts du
 * jour, plus celles des repas « restes » qui en dépendent. Les restes
 * eux-mêmes ne coûtent rien à cuisiner ni à acheter.
 */
export function planServings(entries: PlanEntry[], byId: Map<string, IndexedRecipe>, profiles: NutritionProfile[], lookup: IngredientLookup): PlanEntry[] {
  const sharesOf = new Map<string, Share[]>();
  for (const date of new Set(entries.map((e) => e.date))) {
    const meals = entries.filter((e) => e.date === date && byId.has(e.recipeId)).map((e) => ({ recipe: byId.get(e.recipeId)!, slot: e.slot }));
    sharesOf.set(date, dayShares(meals, profiles, date, lookup));
  }
  const sum = (date: string) => (sharesOf.get(date) ?? []).reduce((s, x) => s + x.portion, 0);
  return entries.map((e) => {
    if (e.leftoverOf) return { ...e, servings: 0 };
    const portions = sum(e.date) + entries.filter((x) => x.leftoverOf === e.key).reduce((s, x) => s + sum(x.date), 0);
    return { ...e, servings: Math.max(1, Math.ceil(portions * 2 - 0.05) / 2) };
  });
}
