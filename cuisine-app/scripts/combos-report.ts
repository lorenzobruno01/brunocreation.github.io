/** Combinaisons d’ingrédients courantes sans recette (compatibles avec les approches du foyer).
 *   npx tsx scripts/combos-report.ts [fichier.json] */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { equivalentsOf } from '../src/domain/matching';
const dir = join(import.meta.dirname, '../src/data/recipes');
const recipes = readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const has = (r: any, id: string) => r.ingredients.some((i: any) => i.id === id || equivalentsOf(id).includes(i.id));
const P = ['poulet-cuisse', 'boeuf-hache', 'boeuf-steak', 'boeuf-paleron', 'porc-echine', 'agneau-epaule', 'dinde-escalope', 'saumon', 'cabillaud', 'thon-conserve', 'sardine-conserve', 'crevette', 'oeuf', 'lardons', 'jambon-blanc', 'chorizo', 'lentilles-vertes', 'pois-chiches', 'maquereau'];
const S = ['riz-blanc', 'pomme-de-terre', 'patate-douce', 'polenta'];
const V = ['courgette', 'brocoli', 'carotte', 'poivron-rouge', 'tomate', 'champignon', 'haricots-verts', 'courge-butternut', 'chou-fleur', 'aubergine', 'poireau', 'avocat', 'petits-pois'];
const X = ['tomates-concassees', 'creme-fraiche', 'lait-coco', 'comte', 'feta', 'mozzarella', 'pesto', 'mayonnaise'];
for (const id of [...P, ...S, ...V, ...X]) if (!INGREDIENT_BY_ID[id]) console.log('INCONNU', id);
const main = recipes.filter((r) => r.mealTypes.some((m: string) => m === 'dejeuner' || m === 'diner'));
const count = (ids: string[]) => main.filter((r) => ids.every((id) => has(r, id))).length;
const out: Record<string, string[]> = {};
const add = (p: string, c: string) => (out[p] ??= []).push(c);
for (const p of P) {
  for (const s of S) if (!count([p, s])) add(p, `${p} + ${s}`);
  for (const v of V) if (!count([p, v])) add(p, `${p} + ${v}`);
  for (const x of X) if (!count([p, x])) add(p, `${p} + ${x}`);
  for (const s of ['riz-blanc', 'pomme-de-terre']) for (const x of ['tomates-concassees', 'creme-fraiche', 'lait-coco', 'pesto']) if (!count([p, s, x])) add(p, `${p} + ${s} + ${x}`);
}
const total = Object.values(out).reduce((a, b) => a + b.length, 0);
console.log('combinaisons sans recette :', total);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
for (const [p, l] of Object.entries(out)) console.log(p, l.length);
