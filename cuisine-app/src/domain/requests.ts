// ─────────────────────────────────────────────────────────────
// Demandes en langage courant, traitées sur l'appareil (gratuit, sans
// clé d'API) : « combler mon manque de fer », « une recette pour deux ce
// soir en 30 min », « utiliser ce qui doit partir vite », « un plat avec
// du poulet riche en oméga-3 »… On reconnaît le nutriment, le temps, le
// repas, le nombre de personnes, les ingrédients, et on classe les plats
// de la bibliothèque compatibles avec la tablée.
// ─────────────────────────────────────────────────────────────
import type { Ingredient, IndexedRecipe, MealType } from './types';
import type { IngredientLookup } from './indexing';
import { dailyRef, NUTRIENTS, type NutrientDef, type NutritionProfile } from './micronutrients';
import { recipeConflict } from './allergens';
import { foodSourcesFor, type FoodSource } from './week';

const NUTRIENT_WORDS: Array<[RegExp, string]> = [
  [/\bfer\b|an[ée]mi/, 'fe'],
  [/om[ée]ga|epa|dha/, 'epa'],
  [/magn[ée]sium/, 'mg'],
  [/calcium|\bos\b/, 'ca'],
  [/\bzinc/, 'zn'],
  [/\biode/, 'i'],
  [/s[ée]l[ée]nium/, 'se'],
  [/potassium/, 'k'],
  [/fibre|transit/, 'fib'],
  [/choline/, 'chol'],
  [/vitamine\s*d\b|\bvit\.?\s*d\b/, 'vD'],
  [/vitamine\s*c\b/, 'vC'],
  [/vitamine\s*a\b/, 'vA'],
  [/vitamine\s*e\b/, 'vE'],
  [/vitamine\s*k\b/, 'vK'],
  [/b12/, 'vB12'],
  [/b9|folate|acide folique/, 'vB9'],
  [/b6\b/, 'vB6'],
];

const STOP = new Set(['une', 'des', 'pour', 'avec', 'sans', 'recette', 'recettes', 'plat', 'plats', 'idée', 'idées', 'ce', 'soir', 'midi', 'matin', 'deux', 'trois', 'quatre', 'rapide', 'manque', 'combler', 'mon', 'mes', 'riche', 'riches', 'utiliser', 'vite', 'reste', 'restes', 'frigo', 'quelque', 'chose', 'faire', 'manger', 'minutes', 'personnes', 'personne', 'veux', 'voudrais', 'aimerais', 'envie', 'dîner', 'diner', 'déjeuner', 'goûter', 'petit', 'apport', 'apports', 'plus', 'beaucoup', 'aide', 'moi', 'vitamine', 'vitamines', 'protéines', 'protéine', 'cuisiner']);

export interface ParsedRequest {
  nutrient?: NutrientDef;
  protein?: boolean;
  maxTime?: number;
  meal?: MealType;
  servings?: number;
  useSoon?: boolean;
  ingredients: Ingredient[];
}

export function parseRequest(text: string, ingredients: Ingredient[]): ParsedRequest {
  const t = text.toLowerCase();
  const key = NUTRIENT_WORDS.find(([re]) => re.test(t))?.[1];
  const time = /(\d+)\s*(?:min|minutes)/.exec(t);
  const hour = /(\d)\s*h(?:eures?)?\b/.exec(t);
  const people = /pour\s+(\d+|deux|trois|quatre|six)/.exec(t);
  const numbers: Record<string, number> = { deux: 2, trois: 3, quatre: 4, six: 6 };
  const meal: MealType | undefined = /soir|d[îi]ner/.test(t) ? 'diner' : /midi|d[ée]jeuner/.test(t) ? 'dejeuner' : /petit[- ]d[ée]j|matin/.test(t) ? 'petit-dejeuner' : /go[ûu]ter|collation|en-cas/.test(t) ? 'collation' : undefined;
  const words = t.split(/[^a-zàâçéèêëîïôûùüÿœ-]+/).filter((w) => w.length >= 4 && !STOP.has(w));
  const found: Ingredient[] = [];
  for (const w of words) {
    const sing = w.replace(/(s|x)$/, '');
    const hit = ingredients.find((i) => {
      const names = [i.name, i.plural ?? '', ...(i.aliases ?? [])].map((n) => n.toLowerCase());
      return names.some((n) => n === w || n === sing || n.split(' ')[0] === sing);
    });
    if (hit && !found.includes(hit)) found.push(hit);
  }
  return {
    nutrient: key ? NUTRIENTS.find((n) => n.key === key) : undefined,
    protein: /prot[ée]ine|muscle/.test(t),
    maxTime: time ? Number(time[1]) : hour ? Number(hour[1]) * 60 : /rapide|vite fait|express/.test(t) ? 30 : undefined,
    meal,
    servings: people ? (numbers[people[1]] ?? Number(people[1])) : undefined,
    useSoon: /utilis|reste|frigo|p[ée]rim|finir|partir vite|gaspill/.test(t),
    ingredients: found,
  };
}

export interface RequestAnswer {
  parsed: ParsedRequest;
  /** ce que l'appli a compris, en clair */
  understood: string[];
  recipes: IndexedRecipe[];
  foods: FoodSource[];
}

export function answerRequest(
  text: string,
  ctx: { recipes: IndexedRecipe[]; ingredients: Ingredient[]; lookup: IngredientLookup; profiles: NutritionProfile[]; me: NutritionProfile; useSoon: Set<string>; favorites: Set<string>; common?: Set<string> },
): RequestAnswer {
  const p = parseRequest(text, ctx.ingredients);
  const understood: string[] = [];
  if (p.nutrient) understood.push(`riche en ${p.nutrient.label.replace(/ \(.*\)/, '').toLowerCase()}`);
  if (p.protein) understood.push('riche en protéines');
  if (p.meal) understood.push({ diner: 'pour le dîner', dejeuner: 'pour le déjeuner', 'petit-dejeuner': 'pour le petit-déjeuner', collation: 'pour une collation', dessert: 'en dessert' }[p.meal]);
  if (p.maxTime) understood.push(`prêt en ${p.maxTime} min maximum`);
  if (p.servings) understood.push(`pour ${p.servings}`);
  if (p.ingredients.length) understood.push(`avec ${p.ingredients.map((i) => i.name).join(', ')}`);
  if (p.useSoon) understood.push(ctx.useSoon.size ? `qui utilise ce qui doit partir vite (${ctx.useSoon.size} produit${ctx.useSoon.size > 1 ? 's' : ''})` : 'qui utilise le frigo (rien n’est marqué « à utiliser vite »)');
  understood.push(`compatible avec ${ctx.profiles.length > 1 ? 'toute la tablée' : 'vos allergies et vos goûts'}`);

  const ref = p.nutrient ? dailyRef(p.nutrient, ctx.me) : 0;
  const pool = ctx.recipes.filter((r) => {
    if (recipeConflict(r, ctx.profiles, ctx.lookup)) return false;
    if (p.meal && !r.mealTypes.includes(p.meal) && !(p.meal === 'diner' && r.mealTypes.includes('dejeuner')) && !(p.meal === 'dejeuner' && r.mealTypes.includes('diner'))) return false;
    if (p.maxTime && r.totalTime > p.maxTime) return false;
    if (p.ingredients.length && !p.ingredients.every((i) => r.ingredients.some((x) => x.id === i.id || ctx.lookup(x.id)?.protein_group === i.protein_group && !!i.protein_group))) return false;
    if (p.useSoon && ctx.useSoon.size && !r.ingredients.some((x) => ctx.useSoon.has(x.id))) return false;
    return true;
  });
  const score = (r: IndexedRecipe) =>
    (p.nutrient ? Math.min(3, (r.micros?.[p.nutrient.key] ?? 0) / ref) * 60 : 0) +
    (p.protein ? Math.min(60, r.nutrition.protein) : 0) +
    (p.useSoon ? r.ingredients.filter((x) => ctx.useSoon.has(x.id)).length * 15 : 0) +
    (r.density ?? 0) * 0.3 +
    (ctx.favorites.has(r.id) ? 8 : 0);
  const recipes = pool.sort((a, b) => score(b) - score(a)).slice(0, 6);
  const foods = p.nutrient ? foodSourcesFor(p.nutrient, ctx.me, ctx.ingredients, 3, ctx.common) : [];
  return { parsed: p, understood, recipes, foods };
}

export const REQUEST_EXAMPLES = ['Combler mon manque de fer', 'Plus d’oméga-3 cette semaine', 'Une recette pour deux ce soir en 30 min', 'Utiliser ce qui doit partir vite', 'Un petit-déjeuner riche en protéines'];
