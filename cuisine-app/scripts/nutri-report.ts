/**
 * Rapport micronutritionnel d'un fichier de recettes (aide à la rédaction).
 *   npx tsx scripts/nutri-report.ts src/data/recipes/<fichier>.json
 * Pour chaque recette : kcal, protéines, indice de densité (0–100) et les nutriments
 * couverts par UNE portion (en % des besoins journaliers d'un homme adulte).
 */
import { readFileSync } from 'node:fs';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { computeDetailed, densityScore, NUTRIENTS, DENSITY_KEYS } from '../src/domain/micronutrients';
import type { Recipe } from '../src/domain/types';

const file = process.argv[2];
const lookup = (id: string) => INGREDIENT_BY_ID[id];
const recipes: Recipe[] = JSON.parse(readFileSync(file, 'utf8'));
const label = (k: string) => NUTRIENTS.find((n) => n.key === k)!.label.replace(/ \\(.*\\)/, '');
let total = 0;
for (const r of recipes) {
  const ix = indexRecipe(r, lookup);
  const d = computeDetailed(r, lookup);
  const score = densityScore(d, ix.nutrition.kcal);
  total += score;
  const pct = DENSITY_KEYS.map((k) => [k, Math.round(((d[k] ?? 0) / NUTRIENTS.find((n) => n.key === k)!.ref[0]) * 100)] as const);
  const strong = pct.filter(([, p]) => p >= 30).sort((a, b) => b[1] - a[1]).map(([k, p]) => `${label(k)} ${p}%`);
  console.log(`${String(score).padStart(3)} | ${ix.nutrition.kcal} kcal ${ix.nutrition.protein} g | ${r.id}\n      forts : ${strong.join(', ') || '—'}`);
}
console.log(`\nIndice moyen : ${Math.round(total / recipes.length)} (${recipes.length} recettes)`);
