// ─────────────────────────────────────────────────────────────
// Planificateur « densité nutritionnelle » : compose la semaine
// pour s'approcher chaque jour de 100 % des besoins en vitamines,
// minéraux, électrolytes, acides aminés, oméga-3 et fibres,
// tout en respectant l'énergie visée, la variété et les critères.
// Méthode : semaine variée de départ puis optimisation locale
// (on remplace créneau par créneau le plat qui améliore le plus
// la couverture globale), plusieurs passes.
// ─────────────────────────────────────────────────────────────
import type { IndexedRecipe, PlanEntry, Slot } from './types';
import { dailyRef, NUTRIENTS, type NutritionProfile } from './micronutrients';
import { generateWeek, isMainMeal, passesConstraints, type PlannerContext } from './planner';
import { currentSeason } from './season';

/** Nutriments visés (le sodium est une limite, le chlorure suit le sodium) */
const TARGETS = NUTRIENTS.filter((n) => n.key !== 'na' && n.key !== 'cl');
const WEIGHT: Record<string, number> = { 'acides-amines': 0.4 };

export interface DayReport {
  date: string;
  kcal: number;
  protein: number;
  /** % du besoin par nutriment (non plafonné) */
  pct: Record<string, number>;
  /** couverture moyenne, chaque nutriment plafonné à 100 % */
  coverage: number;
  /** nutriments sous 80 % */
  gaps: string[];
  sodium: number;
}

export function refsFor(profile: NutritionProfile): Record<string, number> {
  return Object.fromEntries(NUTRIENTS.map((n) => [n.key, dailyRef(n, profile)]));
}

export function dayReport(date: string, recipes: IndexedRecipe[], profile: NutritionProfile, portionsOf: (r: IndexedRecipe) => number = () => 1): DayReport {
  const refs = refsFor(profile);
  const sum: Record<string, number> = {};
  let kcal = 0;
  let protein = 0;
  for (const r of recipes) {
    const f = portionsOf(r);
    kcal += r.nutrition.kcal * f;
    protein += r.nutrition.protein * f;
    for (const [k, v] of Object.entries(r.micros ?? {})) sum[k] = (sum[k] ?? 0) + v * f;
  }
  const pct: Record<string, number> = {};
  let cov = 0;
  let wsum = 0;
  const gaps: string[] = [];
  for (const n of TARGETS) {
    const p = ((sum[n.key] ?? 0) / refs[n.key]) * 100;
    pct[n.key] = p;
    const w = WEIGHT[n.group] ?? 1;
    cov += Math.min(100, p) * w;
    wsum += w;
    if (p < 80) gaps.push(n.key);
  }
  pct.kcal = (kcal / profile.kcal) * 100;
  pct.protein = (protein / (profile.weight * profile.proteinPerKg)) * 100;
  pct.na = ((sum.na ?? 0) / 2000) * 100;
  return { date, kcal, protein, pct, coverage: cov / wsum, gaps, sodium: sum.na ?? 0 };
}

export interface NutriPlanContext extends PlannerContext {
  profile: NutritionProfile;
  passes?: number;
}

/** Score d'une journée (plus haut = mieux) */
function dayScore(day: IndexedRecipe[], profile: NutritionProfile, refs: Record<string, number>): number {
  const sum: Record<string, number> = {};
  let kcal = 0;
  let protein = 0;
  for (const r of day) {
    kcal += r.nutrition.kcal;
    protein += r.nutrition.protein;
    const m = r.micros;
    if (m) for (const k in m) sum[k] = (sum[k] ?? 0) + m[k];
  }
  let s = 0;
  let w = 0;
  for (const n of TARGETS) {
    const ww = WEIGHT[n.group] ?? 1;
    const ratio = (sum[n.key] ?? 0) / refs[n.key];
    // gain décroissant : les derniers % manquants comptent le plus
    s += ww * Math.min(1, ratio) * 100 - ww * Math.max(0, 0.6 - ratio) * 40;
    w += ww;
  }
  s /= w;
  // énergie : viser l'objectif (± 8 % toléré)
  const dev = Math.abs(kcal / profile.kcal - 1);
  s -= Math.max(0, dev - 0.08) * 120;
  // protéines : au moins l'objectif
  const pTarget = profile.weight * profile.proteinPerKg;
  if (protein < pTarget) s -= ((pTarget - protein) / pTarget) * 40;
  // sodium : au-delà de 2,3 g (hors sel ajouté)
  if ((sum.na ?? 0) > 2300) s -= ((sum.na - 2300) / 1000) * 6;
  return s;
}

const FISH = new Set(['poisson-gras', 'poisson-blanc', 'fruits-de-mer']);

/** Pénalités de variété sur la semaine (plus bas = mieux) */
function varietyPenalty(entries: Array<{ slot: Slot; r: IndexedRecipe; day: number }>, ctx: NutriPlanContext): number {
  let p = 0;
  // même journée : éviter deux fois la même protéine ou le même ingrédient principal
  const byDay = new Map<number, IndexedRecipe[]>();
  for (const e of entries) (byDay.get(e.day) ?? byDay.set(e.day, []).get(e.day)!).push(e.r);
  for (const rs of byDay.values()) {
    const prot = new Map<string, number>();
    const ings = new Map<string, number>();
    for (const r of rs) {
      if (r.mainProtein && r.mainProtein !== 'laitier') prot.set(r.mainProtein, (prot.get(r.mainProtein) ?? 0) + 1);
      const main = r.mainIngredientIds.find((id) => !['oeuf', 'beurre', 'oignon', 'ail', 'citron', 'pomme-de-terre', 'riz-blanc', 'pain-seigle', 'pain-levain', 'lait', 'creme-fraiche', 'creme-liquide', 'farine'].includes(id));
      if (main) ings.set(main, (ings.get(main) ?? 0) + 1);
    }
    for (const n of prot.values()) if (n > 1) p += (n - 1) * 7;
    for (const n of ings.values()) if (n > 1) p += (n - 1) * 20;
  }
  const seen = new Map<string, number>();
  const proteins = new Map<string, number>();
  const cuisines = new Map<string, number>();
  let lastMainProtein: string | undefined;
  let abats = 0;
  let fish = 0;
  for (const { slot, r } of entries) {
    seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
    if (slot === 'midi' || slot === 'soir') {
      if (r.mainProtein) {
        proteins.set(r.mainProtein, (proteins.get(r.mainProtein) ?? 0) + 1);
        if (r.mainProtein === lastMainProtein) p += 10;
        lastMainProtein = r.mainProtein;
        if (r.mainProtein === 'abats') abats++;
        if (FISH.has(r.mainProtein)) fish++;
      }
      cuisines.set(r.cuisine, (cuisines.get(r.cuisine) ?? 0) + 1);
    }
    if (ctx.favorites.has(r.id)) p -= 2;
    const last = ctx.lastCooked.get(r.id);
    if (last && Date.now() - new Date(last).getTime() < 7 * 86400000) p += 12;
  }
  for (const n of seen.values()) if (n > 1) p += (n - 1) * 60; // jamais deux fois la même recette
  for (const n of proteins.values()) if (n > 3) p += (n - 3) * 15;
  for (const n of cuisines.values()) if (n > 5) p += (n - 5) * 4;
  const c = ctx.constraints ?? {};
  if (c.maxAbats != null && abats > c.maxAbats) p += (abats - c.maxAbats) * 50;
  else if (abats > 2) p += (abats - 2) * 30;
  if (c.minFish && fish < c.minFish) p += (c.minFish - fish) * 25;
  return p;
}

function candidatesFor(slot: Slot, weekend: boolean, ctx: NutriPlanContext): IndexedRecipe[] {
  const season = ctx.season ?? currentSeason();
  const c = ctx.constraints ?? {};
  return ctx.recipes.filter((r) => {
    if (!isMainMeal(r, slot) || !r.micros) return false;
    if (slot === 'midi' || slot === 'soir') return passesConstraints(r, c, weekend, ctx.favorites, season);
    // petit-déjeuner / collation : rapide en semaine sauf préparation à l'avance
    if (!weekend && r.totalTime > 25 && !r.tags.includes('préparation à l’avance')) return false;
    if (c.excludeProteins?.length && r.mainProtein && c.excludeProteins.includes(r.mainProtein)) return false;
    if (c.seasonOnly && r.seasons.length && !r.seasons.includes(season)) return false;
    return true;
  });
}

export function generateNutriWeek(ctx: NutriPlanContext, categoryOf: (id: string) => string | undefined): PlanEntry[] {
  const refs = refsFor(ctx.profile);
  const byId = new Map(ctx.recipes.map((r) => [r.id, r]));
  // 1. semaine variée de départ
  const start = generateWeek(ctx, categoryOf);
  const locked = new Set(ctx.locked.map((l) => l.key));
  const grid = ctx.dates.map((date) => ctx.slots.map((slot) => start.find((e) => e.key === `${date}|${slot}`)));
  const weekendOf = (date: string) => {
    const d = new Date(date + 'T12:00:00').getDay();
    return d === 0 || d === 6;
  };
  const pools = new Map<string, IndexedRecipe[]>();
  for (const slot of ctx.slots) for (const we of [false, true]) pools.set(`${slot}|${we}`, candidatesFor(slot, we, ctx));

  const cur: Array<Array<IndexedRecipe | undefined>> = grid.map((row) => row.map((e) => (e ? byId.get(e.recipeId) : undefined)));
  const flat = () => {
    const out: Array<{ slot: Slot; r: IndexedRecipe; day: number }> = [];
    cur.forEach((row, day) => row.forEach((r, si) => r && out.push({ slot: ctx.slots[si], r, day })));
    return out;
  };
  const dayScores = cur.map((row) => dayScore(row.filter(Boolean) as IndexedRecipe[], ctx.profile, refs));
  let variety = varietyPenalty(flat(), ctx);

  // 2. optimisation locale
  const passes = ctx.passes ?? 4;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (let d = 0; d < ctx.dates.length; d++) {
      for (let si = 0; si < ctx.slots.length; si++) {
        const key = `${ctx.dates[d]}|${ctx.slots[si]}`;
        if (locked.has(key)) continue;
        const pool = pools.get(`${ctx.slots[si]}|${weekendOf(ctx.dates[d])}`) ?? [];
        const before = cur[d][si];
        let best = before;
        let bestTotal = dayScores[d] - variety;
        let bestDay = dayScores[d];
        let bestVar = variety;
        for (const cand of pool) {
          if (cand === before) continue;
          cur[d][si] = cand;
          const ds = dayScore(cur[d].filter(Boolean) as IndexedRecipe[], ctx.profile, refs);
          // estimation rapide de la variété avant le calcul complet
          if (ds - variety + 70 < bestTotal) continue;
          const v = varietyPenalty(flat(), ctx);
          if (ds - v > bestTotal + 0.01) {
            best = cand;
            bestTotal = ds - v;
            bestDay = ds;
            bestVar = v;
          }
        }
        cur[d][si] = best;
        if (best !== before) {
          improved = true;
          dayScores[d] = bestDay;
          variety = bestVar;
        }
      }
    }
    if (!improved) break;
  }

  const out: PlanEntry[] = [];
  cur.forEach((row, d) =>
    row.forEach((r, si) => {
      if (!r) return;
      const date = ctx.dates[d];
      const slot = ctx.slots[si];
      const key = `${date}|${slot}`;
      const lockedEntry = ctx.locked.find((l) => l.key === key);
      out.push(lockedEntry ?? { key, date, slot, recipeId: r.id, servings: ctx.servings });
    }),
  );
  return out;
}

/** Recettes qui comblent le mieux un nutriment (par portion) */
export function bestSourcesOf(key: string, recipes: IndexedRecipe[], slotFilter?: (r: IndexedRecipe) => boolean, n = 4): IndexedRecipe[] {
  return recipes
    .filter((r) => r.micros && (!slotFilter || slotFilter(r)))
    .sort((a, b) => (b.micros![key] ?? 0) - (a.micros![key] ?? 0))
    .slice(0, n);
}
