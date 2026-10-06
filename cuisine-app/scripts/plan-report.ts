/**
 * Simule une semaine « Nous deux » optimisée et affiche la couverture de chacun.
 *   npx tsx scripts/plan-report.ts [profil alimentaire, ex. wapf,gaps]
 * Sert à repérer les nutriments difficiles à couvrir et les profils qui manquent de recettes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { computeDetailed, DEFAULT_PROFILES, NUTRIENTS } from '../src/domain/micronutrients';
import { analyzeDigestion, compatibility, DIET_BY_ID, type DietProfileId } from '../src/domain/digestion';
import { dayReport, generateNutriWeek, householdEaters } from '../src/domain/nutriPlanner';
import { analyzeWeek } from '../src/domain/week';
import { newProfile } from '../src/domain/profile';
import type { Recipe, Slot } from '../src/domain/types';

const diets = (process.argv[2] ?? 'wapf').split(',') as DietProfileId[];
const lookup = (id: string) => INGREDIENT_BY_ID[id];
const dir = join(import.meta.dirname, '../src/data/recipes');
const all = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Recipe[]);
const recipes = all
  .filter((r) => diets.every((d) => compatibility(r, DIET_BY_ID[d], lookup).ok))
  .map((r) => {
    const ix = indexRecipe(r, lookup);
    ix.micros = computeDetailed(r, lookup);
    const d = analyzeDigestion(r, lookup);
    ix.digest = { oxalateMg: d.oxalateMg, oxalateLevel: d.oxalateLevel, prepared: d.prepared, alerts: 0, fermented: d.fermented, broth: d.broth, organs: d.organs };
    return ix;
  });
const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
const count = (s: Slot) => recipes.filter((r) => (s === 'matin' ? r.mealTypes.includes('petit-dejeuner') : s === 'collation' ? r.mealTypes.includes('collation') : r.mealTypes.includes('dejeuner') || r.mealTypes.includes('diner'))).length;
console.log(`Profil ${diets.join(' + ')} : ${recipes.length} recettes (matin ${count('matin')}, midi/soir ${count('midi')}, collation ${count('collation')})`);

// profils réalistes : lui prend du muscle (4 séances), elle reste en forme
const PROFILES = process.env.DEFAULTS
  ? DEFAULT_PROFILES
  : [
      newProfile({ id: 'lui', name: 'Lui', sex: 'homme', age: 30, height: 182, weight: 76, daily: 'sedentaire', sport: { sessions: 4, type: 'musculation', minutes: 60 }, trainingDays: [0, 1, 3, 4], objective: 'prise-de-muscle' }),
      newProfile({ id: 'elle', name: 'Elle', sex: 'femme', age: 29, height: 164, weight: 56, daily: 'leger', objective: 'maintien' }),
    ];
const eaters = householdEaters(PROFILES);
const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
const plan = generateNutriWeek({ recipes, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots, servings: 2, seed: Number(process.env.SEED ?? 1), eaters, lookup }, (id) => lookup(id)?.category);
const byId = new Map(recipes.map((r) => [r.id, r]));
console.log(`${plan.length} créneaux remplis, ${new Set(plan.map((p) => p.recipeId)).size} recettes différentes`);
const gaps = new Map<string, number>();
for (const e of eaters) {
  const covs: number[] = [];
  for (const d of dates) {
    const rep = dayReport(d, plan.filter((p) => p.date === d).map((p) => byId.get(p.recipeId)!), e.profile, () => e.portions);
    covs.push(Math.round(rep.coverage));
    for (const g of rep.gaps) gaps.set(`${e.profile.name} · ${g}`, (gaps.get(`${e.profile.name} · ${g}`) ?? 0) + 1);
  }
  console.log(`${e.profile.name} (${e.portions.toFixed(2)} portion) : ${covs.join(' / ')} %`);
}
const label = (k: string) => NUTRIENTS.find((n) => n.key === k)?.label ?? k;
for (const [k, n] of [...gaps].sort((a, b) => b[1] - a[1])) {
  const [who, key] = k.split(' · ');
  console.log(`  < 80 % : ${who} · ${label(key)} (${n} j)`);
}

console.log('— Semaine (moyenne des jours, parts du jour, compléments compris) —');
const t0 = Date.now();
for (const w of analyzeWeek(plan, byId, PROFILES, lookup)) {
  const low = w.gaps.map((g) => `${g.label.replace(/ \(.*\)/, '')} ${Math.round(w.pct[g.key])} %`);
  console.log(`${w.profile.name} : couverture ${w.coverage.toFixed(1)} % · manques : ${low.join(', ') || 'aucun'} · excès : ${w.excess.map((e) => e.def.label).join(', ') || 'aucun'}`);
}
void t0;
