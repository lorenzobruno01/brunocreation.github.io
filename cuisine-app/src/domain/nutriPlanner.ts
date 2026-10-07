// ─────────────────────────────────────────────────────────────
// Planificateur « densité nutritionnelle » : compose la semaine
// pour s'approcher chaque jour de 100 % des besoins en vitamines,
// minéraux, électrolytes, acides aminés, oméga-3 et fibres,
// tout en respectant l'énergie visée, la variété et les critères.
// Méthode : semaine variée de départ puis optimisation locale
// (on remplace créneau par créneau le plat qui améliore le plus
// la couverture globale), plusieurs passes.
// ─────────────────────────────────────────────────────────────
import type { Feedback, IndexedRecipe, PlanEntry, Slot, SlotMode } from './types';
import { dailyRef, NUTRIENTS, type NutritionProfile } from './micronutrients';
import { breakfastOk, generateWeek, isMainMeal, isSimple, passesConstraints, type PlannerContext } from './planner';
import { currentSeason } from './season';
import type { IngredientLookup } from './indexing';
import { dayKcal, needs } from './profile';
import { preferenceBonus, recipeConflict } from './allergens';
import { learnedBonus, recipeScores, suspectIngredients } from './learning';
import { SHARE_LIMITS, SLOT_SHARE } from './shares';

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

/** Une personne qui partage les repas, et la part de chaque plat qu'elle mange (en portions) */
export interface Eater {
  profile: NutritionProfile;
  portions: number;
}

/**
 * Repas partagés : chacun mange une part proportionnelle à son objectif
 * énergétique (ex. 3 000 et 2 200 kcal → 1,15 et 0,85 portion d'un plat pour 2).
 */
export function householdEaters(profiles: NutritionProfile[]): Eater[] {
  if (profiles.length === 1) return [soloEater(profiles[0])];
  const total = profiles.reduce((s, p) => s + p.kcal, 0) || 1;
  return profiles.map((profile) => ({ profile, portions: (profiles.length * profile.kcal) / total }));
}

/** Énergie d'une journée type à 1 portion de chaque plat (4 repas de la bibliothèque) */
export const DAY_KCAL_AT_ONE_PORTION = 2600;

/** Personne seule : sa part est ajustée à son objectif (0,6 à 1,6 portion) */
export function soloEater(profile: NutritionProfile): Eater {
  return { profile, portions: Math.round(Math.min(1.6, Math.max(0.6, profile.kcal / DAY_KCAL_AT_ONE_PORTION)) * 100) / 100 };
}

export interface NutriPlanContext extends PlannerContext {
  /** objectif pour une seule personne (1 portion de chaque plat) */
  profile?: NutritionProfile;
  /** objectif pour plusieurs personnes qui mangent les mêmes plats */
  eaters?: Eater[];
  passes?: number;
  /** base d'ingrédients : allergies, intolérances et goûts de chacun */
  lookup?: IngredientLookup;
  /** retours après les repas : plats aimés, à ne pas refaire, ingrédients suspects */
  feedback?: Feedback[];
  /** gabarit de semaine : `${jour 0-6}|${créneau}` → temps dispo, dehors, restes, batch */
  template?: Record<string, SlotMode>;
  /** ingrédients à utiliser vite (frigo, restes) : favorisés en début de semaine */
  useSoon?: Set<string>;
  /** coût estimé d'une portion (€) et budget de la semaine */
  costOf?: (r: IndexedRecipe) => number;
  budget?: number;
}

/** Applique le gabarit à un planning déjà fait (mode « variété ») : dehors retirés, restes liés */
export function applyTemplate(entries: PlanEntry[], dates: string[], slots: Slot[], template?: Record<string, SlotMode>): PlanEntry[] {
  if (!template) return entries;
  const wd = (date: string) => (new Date(date + 'T12:00:00').getDay() + 6) % 7;
  const links = leftoverLinks(dates, slots, template);
  const byKey = new Map(entries.map((e) => [e.key, e]));
  return entries
    .filter((e) => template[`${wd(e.date)}|${e.slot}`] !== 'dehors')
    .map((e) => {
      const src = links.get(e.key);
      const s = src && byKey.get(src);
      return s ? { ...e, recipeId: s.recipeId, servings: 0, leftoverOf: src } : e;
    });
}

/** Plat qui se prépare à l'avance et se garde quelques jours */
export function batchFriendly(r: IndexedRecipe): boolean {
  return ['mijote', 'braise', 'four', 'roti'].includes(r.technique) || ['soupe', 'mijote'].includes(r.category) || r.tags.some((t) => /avance|se conserve|batch/.test(t));
}

const MAIN_SLOTS: Slot[] = ['midi', 'soir'];

/** Créneaux « restes » → créneau d'origine (repas principal précédent, même semaine) */
export function leftoverLinks(dates: string[], slots: Slot[], template: Record<string, SlotMode> | undefined): Map<string, string> {
  const links = new Map<string, string>();
  if (!template) return links;
  const wd = (date: string) => (new Date(date + 'T12:00:00').getDay() + 6) % 7;
  let lastMain: string | undefined;
  for (const date of dates)
    for (const slot of slots) {
      const mode = template[`${wd(date)}|${slot}`];
      const key = `${date}|${slot}`;
      if (mode === 'restes' && lastMain) links.set(key, lastMain);
      else if (MAIN_SLOTS.includes(slot) && mode !== 'dehors' && mode !== 'restes') lastMain = key;
    }
  return links;
}

function eatersOf(ctx: NutriPlanContext): Eater[] {
  if (ctx.eaters?.length) return ctx.eaters;
  if (ctx.profile) return [{ profile: ctx.profile, portions: 1 }];
  throw new Error('Profil nutritionnel manquant');
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
  // Objectifs hebdomadaires traditionnels (WAPF / Deep Nutrition) : abats, bouillons, fermentés, poisson gras
  let organs = 0;
  let broth = 0;
  let fermented = 0;
  let fattyFish = 0;
  for (const { r } of entries) {
    if (r.digest?.organs) organs++;
    if (r.digest?.broth) broth++;
    if (r.digest?.fermented) fermented++;
    if (r.mainProtein === 'poisson-gras') fattyFish++;
  }
  if (organs < 1) p += 12;
  if (broth < 2) p += (2 - broth) * 6;
  if (fermented < 3) p += (3 - fermented) * 4;
  if (!c.minFish && fattyFish < 2) p += (2 - fattyFish) * 6;
  return p;
}

function candidatesFor(slot: Slot, weekend: boolean, ctx: NutriPlanContext): IndexedRecipe[] {
  const season = ctx.season ?? currentSeason();
  const c = ctx.constraints ?? {};
  return ctx.recipes.filter((r) => {
    if (!isMainMeal(r, slot) || !r.micros) return false;
    if (slot === 'midi' || slot === 'soir') return passesConstraints(r, c, weekend, ctx.favorites, season);
    if (slot === 'matin' && !breakfastOk(r, c)) return false;
    // petit-déjeuner / collation : rapide en semaine sauf préparation à l'avance
    if (!weekend && r.totalTime > 25 && !r.tags.includes('préparation à l’avance')) return false;
    // goûters de semaine tout simples (fruit + laitage, œufs durs…), sauf si l'option est désactivée
    if (!weekend && slot === 'collation' && c.simpleSnacks !== false && !isSimple(r)) return false;
    if (c.excludeProteins?.length && r.mainProtein && c.excludeProteins.includes(r.mainProtein)) return false;
    if (c.seasonOnly && r.seasons.length && !r.seasons.includes(season)) return false;
    return true;
  });
}

// ── Optimisation à la semaine ──────────────────────────────
// Chaque personne mange une part de chaque plat proportionnelle à son
// énergie du jour (jours d'entraînement compris). L'objectif principal
// est la moyenne de la semaine : ≥ 100 % de chaque nutriment, sans
// dépasser les limites de sécurité (vitamine A, sélénium, zinc…).

const KEYS = NUTRIENTS.map((n) => n.key as string);
const K = KEYS.length;
const IDX = Object.fromEntries(KEYS.map((k, i) => [k, i]));
const T_IDX = TARGETS.map((n) => IDX[n.key]);
const T_W = TARGETS.map((n) => WEIGHT[n.group] ?? 1);
const T_WSUM = T_W.reduce((a, b) => a + b, 0);
const UPPER = NUTRIENTS.filter((n) => n.upper).map((n) => ({ i: IDX[n.key], upper: n.upper! }));
const NA = IDX.na;
const SODIUM_LIMIT = NUTRIENTS.find((n) => n.key === 'na')!.ref[0];

interface EaterTarget {
  profile: NutritionProfile;
  refs: Float64Array;
  /** énergie et protéines visées par jour de la semaine (0 = lundi) */
  kcal: number[];
  protein: number;
}

interface DayEval {
  /** apports du jour par personne */
  vec: Float64Array[];
  /** pénalités du jour (énergie, protéines) par personne */
  pen: number[];
}

function microVec(r: IndexedRecipe): Float64Array {
  const v = new Float64Array(K);
  const m = r.micros;
  if (m) for (let i = 0; i < K; i++) v[i] = m[KEYS[i]] ?? 0;
  return v;
}

function evalDay(day: Array<{ r: IndexedRecipe; slot: Slot } | undefined>, weekday: number, targets: EaterTarget[], vecs: Map<string, Float64Array>): DayEval {
  let kcalAtOne = 0;
  let protAtOne = 0;
  let frac = 0;
  const base = new Float64Array(K);
  for (const x of day) {
    if (!x) continue;
    kcalAtOne += x.r.nutrition.kcal;
    protAtOne += x.r.nutrition.protein;
    frac += SLOT_SHARE[x.slot];
    const v = vecs.get(x.r.id)!;
    for (let i = 0; i < K; i++) base[i] += v[i];
  }
  frac = Math.min(1, frac);
  const vec: Float64Array[] = [];
  const pen: number[] = [];
  for (const t of targets) {
    const tk = t.kcal[weekday] * frac;
    const portion = kcalAtOne ? Math.min(SHARE_LIMITS.max, Math.max(SHARE_LIMITS.min, tk / kcalAtOne)) : 0;
    const v = new Float64Array(K);
    for (let i = 0; i < K; i++) v[i] = base[i] * portion;
    vec.push(v);
    let p = 0;
    if (kcalAtOne) {
      const dev = Math.abs((kcalAtOne * portion) / tk - 1);
      p += Math.max(0, dev - 0.08) * 120;
      const tp = t.protein * frac;
      const prot = protAtOne * portion;
      if (prot < tp) p += ((tp - prot) / tp) * 40;
    }
    pen.push(p);
  }
  return { vec, pen };
}

/** Score de la semaine pour une personne (≈ 100 si tout est couvert sans excès) */
function weekScore(sum: Float64Array, t: EaterTarget, days: number): number {
  if (!days) return 0;
  let s = 0;
  for (let j = 0; j < T_IDX.length; j++) {
    // marge de 3 % : on vise un peu au-dessus de 100 % pour ne pas finir à 99 %
    const ratio = sum[T_IDX[j]] / days / t.refs[T_IDX[j]] / 1.03;
    // les derniers % manquants comptent le plus : on veut ≥ 100 % pour chacun
    s += T_W[j] * (Math.min(1, ratio) * 100 - Math.max(0, 1 - ratio) * 80);
  }
  s /= T_WSUM;
  for (const u of UPPER) {
    const avg = sum[u.i] / days;
    if (avg > u.upper * 0.95) s -= (avg / (u.upper * 0.95) - 1) * 150;
  }
  // sodium des recettes (hors sel ajouté à table) : rester sous le repère
  const na = sum[NA] / days;
  if (na > SODIUM_LIMIT * 0.95) s -= ((na - SODIUM_LIMIT * 0.95) / 1000) * 30;
  return s;
}

function combine(scores: number[]): number {
  if (scores.length === 1) return scores[0];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return 0.5 * mean + 0.5 * Math.min(...scores);
}

export function generateNutriWeek(input: NutriPlanContext, categoryOf: (id: string) => string | undefined): PlanEntry[] {
  const eaters = eatersOf(input);
  const profiles = eaters.map((e) => e.profile);
  // allergies, intolérances, aliments détestés, piquant : exclus pour toute la tablée
  const ctx: NutriPlanContext = input.lookup ? { ...input, recipes: input.recipes.filter((r) => !recipeConflict(r, profiles, input.lookup!)) } : input;
  const targets: EaterTarget[] = profiles.map((p) => {
    const refs = refsFor(p);
    return {
      profile: p,
      refs: Float64Array.from(KEYS.map((k) => refs[k] || 1)),
      kcal: [0, 1, 2, 3, 4, 5, 6].map((d) => dayKcal(p, d)),
      protein: needs(p)?.protein ?? p.weight * p.proteinPerKg,
    };
  });
  const byId = new Map(ctx.recipes.map((r) => [r.id, r]));
  for (const l of ctx.locked) {
    const r = input.recipes.find((x) => x.id === l.recipeId);
    if (r) byId.set(r.id, r);
  }
  const vecs = new Map<string, Float64Array>();
  for (const r of byId.values()) vecs.set(r.id, microVec(r));
  const learned = profiles.map((p) => ({
    scores: recipeScores(ctx.feedback ?? [], p.id),
    suspects: new Set(input.lookup && ctx.feedback?.length ? suspectIngredients(ctx.feedback, p.id, (id) => input.recipes.find((r) => r.id === id), input.lookup, p.learnDismissed).map((x) => x.ingredient.id) : []),
  }));
  const bonus = (r: IndexedRecipe) =>
    profiles.reduce((s, p, i) => s + preferenceBonus(r, p) + learnedBonus(learned[i].scores, r.id) - r.ingredients.filter((x) => learned[i].suspects.has(x.id)).length * 6, 0);

  // 0. gabarit : dehors (rien), restes (lié à un repas), temps disponible, batch
  const weekdayOf = (date: string) => (new Date(date + 'T12:00:00').getDay() + 6) % 7;
  const weekendOf = (date: string) => weekdayOf(date) >= 5;
  const modeOf = (d: number, si: number): SlotMode => ctx.template?.[`${weekdayOf(ctx.dates[d])}|${ctx.slots[si]}`] ?? 'libre';
  const locked = new Set(ctx.locked.map((l) => l.key));
  const links = leftoverLinks(ctx.dates, ctx.slots, ctx.template);
  const cellOf = (key: string): [number, number] => {
    const [date, slot] = key.split('|');
    return [ctx.dates.indexOf(date), ctx.slots.indexOf(slot as Slot)];
  };
  const deps = new Map<string, Array<[number, number]>>();
  for (const [k, src] of links) if (!locked.has(k)) (deps.get(src) ?? deps.set(src, []).get(src)!).push(cellOf(k));
  const isDep = (d: number, si: number) => links.has(`${ctx.dates[d]}|${ctx.slots[si]}`) && !locked.has(`${ctx.dates[d]}|${ctx.slots[si]}`);
  const isOff = (d: number, si: number) => modeOf(d, si) === 'dehors' && !locked.has(`${ctx.dates[d]}|${ctx.slots[si]}`);

  const pools = new Map<string, IndexedRecipe[]>();
  const poolOf = (d: number, si: number): IndexedRecipe[] => {
    const slot = ctx.slots[si];
    const we = weekendOf(ctx.dates[d]);
    const mode = modeOf(d, si);
    const k = `${slot}|${we}|${mode}`;
    let pool = pools.get(k);
    if (!pool) {
      const base = candidatesFor(slot, we, ctx);
      const limit = mode === '15' || mode === '30' || mode === '45' ? Number(mode) : 0;
      // peu de plats très rapides : on élargit par paliers de 10 min plutôt que d'ignorer la limite
      pool = base;
      for (let extra = 0; extra <= 30; extra += 10) {
        const filtered = base.filter((r) => (!limit || r.totalTime <= limit + extra) && (mode !== 'batch' || batchFriendly(r)));
        if (filtered.length >= 3) {
          pool = filtered;
          break;
        }
      }
      pools.set(k, pool);
    }
    return pool;
  };

  // 1. semaine variée de départ, ajustée au gabarit
  const start = generateWeek(ctx, categoryOf);
  const cur: Array<Array<IndexedRecipe | undefined>> = ctx.dates.map((date) =>
    ctx.slots.map((slot) => {
      const e = start.find((x) => x.key === `${date}|${slot}`);
      return e ? byId.get(e.recipeId) : undefined;
    }),
  );
  const used = new Set<string>();
  for (let d = 0; d < ctx.dates.length; d++)
    for (let si = 0; si < ctx.slots.length; si++) {
      const key = `${ctx.dates[d]}|${ctx.slots[si]}`;
      if (locked.has(key)) continue;
      if (isOff(d, si) || isDep(d, si)) {
        cur[d][si] = undefined;
        continue;
      }
      const pool = poolOf(d, si);
      if (!cur[d][si] || !pool.includes(cur[d][si]!)) cur[d][si] = pool.find((r) => !used.has(r.id)) ?? pool[0];
      if (cur[d][si]) used.add(cur[d][si]!.id);
    }
  const syncDeps = (d: number, si: number) => {
    for (const [dd, ss] of deps.get(`${ctx.dates[d]}|${ctx.slots[si]}`) ?? []) cur[dd][ss] = cur[d][si];
  };
  for (const src of deps.keys()) {
    const [d, si] = cellOf(src);
    if (d >= 0 && si >= 0) syncDeps(d, si);
  }

  const dayOf = (d: number) => cur[d].map((r, si) => (r ? { r, slot: ctx.slots[si] } : undefined));
  /** liste pour la variété : les restes ne sont pas des doublons */
  const flat = () => {
    const out: Array<{ slot: Slot; r: IndexedRecipe; day: number }> = [];
    cur.forEach((row, day) => row.forEach((r, si) => r && !isDep(day, si) && out.push({ slot: ctx.slots[si], r, day })));
    return out;
  };
  const evals = cur.map((_, d) => evalDay(dayOf(d), weekdayOf(ctx.dates[d]), targets, vecs));
  const sums = targets.map((_, e) => {
    const s = new Float64Array(K);
    for (const ev of evals) for (let i = 0; i < K; i++) s[i] += ev.vec[e][i];
    return s;
  });
  const filledDays = () => cur.filter((row) => row.some(Boolean)).length;
  let nDays = filledDays();
  let dayPen = evals.reduce((s, ev) => s + combine(ev.pen), 0);
  const soon = ctx.useSoon ?? new Set<string>();
  /** bonus : goûts, apprentissage, ingrédients à utiliser vite en début de semaine */
  const cellBonus = (r: IndexedRecipe, d: number) => bonus(r) + (soon.size && d < 3 ? r.ingredients.filter((i) => soon.has(i.id)).length * (6 - d * 2) : 0);
  let prefs = 0;
  cur.forEach((row, d) => row.forEach((r, si) => r && !isDep(d, si) && (prefs += cellBonus(r, d))));
  const objective = (weekScores: number[], days: number, pen: number, pr: number) => days * combine(weekScores) - pen + pr;
  const extra = () => varietyPenalty(flat(), ctx) + budgetPenalty();
  /** budget : au-delà, chaque euro compte */
  const budgetPenalty = () => {
    if (!ctx.budget || !ctx.costOf) return 0;
    const portions = eaters.reduce((s, e) => s + e.portions, 0);
    let cost = 0;
    cur.forEach((row, d) => row.forEach((r, si) => r && !isDep(d, si) && (cost += ctx.costOf!(r) * portions * (deps.get(`${ctx.dates[d]}|${ctx.slots[si]}`)?.length ? 2 : 1))));
    return Math.max(0, cost - ctx.budget) * 4;
  };
  let variety = extra();
  let total = objective(targets.map((t, e) => weekScore(sums[e], t, nDays)), nDays, dayPen, prefs) - variety;

  // 2. optimisation locale, créneau par créneau
  const tmp = targets.map(() => new Float64Array(K));
  const passes = ctx.passes ?? 4;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (let d = 0; d < ctx.dates.length; d++) {
      for (let si = 0; si < ctx.slots.length; si++) {
        const key = `${ctx.dates[d]}|${ctx.slots[si]}`;
        if (locked.has(key) || isOff(d, si) || isDep(d, si)) continue;
        const pool = poolOf(d, si);
        const before = cur[d][si];
        const affected = [...new Set([d, ...(deps.get(key) ?? []).map(([dd]) => dd)])];
        const oldEvals = affected.map((x) => evals[x]);
        let best = before;
        let bestTotal = total;
        let bestEvals = oldEvals;
        let bestVar = variety;
        for (const cand of pool) {
          if (cand === before) continue;
          cur[d][si] = cand;
          syncDeps(d, si);
          const evs = affected.map((x) => evalDay(dayOf(x), weekdayOf(ctx.dates[x]), targets, vecs));
          const days = filledDays();
          const ws = targets.map((t, e) => {
            const s = tmp[e];
            s.set(sums[e]);
            for (let a = 0; a < affected.length; a++) {
              const o = oldEvals[a].vec[e];
              const n = evs[a].vec[e];
              for (let i = 0; i < K; i++) s[i] += n[i] - o[i];
            }
            return weekScore(s, t, days);
          });
          let pen = dayPen;
          for (let a = 0; a < affected.length; a++) pen += combine(evs[a].pen) - combine(oldEvals[a].pen);
          const pr = prefs - (before ? cellBonus(before, d) : 0) + cellBonus(cand, d);
          const quick = objective(ws, days, pen, pr) - variety;
          // la variété varie rarement de plus de 70 points : on évite son calcul complet
          if (quick + 70 < bestTotal) continue;
          const v = extra();
          const t = quick + variety - v;
          if (t > bestTotal + 0.01) {
            best = cand;
            bestTotal = t;
            bestEvals = evs;
            bestVar = v;
          }
        }
        cur[d][si] = best;
        syncDeps(d, si);
        if (best !== before) {
          improved = true;
          for (let a = 0; a < affected.length; a++) {
            for (let e = 0; e < targets.length; e++) for (let i = 0; i < K; i++) sums[e][i] += bestEvals[a].vec[e][i] - oldEvals[a].vec[e][i];
            dayPen += combine(bestEvals[a].pen) - combine(oldEvals[a].pen);
            evals[affected[a]] = bestEvals[a];
          }
          prefs += cellBonus(best!, d) - (before ? cellBonus(before, d) : 0);
          variety = bestVar;
          total = bestTotal;
          nDays = filledDays();
        }
      }
    }
    if (!improved) break;
  }
  void nDays;

  const out: PlanEntry[] = [];
  cur.forEach((row, d) =>
    row.forEach((r, si) => {
      if (!r) return;
      const date = ctx.dates[d];
      const slot = ctx.slots[si];
      const key = `${date}|${slot}`;
      const lockedEntry = ctx.locked.find((l) => l.key === key);
      const src = isDep(d, si) ? links.get(key) : undefined;
      out.push(lockedEntry ?? { key, date, slot, recipeId: r.id, servings: src ? 0 : ctx.servings, ...(src ? { leftoverOf: src } : {}) });
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
