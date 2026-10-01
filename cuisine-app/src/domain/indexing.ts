import type { Ingredient, IndexedRecipe, Nutrition, ProteinGroup, Recipe, RecipeIngredient } from './types';
import { toGrams } from './units';
import { norm } from './text';
import { CUISINES, MEAL_TYPES, CATEGORIES, TECHNIQUES, PROTEINS } from './labels';

export type IngredientLookup = (id: string) => Ingredient | undefined;

/** Grammes réellement consommés d'une ligne d'ingrédient (os, coquilles, graisse de cuisson…) */
export function gramsEaten(ri: RecipeIngredient, ing: Ingredient): number {
  let g = toGrams(ri.qty, ri.unit, ing);
  if (g == null) return 0;
  // Matières grasses de cuisson / friture : on compte ~80 % (une partie reste dans la poêle)
  if (ing.category === 'matiere-grasse' && ri.unit !== 'g') g *= 0.8;
  // Os, carcasses : on ne consomme qu'une fraction (bouillon / moelle)
  if (ing.id === 'os-boeuf' || ing.id === 'carcasse-poulet') g *= 0.15;
  if (ing.id === 'os-a-moelle') g *= 0.25;
  // Os, coquilles, arêtes : seule la partie comestible compte
  if (ing.edible) g *= ing.edible;
  if (ing.edibleWhole && ri.unit === 'piece') g *= ing.edibleWhole;
  return g;
}

/** Nutrition par portion, calculée à partir de la base d'ingrédients */
export function computeNutrition(recipe: Recipe, lookup: IngredientLookup): Nutrition {
  if (recipe.nutritionOverride) return recipe.nutritionOverride;
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const ri of recipe.ingredients) {
    const ing = lookup(ri.id);
    if (!ing) continue;
    const f = gramsEaten(ri, ing) / 100;
    total.kcal += ing.kcal * f;
    total.protein += ing.protein * f;
    total.carbs += ing.carbs * f;
    total.fat += ing.fat * f;
  }
  const s = Math.max(1, recipe.servings);
  return {
    kcal: Math.round(total.kcal / s),
    protein: Math.round(total.protein / s),
    carbs: Math.round(total.carbs / s),
    fat: Math.round(total.fat / s),
  };
}

/** Poids (g) d'un ingrédient dans la recette, pour déterminer la protéine principale */
function weightOf(recipe: Recipe, id: string, lookup: IngredientLookup): number {
  const ri = recipe.ingredients.find((x) => x.id === id);
  const ing = lookup(id);
  if (!ri || !ing) return 0;
  return toGrams(ri.qty, ri.unit, ing) ?? 0;
}

export function indexRecipe(recipe: Recipe, lookup: IngredientLookup): IndexedRecipe {
  const ings = recipe.ingredients.map((ri) => ({ ri, ing: lookup(ri.id) })).filter((x) => x.ing) as Array<{
    ri: Recipe['ingredients'][number];
    ing: Ingredient;
  }>;

  // Protéines : pondérées par la contribution protéique réelle
  const proteinScore = new Map<ProteinGroup, number>();
  for (const { ri, ing } of ings) {
    if (!ing.protein_group || ri.optional) continue;
    const g = weightOf(recipe, ing.id, lookup);
    const p = (g * ing.protein) / 100;
    if (ing.protein_group === 'laitier' || ing.category === 'laitier') continue;
    proteinScore.set(ing.protein_group, (proteinScore.get(ing.protein_group) ?? 0) + p);
  }
  // Les produits laitiers sont une protéine principale seulement s'ils dominent
  let dairyP = 0;
  for (const { ri, ing } of ings) {
    if (ing.category === 'laitier' && !ri.optional) dairyP += (weightOf(recipe, ing.id, lookup) * ing.protein) / 100;
  }
  const sorted = [...proteinScore.entries()].sort((a, b) => b[1] - a[1]);
  const proteins = sorted.filter(([, p]) => p >= 4).map(([g]) => g);
  let mainProtein = sorted[0]?.[0];
  if ((!mainProtein || (sorted[0][1] ?? 0) < dairyP * 0.7) && dairyP >= 8) {
    mainProtein = 'laitier';
    if (!proteins.includes('laitier')) proteins.unshift('laitier');
  }

  const starches = ings.filter(({ ing }) => ing.category === 'feculent').map(({ ing }) => ing.id);
  const vegetables = ings.filter(({ ing }) => ing.category === 'legume' && !ing.staple && !['oignon', 'ail', 'echalote', 'oignon-rouge'].includes(ing.id)).map(({ ing }) => ing.id);
  const fruits = ings.filter(({ ing }) => ing.category === 'fruit' && !['citron', 'citron-vert'].includes(ing.id)).map(({ ing }) => ing.id);
  const mainIngredientIds = ings.filter(({ ing, ri }) => isMainIngredient(ing) && !ri.optional).map(({ ing }) => ing.id);

  const searchText = norm(
    [
      recipe.name,
      recipe.description,
      CUISINES[recipe.cuisine]?.label,
      CATEGORIES[recipe.category]?.label,
      ...recipe.mealTypes.map((m) => MEAL_TYPES[m]?.label),
      TECHNIQUES[recipe.technique]?.label,
      ...recipe.tags,
      ...ings.flatMap(({ ing }) => [ing.name, ing.plural ?? '', ...(ing.aliases ?? []), ...familyWords(ing)]),
      ...proteins.map((p) => PROTEINS[p]?.label ?? ''),
    ].join(' '),
  );

  return {
    ...recipe,
    totalTime: recipe.prepTime + recipe.cookTime,
    nutrition: computeNutrition(recipe, lookup),
    proteins,
    mainProtein,
    starches,
    vegetables,
    fruits,
    mainIngredientIds,
    searchText,
  };
}

/** Ingrédient « principal » (compte dans la correspondance) vs ingrédient de base */
export function isMainIngredient(ing: Ingredient): boolean {
  if (ing.staple) return false;
  if (ing.category === 'epice' || ing.category === 'boisson') return false;
  if (ing.category === 'matiere-grasse') return false;
  if (ing.category === 'herbe') return false;
  if (ing.id === 'eau') return false;
  return true;
}

const CHEESES = new Set(['comte', 'parmesan', 'pecorino', 'feta', 'halloumi', 'mozzarella', 'reblochon', 'camembert', 'roquefort', 'manchego', 'cheddar', 'paneer', 'chevre-buche', 'fromage-frais-chevre', 'ricotta', 'mascarpone', 'cottage', 'fromage-blanc']);

/** Mots de famille pour la recherche (« fromage », « poisson », « viande »…) */
function familyWords(ing: Ingredient): string[] {
  const w: string[] = [];
  if (CHEESES.has(ing.id)) w.push('fromage');
  if (ing.category === 'poisson') w.push('poisson');
  if (ing.category === 'fruits-de-mer') w.push('fruits de mer');
  if (ing.category === 'viande' || ing.category === 'volaille') w.push('viande');
  if (ing.category === 'volaille') w.push('volaille');
  if (ing.category === 'abats') w.push('abats');
  if (ing.category === 'legumineuse') w.push('legumineuses');
  return w;
}
