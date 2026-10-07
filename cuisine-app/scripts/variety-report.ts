/**
 * Simule N semaines d'affilée (« Nous deux ») et mesure la variété :
 * recettes différentes, répétitions d'une semaine à l'autre, couverture.
 *   npx tsx scripts/variety-report.ts [semaines=12]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { computeDetailed, NUTRIENTS } from '../src/domain/micronutrients';
import { analyzeDigestion, compatibility, DIET_BY_ID } from '../src/domain/digestion';
import { generateNutriWeek, householdEaters, recentPlanned } from '../src/domain/nutriPlanner';
import { analyzeWeek } from '../src/domain/week';
import { newProfile } from '../src/domain/profile';
import type { PlanEntry, Recipe, Slot } from '../src/domain/types';

const WEEKS = Number(process.argv[2] ?? 12);
const lookup = (id: string) => INGREDIENT_BY_ID[id];
const dir = join(import.meta.dirname, '../src/data/recipes');
const recipes = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Recipe[])
  .filter((r) => compatibility(r, DIET_BY_ID.wapf, lookup).ok)
  .map((r) => {
    const ix = indexRecipe(r, lookup);
    ix.micros = computeDetailed(r, lookup);
    const d = analyzeDigestion(r, lookup);
    ix.digest = { oxalateMg: d.oxalateMg, oxalateLevel: d.oxalateLevel, prepared: d.prepared, alerts: 0, fermented: d.fermented, broth: d.broth, organs: d.organs };
    return ix;
  });
const byId = new Map(recipes.map((r) => [r.id, r]));
const PROFILES = [
  newProfile({ id: 'lui', name: 'Lui', sex: 'homme', age: 30, height: 182, weight: 76, daily: 'sedentaire', sport: { sessions: 4, type: 'musculation', minutes: 60 }, trainingDays: [0, 1, 3, 4], objective: 'prise-de-muscle' }),
  newProfile({ id: 'elle', name: 'Elle', sex: 'femme', age: 29, height: 164, weight: 56, daily: 'leger', objective: 'maintien' }),
];
const eaters = householdEaters(PROFILES);
const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
const day0 = new Date('2026-10-05T12:00:00');
const iso = (d: Date) => d.toISOString().slice(0, 10);
const history: PlanEntry[] = [];
const all = new Set<string>();
const covs: number[] = [];
const gaps: string[] = [];
let repeats = 0;
let mains = 0;
const t0 = Date.now();
for (let w = 0; w < WEEKS; w++) {
  const dates = [...Array(7)].map((_, i) => iso(new Date(day0.getTime() + (w * 7 + i) * 86400000)));
  const base = !!process.env.BASE; // BASE=1 : sans historique ni tirage, pour comparer
  const recent = base || process.env.NOREC ? undefined : recentPlanned(history, dates[0]);
  const plan = generateNutriWeek(
    { recipes, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots, servings: 2, seed: base || process.env.NOSEED ? undefined : 1000 + w, eaters, lookup, recent },
    (id) => lookup(id)?.category,
  );
  const prev = new Set(history.filter((h) => h.date >= iso(new Date(day0.getTime() + (w - 1) * 7 * 86400000))).map((h) => h.recipeId));
  for (const p of plan) {
    all.add(p.recipeId);
    if (p.slot === 'midi' || p.slot === 'soir') {
      mains++;
      if (prev.has(p.recipeId)) repeats++;
    }
  }
  history.push(...plan);
  for (const r of analyzeWeek(plan, byId, PROFILES, lookup)) {
    covs.push(r.coverage);
    gaps.push(...r.gaps.map((g) => `${r.profile.name}:${g.label.replace(/ \(.*\)/, '')}`));
  }
}
const label = (k: string) => NUTRIENTS.find((n) => n.key === k)?.label ?? k;
void label;
console.log(`${WEEKS} semaines : ${all.size} recettes différentes sur ${recipes.length}`);
console.log(`midi/soir repris de la semaine précédente : ${repeats}/${mains} (${Math.round((repeats / mains) * 100)} %)`);
console.log(`couverture moyenne ${(covs.reduce((a, b) => a + b, 0) / covs.length).toFixed(1)} %, min ${Math.min(...covs).toFixed(1)} %`);
console.log(`manques : ${gaps.length} (${[...new Set(gaps)].join(', ') || 'aucun'})`);
console.log(`${((Date.now() - t0) / WEEKS / 1000).toFixed(1)} s par semaine`);
