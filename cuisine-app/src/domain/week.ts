// ─────────────────────────────────────────────────────────────
// Raisonnement à la semaine : un jour à 70 % de fer n'est pas grave si
// la semaine atteint 100 %. Le corps fait des réserves (fer, B12,
// vitamines A et D, oméga-3) ; on juge donc la moyenne des jours
// planifiés. Les manques sont reliés à de vrais aliments, les excès à
// des limites de sécurité.
// ─────────────────────────────────────────────────────────────
import type { Ingredient, IndexedRecipe, IngredientCategory, PlanEntry } from './types';
import type { IngredientLookup } from './indexing';
import { dailyRef, MICROS, NUTRIENTS, type NutrientDef, type NutritionProfile } from './micronutrients';
import { dayShares, type Share } from './shares';
import { ingredientConflict } from './allergens';

/** Nutriments suivis à la semaine (le chlorure suit le sodium) */
export const WEEK_NUTRIENTS = NUTRIENTS.filter((n) => n.key !== 'cl');

export interface PersonDay {
  date: string;
  entries: PlanEntry[];
  share: Share;
  intake: Record<string, number>;
  kcal: number;
  protein: number;
}

export interface Excess {
  def: NutrientDef;
  avg: number;
  limit: number;
}

export interface PersonWeek {
  profile: NutritionProfile;
  days: PersonDay[];
  /** % moyen du besoin par nutriment, sur les jours planifiés */
  pct: Record<string, number>;
  /** nutriments sous 100 % sur la semaine */
  gaps: NutrientDef[];
  /** sous 80 % certains jours mais ≥ 100 % sur la semaine */
  dips: Array<{ def: NutrientDef; days: string[] }>;
  excess: Excess[];
  kcalAvg: number;
  proteinAvg: number;
  coverage: number;
}

export function dayIntake(share: Share, recipes: IndexedRecipe[]): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const r of recipes) for (const [k, v] of Object.entries(r.micros ?? {})) sum[k] = (sum[k] ?? 0) + v * share.portion;
  for (const c of share.complements) for (const [k, v] of Object.entries(c.micros)) sum[k] = (sum[k] ?? 0) + v;
  return sum;
}

export function analyzeWeek(plan: PlanEntry[], byId: Map<string, IndexedRecipe>, profiles: NutritionProfile[], lookup: IngredientLookup): PersonWeek[] {
  const dates = [...new Set(plan.map((e) => e.date))].sort();
  const perDate = dates.map((date) => {
    const entries = plan.filter((e) => e.date === date && byId.has(e.recipeId));
    const meals = entries.map((e) => ({ recipe: byId.get(e.recipeId)!, slot: e.slot }));
    return { date, entries, meals, shares: dayShares(meals, profiles, date, lookup) };
  });
  return profiles.map((profile, pi) => {
    const days: PersonDay[] = perDate
      .filter((d) => d.meals.length)
      .map((d) => {
        const share = d.shares[pi];
        const intake = dayIntake(share, d.meals.map((m) => m.recipe));
        const kcal = share.kcal + share.complements.reduce((s, c) => s + c.kcal, 0);
        const protein = share.protein + share.complements.reduce((s, c) => s + c.protein, 0);
        return { date: d.date, entries: d.entries, share, intake, kcal, protein };
      });
    const n = Math.max(1, days.length);
    const pct: Record<string, number> = {};
    const gaps: NutrientDef[] = [];
    const dips: PersonWeek['dips'] = [];
    const excess: Excess[] = [];
    let cov = 0;
    let counted = 0;
    for (const def of WEEK_NUTRIENTS) {
      const ref = dailyRef(def, profile);
      const avg = days.reduce((s, d) => s + (d.intake[def.key] ?? 0), 0) / n;
      const p = ref ? (avg / ref) * 100 : 0;
      pct[def.key] = p;
      if (def.limit) {
        if (avg > ref) excess.push({ def, avg, limit: ref });
        continue;
      }
      if (def.group !== 'acides-amines') {
        cov += Math.min(100, p);
        counted++;
      }
      if (p < 99.5) gaps.push(def);
      else {
        const low = days.filter((d) => ((d.intake[def.key] ?? 0) / ref) * 100 < 80).map((d) => d.date);
        if (low.length) dips.push({ def, days: low });
      }
      if (def.upper && avg > def.upper) excess.push({ def, avg, limit: def.upper });
    }
    return {
      profile,
      days,
      pct,
      gaps: gaps.sort((a, b) => pct[a.key] - pct[b.key]),
      dips,
      excess,
      kcalAvg: days.reduce((s, d) => s + d.kcal, 0) / n,
      proteinAvg: days.reduce((s, d) => s + d.protein, 0) / n,
      coverage: counted ? cov / counted : 0,
    };
  });
}

/** Portion usuelle d'un ingrédient (g) pour parler en « assiettes » plutôt qu'en 100 g */
const PORTION: Partial<Record<IngredientCategory, number>> = {
  viande: 150,
  volaille: 150,
  abats: 100,
  poisson: 150,
  'fruits-de-mer': 150,
  oeufs: 110,
  laitier: 100,
  legume: 150,
  legumineuse: 60,
  fruit: 150,
  feculent: 70,
  epicerie: 30,
  herbe: 10,
};

export interface FoodSource {
  ing: Ingredient;
  grams: number;
  amount: number;
  /** % du besoin quotidien apporté par cette portion */
  pct: number;
}

/** Aliments simples qui apportent le plus d'un nutriment, adaptés à la personne */
export function foodSourcesFor(def: NutrientDef, profile: NutritionProfile, ingredients: Ingredient[], n = 3): FoodSource[] {
  const ref = dailyRef(def, profile);
  return ingredients
    .filter((i) => PORTION[i.category] && MICROS[i.id]?.[def.key as keyof (typeof MICROS)[string]] && !i.flags?.includes('eviter') && !i.flags?.includes('transforme') && !ingredientConflict(profile, i))
    .map((ing) => {
      const grams = PORTION[ing.category]!;
      const amount = ((MICROS[ing.id][def.key as keyof (typeof MICROS)[string]] ?? 0) * grams) / 100;
      const liked = profile.likes?.includes(ing.id) ? 1.3 : 1;
      return { ing, grams, amount, pct: (amount / ref) * 100, rank: (amount / ref) * liked };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, n)
    .map(({ rank: _r, ...f }) => f);
}
