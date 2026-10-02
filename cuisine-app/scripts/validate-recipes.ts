/**
 * Validation de la bibliothèque de recettes.
 *   npx tsx scripts/validate-recipes.ts                 → toute la bibliothèque
 *   npx tsx scripts/validate-recipes.ts fichier.json    → un fichier (comparé au reste)
 *   npx tsx scripts/validate-recipes.ts --strict        → les avertissements font échouer
 *
 * Contrôle : schéma, ingrédients normalisés, philosophie alimentaire,
 * doublons / recettes trop proches, statistiques de répartition.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { checkPhilosophy } from '../src/domain/philosophy';
import { analyzeDigestion } from '../src/domain/digestion';
import { similarity, DUPLICATE_THRESHOLD, TOO_CLOSE_THRESHOLD } from '../src/domain/similarity';
import { CATEGORIES, CUISINES, DIFFICULTIES, FLAVORS, MEAL_TYPES, SEASONS, TECHNIQUES } from '../src/domain/labels';
import { RECIPE_UNITS } from '../src/domain/units';
import type { IndexedRecipe, Recipe } from '../src/domain/types';

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = resolve(here, '../src/data/recipes');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const quiet = args.includes('--quiet');
const target = args.find((a) => a.endsWith('.json'));

const lookup = (id: string) => INGREDIENT_BY_ID[id];
let errors = 0;
let warnings = 0;
const err = (file: string, id: string, msg: string) => {
  errors++;
  console.log(`❌ [${file}] ${id}: ${msg}`);
};
const warn = (file: string, id: string, msg: string) => {
  warnings++;
  if (!quiet) console.log(`⚠️  [${file}] ${id}: ${msg}`);
};

const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const all: Array<{ file: string; recipe: Recipe; indexed?: IndexedRecipe }> = [];
for (const f of files) {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  } catch (e) {
    err(f, '-', `JSON invalide : ${(e as Error).message}`);
    continue;
  }
  if (!Array.isArray(data)) {
    err(f, '-', 'le fichier doit contenir un tableau de recettes');
    continue;
  }
  for (const r of data as Recipe[]) all.push({ file: f, recipe: r });
}

const inScope = (file: string) => !target || basename(target) === file;
const seenIds = new Map<string, string>();
const seenNames = new Map<string, string>();

for (const item of all) {
  const { file, recipe: r } = item;
  const id = r.id ?? '(sans id)';
  const check = inScope(file);
  const E = (m: string) => check && err(file, id, m);
  const W = (m: string) => check && warn(file, id, m);

  if (!r.id || !/^[a-z0-9-]+$/.test(r.id)) E('id manquant ou invalide (kebab-case)');
  if (seenIds.has(r.id)) E(`id dupliqué (déjà dans ${seenIds.get(r.id)})`);
  seenIds.set(r.id, file);
  const nameKey = (r.name ?? '').toLowerCase().trim();
  if (seenNames.has(nameKey)) E(`nom dupliqué (déjà dans ${seenNames.get(nameKey)})`);
  seenNames.set(nameKey, file);

  if (!r.name || !r.description) E('nom / description manquant');
  if (!CATEGORIES[r.category]) E(`catégorie invalide : ${r.category}`);
  if (!Array.isArray(r.mealTypes) || !r.mealTypes.length || r.mealTypes.some((m) => !MEAL_TYPES[m])) E(`mealTypes invalides : ${r.mealTypes}`);
  if (!CUISINES[r.cuisine]) E(`cuisine invalide : ${r.cuisine}`);
  if (!DIFFICULTIES[r.difficulty]) E(`difficulté invalide : ${r.difficulty}`);
  if (!TECHNIQUES[r.technique]) E(`technique invalide : ${r.technique}`);
  if (!Array.isArray(r.flavors) || r.flavors.some((f) => !(f in FLAVORS))) E(`flavors invalides : ${r.flavors}`);
  if (!Array.isArray(r.seasons) || r.seasons.some((s) => !SEASONS[s])) E(`seasons invalides : ${r.seasons}`);
  if (!Array.isArray(r.tags)) E('tags manquants');
  if (typeof r.prepTime !== 'number' || typeof r.cookTime !== 'number') E('temps manquants');
  if (!(r.servings >= 1)) E('portions invalides');
  if (!Array.isArray(r.steps) || r.steps.length < 3) E('au moins 3 étapes requises');
  if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) {
    E('ingrédients manquants');
    continue;
  }
  let bad = false;
  const ingIds = new Set<string>();
  for (const ri of r.ingredients) {
    if (!INGREDIENT_BY_ID[ri.id]) {
      E(`ingrédient inconnu : « ${ri.id} »`);
      bad = true;
    }
    if (ingIds.has(ri.id)) W(`ingrédient listé deux fois : ${ri.id}`);
    ingIds.add(ri.id);
    if (!RECIPE_UNITS.includes(ri.unit)) {
      E(`unité invalide « ${ri.unit} » pour ${ri.id}`);
      bad = true;
    }
    if (typeof ri.qty !== 'number' || ri.qty < 0) E(`quantité invalide pour ${ri.id}`);
    if (ri.unit === 'piece' && INGREDIENT_BY_ID[ri.id] && !INGREDIENT_BY_ID[ri.id].pieceWeight) {
      E(`« piece » impossible pour ${ri.id} (pas de poids pièce) — utiliser g`);
      bad = true;
    }
  }
  if (bad) continue;

  const ix = indexRecipe(r, lookup);
  item.indexed = ix;
  for (const issue of checkPhilosophy(r, lookup)) (issue.level === 'error' ? E : W)(issue.message);
  for (const issue of analyzeDigestion(r, lookup).issues) if (issue.level !== 'info') (issue.level === 'error' ? E : W)(`[${issue.topic}] ${issue.message}`);

  const n = ix.nutrition;
  const isMain = r.category === 'plat' || r.category === 'mijote' || r.category === 'salade-composee';
  if (isMain && n.protein < 25) W(`plat principal pauvre en protéines (${n.protein} g/portion)`);
  if (isMain && n.kcal < 450) W(`plat principal peu énergétique (${n.kcal} kcal/portion)`);
  if (r.category === 'petit-dejeuner' && n.kcal < 300) W(`petit-déjeuner peu énergétique (${n.kcal} kcal)`);
  if (n.kcal > 1600) W(`calories très élevées (${n.kcal} kcal/portion) — vérifier les quantités`);
}

// ── Doublons / recettes trop proches ──
const indexed = all.filter((x) => x.indexed) as Array<{ file: string; recipe: Recipe; indexed: IndexedRecipe }>;
let close = 0;
for (let i = 0; i < indexed.length; i++) {
  for (let j = i + 1; j < indexed.length; j++) {
    const a = indexed[i];
    const b = indexed[j];
    if (!inScope(a.file) && !inScope(b.file)) continue;
    const s = similarity(a.indexed, b.indexed);
    if (s.score >= DUPLICATE_THRESHOLD) {
      err(a.file, a.recipe.id, `DOUBLON probable de « ${b.recipe.name} » (${b.file}) — score ${s.score.toFixed(2)} : ${s.reasons.join(', ')}`);
    } else if (s.score >= TOO_CLOSE_THRESHOLD) {
      close++;
      warn(a.file, a.recipe.id, `trop proche de « ${b.recipe.name} » (${b.file}) — score ${s.score.toFixed(2)} : ${s.reasons.join(', ')}`);
    }
  }
}

// ── Statistiques ──
const scope = indexed.filter((x) => inScope(x.file)).map((x) => x.indexed);
const count = <K extends string>(f: (r: IndexedRecipe) => K | K[] | undefined) => {
  const m: Record<string, number> = {};
  for (const r of scope) {
    const v = f(r);
    for (const k of Array.isArray(v) ? v : v ? [v] : []) m[k] = (m[k] ?? 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ');
};
console.log(`\n📚 ${scope.length} recettes valides${target ? ` dans ${basename(target)}` : ''} (${all.length} au total dans la bibliothèque)`);
console.log(`Repas      ${count((r) => r.mealTypes)}`);
console.log(`Catégorie  ${count((r) => r.category)}`);
console.log(`Cuisine    ${count((r) => r.cuisine)}`);
console.log(`Protéine   ${count((r) => r.mainProtein ?? 'aucune')}`);
console.log(`Difficulté ${count((r) => r.difficulty)}`);
console.log(`Technique  ${count((r) => r.technique)}`);
const t = (max: number) => scope.filter((r) => r.totalTime <= max).length;
console.log(`Temps      ≤15:${t(15)}  ≤30:${t(30)}  ≤45:${t(45)}  ≤60:${t(60)}  >60:${scope.length - t(60)}`);
const avg = (f: (r: IndexedRecipe) => number) => Math.round(scope.reduce((s, r) => s + f(r), 0) / Math.max(1, scope.length));
console.log(`Moyennes   ${avg((r) => r.nutrition.kcal)} kcal · ${avg((r) => r.nutrition.protein)} g prot. / portion`);
console.log(`\n${errors} erreur(s), ${warnings} avertissement(s), ${close} paire(s) trop proches`);
if (errors || (strict && warnings)) process.exit(1);
