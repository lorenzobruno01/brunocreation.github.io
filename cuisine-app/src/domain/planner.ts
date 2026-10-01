// ─────────────────────────────────────────────────────────────
// Génération de menu hebdomadaire (§35) — variété, saison,
// favoris, historique, ingrédients disponibles, anti-gaspillage.
// ─────────────────────────────────────────────────────────────
import type { IndexedRecipe, PlanEntry, Season, Slot } from './types';
import { similarity } from './similarity';
import { currentSeason } from './season';

export interface PlannerContext {
  recipes: IndexedRecipe[];
  favorites: Set<string>;
  /** recipeId → date ISO de dernière réalisation */
  lastCooked: Map<string, string>;
  available: Set<string>; // frigo + garde-manger
  locked: PlanEntry[]; // créneaux déjà remplis par l'utilisateur
  dates: string[]; // 7 dates YYYY-MM-DD
  slots: Slot[]; // ex. ['midi', 'soir']
  servings: number;
  /** privilégier les ingrédients partagés (anti-gaspillage) */
  shareIngredients?: boolean;
  seed?: number;
  season?: Season;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Recettes éligibles comme repas principal */
export function isMainMeal(r: IndexedRecipe, slot: Slot): boolean {
  if (slot === 'matin') return r.mealTypes.includes('petit-dejeuner');
  const okType = slot === 'midi' ? r.mealTypes.includes('dejeuner') || r.mealTypes.includes('diner') : r.mealTypes.includes('diner') || r.mealTypes.includes('dejeuner');
  if (!okType) return false;
  if (['plat', 'mijote', 'salade-composee'].includes(r.category)) return true;
  return r.category === 'soupe' && r.nutrition.protein >= 25;
}

const PERISHABLE = new Set(['legume', 'fruit', 'herbe', 'laitier', 'poisson', 'fruits-de-mer', 'viande', 'volaille', 'abats']);

export function generateWeek(ctx: PlannerContext, categoryOf: (id: string) => string | undefined): PlanEntry[] {
  const rand = mulberry32(ctx.seed ?? Date.now());
  const season = ctx.season ?? currentSeason();
  const now = Date.now();
  const chosen: IndexedRecipe[] = [];
  const result: PlanEntry[] = [];
  const lockedKeys = new Map(ctx.locked.map((e) => [e.key, e]));
  const byId = new Map(ctx.recipes.map((r) => [r.id, r]));
  for (const l of ctx.locked) {
    const r = byId.get(l.recipeId);
    if (r) chosen.push(r);
  }

  const proteinCount = new Map<string, number>();
  const cuisineCount = new Map<string, number>();
  const bump = (m: Map<string, number>, k?: string) => k && m.set(k, (m.get(k) ?? 0) + 1);
  chosen.forEach((r) => {
    bump(proteinCount, r.mainProtein);
    bump(cuisineCount, r.cuisine);
  });

  let lastProtein: string | undefined;
  const plannedIngredients = new Map<string, number>();
  const addIngredients = (r: IndexedRecipe) => {
    for (const id of r.mainIngredientIds) if (PERISHABLE.has(categoryOf(id) ?? '')) plannedIngredients.set(id, (plannedIngredients.get(id) ?? 0) + 1);
  };
  chosen.forEach(addIngredients);

  for (const date of ctx.dates) {
    const dow = new Date(date + 'T12:00:00').getDay(); // 0 = dimanche
    const weekend = dow === 0 || dow === 6;
    for (const slot of ctx.slots) {
      const key = `${date}|${slot}`;
      const locked = lockedKeys.get(key);
      if (locked) {
        result.push(locked);
        lastProtein = byId.get(locked.recipeId)?.mainProtein;
        continue;
      }
      let best: { r: IndexedRecipe; s: number } | undefined;
      for (const r of ctx.recipes) {
        if (!isMainMeal(r, slot)) continue;
        if (chosen.some((c) => c.id === r.id)) continue;
        let s = rand() * 30;
        // Saison
        if (r.seasons.length === 0) s += 4;
        else if (r.seasons.includes(season)) s += 12;
        else s -= 15;
        // Favoris
        if (ctx.favorites.has(r.id)) s += 14;
        // Historique : éviter les plats récents
        const last = ctx.lastCooked.get(r.id);
        if (last) {
          const days = (now - new Date(last).getTime()) / 86400000;
          if (days < 7) s -= 40;
          else if (days < 21) s -= 15;
        }
        // Ingrédients disponibles
        if (ctx.available.size && r.mainIngredientIds.length) {
          const have = r.mainIngredientIds.filter((id) => ctx.available.has(id)).length;
          s += (have / r.mainIngredientIds.length) * 18;
        }
        // Temps : semaine → rapide, week-end → plats longs bienvenus
        if (!weekend) {
          if (slot === 'soir' && r.totalTime > 50) s -= 30;
          if (slot === 'midi' && r.totalTime > 40 && !r.tags.includes('lunch box') && !r.tags.includes('batch cooking')) s -= 28;
          if (slot === 'midi' && (r.tags.includes('lunch box') || r.tags.includes('repas froid'))) s += 6;
        } else if (r.totalTime > 60 || r.tags.includes('week-end')) s += 10;
        // Nutrition (prise de masse)
        if (r.nutrition.protein >= 35) s += 5;
        if (r.nutrition.kcal >= 650) s += 4;
        // Variété des protéines
        const pc = proteinCount.get(r.mainProtein ?? '') ?? 0;
        if (r.mainProtein && r.mainProtein === lastProtein) s -= 35;
        s -= pc * 14;
        if (pc >= 3) s -= 60;
        if (r.mainProtein === 'abats' && pc >= 1) s -= 60;
        // Variété des cuisines
        const cc = cuisineCount.get(r.cuisine) ?? 0;
        s -= cc * 6;
        if (cc >= 3) s -= 30;
        // Trop proche d'une recette déjà choisie
        for (const c of chosen) {
          const sim = similarity(r, c).score;
          if (sim > 0.55) s -= (sim - 0.55) * 120;
        }
        // Anti-gaspillage : partager les produits frais
        if (ctx.shareIngredients) {
          const shared = r.mainIngredientIds.filter((id) => plannedIngredients.has(id)).length;
          s += shared * 5;
        }
        if (!best || s > best.s) best = { r, s };
      }
      if (!best) continue;
      chosen.push(best.r);
      bump(proteinCount, best.r.mainProtein);
      bump(cuisineCount, best.r.cuisine);
      addIngredients(best.r);
      lastProtein = best.r.mainProtein;
      result.push({ key, date, slot, recipeId: best.r.id, servings: ctx.servings });
    }
  }
  return result;
}
