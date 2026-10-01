// ─────────────────────────────────────────────────────────────
// Système anti-répétition (§14, §45) : empreinte culinaire et
// score de similarité entre recettes.
// ─────────────────────────────────────────────────────────────
import type { IndexedRecipe } from './types';
import { tokens } from './text';

function jaccard<T>(a: T[], b: T[]): number {
  if (!a.length && !b.length) return 0.5; // neutre : absence commune ≠ identité
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface SimilarityDetail {
  score: number; // 0 → 1
  reasons: string[];
}

/**
 * Score composite. Deux recettes de même protéine + même féculent + mêmes légumes
 * + même cuisine + même technique ≈ 0,85 et plus → considérées comme doublon.
 */
export function similarity(a: IndexedRecipe, b: IndexedRecipe): SimilarityDetail {
  const reasons: string[] = [];
  const sameProtein = a.mainProtein && a.mainProtein === b.mainProtein ? 1 : 0;
  const ingr = jaccard(a.mainIngredientIds, b.mainIngredientIds);
  const starch = jaccard(a.starches, b.starches);
  const veg = jaccard(a.vegetables, b.vegetables);
  const cuisine = a.cuisine === b.cuisine ? 1 : 0;
  const technique = a.technique === b.technique ? 1 : 0;
  const category = a.category === b.category ? 1 : 0;
  const flavor = jaccard(a.flavors, b.flavors);
  const name = jaccard(tokens(a.name), tokens(b.name));

  const score =
    0.18 * sameProtein +
    0.27 * ingr +
    0.1 * starch +
    0.1 * veg +
    0.08 * cuisine +
    0.08 * technique +
    0.04 * category +
    0.05 * flavor +
    0.1 * name;

  if (sameProtein) reasons.push(`même protéine (${a.mainProtein})`);
  if (ingr > 0.5) reasons.push(`${Math.round(ingr * 100)} % d’ingrédients principaux communs`);
  if (starch === 1 && a.starches.length) reasons.push('même féculent');
  if (veg > 0.6 && a.vegetables.length) reasons.push('mêmes légumes');
  if (cuisine) reasons.push('même cuisine');
  if (technique) reasons.push('même technique');
  if (name > 0.5) reasons.push('nom très proche');
  return { score, reasons };
}

export const DUPLICATE_THRESHOLD = 0.8;
export const TOO_CLOSE_THRESHOLD = 0.68;

export function findSimilar(target: IndexedRecipe, pool: IndexedRecipe[], limit = 5, min = 0.45) {
  return pool
    .filter((r) => r.id !== target.id)
    .map((r) => ({ recipe: r, ...similarity(target, r) }))
    .filter((x) => x.score >= min)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
