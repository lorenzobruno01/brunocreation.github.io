// ─────────────────────────────────────────────────────────────
// Ce que l'application apprend des retours après les repas :
// - un score par plat et par personne (goût, « à refaire », digestion) ;
// - les ingrédients suspects : présents bien plus souvent quand la
//   digestion a été difficile que quand elle s'est bien passée.
// Rien n'est exclu automatiquement : l'appli propose, la personne décide.
// ─────────────────────────────────────────────────────────────
import type { Feedback, Ingredient, Recipe } from './types';
import type { IngredientLookup } from './indexing';

export const LEARNING = {
  /** nombre minimal de repas avec retour contenant l'ingrédient */
  minMeals: 3,
  minBad: 2,
  /** part des repas « difficiles » quand l'ingrédient est présent */
  minRate: 0.5,
  /** écart minimal avec les repas sans cet ingrédient */
  minLift: 0.3,
};

/** Score d'un retour : −5 (à ne plus faire) … +5 (adoré) */
export function feedbackScore(f: Feedback): number {
  let s = 0;
  if (f.taste) s += (f.taste - 3) * 1.25;
  if (f.again === 'oui') s += 1.5;
  if (f.again === 'non') s -= 3;
  if (f.digestion === 'lourd') s -= 1;
  if (f.digestion === 'inconfort') s -= 2;
  return Math.max(-5, Math.min(5, s));
}

export interface RecipeLearning {
  recipeId: string;
  score: number;
  count: number;
  never: boolean;
}

/** Score moyen par plat pour une personne */
export function recipeScores(feedback: Feedback[], profileId: string): Map<string, RecipeLearning> {
  const m = new Map<string, RecipeLearning>();
  for (const f of feedback) {
    if (f.profileId !== profileId) continue;
    const cur = m.get(f.recipeId) ?? { recipeId: f.recipeId, score: 0, count: 0, never: false };
    cur.score = (cur.score * cur.count + feedbackScore(f)) / (cur.count + 1);
    cur.count++;
    // le dernier avis « à ne pas refaire » l'emporte
    if (f.again === 'non') cur.never = true;
    if (f.again === 'oui') cur.never = false;
    m.set(f.recipeId, cur);
  }
  return m;
}

export interface Suspect {
  ingredient: Ingredient;
  bad: number;
  meals: number;
  rate: number;
  baseline: number;
}

const bad = (f: Feedback) => f.digestion === 'lourd' || f.digestion === 'inconfort';

/** Ingrédients suspects pour une personne */
export function suspectIngredients(feedback: Feedback[], profileId: string, recipeOf: (id: string) => Recipe | undefined, lookup: IngredientLookup, dismissed: string[] = []): Suspect[] {
  const mine = feedback.filter((f) => f.profileId === profileId && f.digestion);
  if (mine.length < LEARNING.minMeals) return [];
  const withIng = new Map<string, { bad: number; meals: number }>();
  let totalBad = 0;
  for (const f of mine) {
    const r = recipeOf(f.recipeId);
    if (!r) continue;
    if (bad(f)) totalBad++;
    for (const id of new Set(r.ingredients.map((i) => i.id))) {
      const ing = lookup(id);
      if (!ing || ing.staple) continue;
      const cur = withIng.get(id) ?? { bad: 0, meals: 0 };
      cur.meals++;
      if (bad(f)) cur.bad++;
      withIng.set(id, cur);
    }
  }
  const out: Suspect[] = [];
  for (const [id, s] of withIng) {
    if (dismissed.includes(id) || s.meals < LEARNING.minMeals || s.bad < LEARNING.minBad) continue;
    const rate = s.bad / s.meals;
    const others = mine.length - s.meals;
    const baseline = others ? (totalBad - s.bad) / others : 0;
    if (rate >= LEARNING.minRate && rate - baseline >= LEARNING.minLift) out.push({ ingredient: lookup(id)!, bad: s.bad, meals: s.meals, rate, baseline });
  }
  return out.sort((a, b) => b.rate - b.baseline - (a.rate - a.baseline) || b.bad - a.bad);
}

/** Bonus (ou malus) de planification tiré des retours : −40 … +8 */
export function learnedBonus(scores: Map<string, RecipeLearning>, recipeId: string): number {
  const s = scores.get(recipeId);
  if (!s) return 0;
  if (s.never) return -40;
  return Math.max(-15, Math.min(8, s.score * 2));
}
