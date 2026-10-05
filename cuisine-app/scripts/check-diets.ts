/**
 * Compatibilité des recettes d'un fichier avec des approches alimentaires.
 *   npx tsx scripts/check-diets.ts src/data/recipes/<fichier>.json [wapf,anti-inflammatoire,…]
 * Par défaut : les approches du foyer (WAPF, anti-inflammatoire, pauvre en oxalates,
 * prudent en phytoestrogènes, Primal). Affiche chaque recette incompatible et la raison.
 */
import { readFileSync } from 'node:fs';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { analyzeDigestion, compatibility, DIET_BY_ID, type DietProfileId } from '../src/domain/digestion';

const file = process.argv[2];
const diets = (process.argv[3] ?? 'wapf,anti-inflammatoire,pauvre-oxalates,phyto-prudent,primal').split(',') as DietProfileId[];
const lookup = (id: string) => INGREDIENT_BY_ID[id];
const recipes = JSON.parse(readFileSync(file, 'utf8'));
let bad = 0;
for (const r of recipes) {
  const d = analyzeDigestion(r, lookup);
  const reasons = diets.flatMap((id) => {
    const c = compatibility(r, DIET_BY_ID[id], lookup, d);
    return c.ok ? [] : [`${id} : ${c.reasons.join(', ')}`];
  });
  if (reasons.length) {
    bad++;
    console.log(`❌ ${r.id}\n   ${reasons.join('\n   ')}`);
  }
}
console.log(`\n${recipes.length - bad}/${recipes.length} recettes compatibles avec : ${diets.join(', ')}`);
