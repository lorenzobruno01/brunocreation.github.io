// ─────────────────────────────────────────────────────────────
// Moteur de correspondance INGRÉDIENTS → RECETTES (§26, §27)
// ─────────────────────────────────────────────────────────────
import type { IndexedRecipe, Ingredient } from './types';
import type { IngredientLookup } from './indexing';

/** Groupes d'ingrédients interchangeables (comptent comme « disponible (substitut) ») */
export const EQUIVALENTS: string[][] = [
  ['pomme-de-terre', 'pomme-de-terre-farineuse'],
  ['oignon', 'oignon-rouge', 'echalote', 'oignon-nouveau'],
  ['tomate', 'tomate-cerise'],
  ['citron', 'citron-vert'],
  ['creme-fraiche', 'creme-liquide'],
  ['yaourt-grec', 'yaourt-nature', 'fromage-blanc', 'skyr'],
  ['comte', 'parmesan', 'pecorino', 'cheddar', 'manchego'],
  ['reblochon', 'camembert'],
  ['fromage-frais-chevre', 'chevre-buche'],
  ['riz-blanc', 'riz-rond'],
  ['pates', 'pates-fraiches'],
  ['pain-seigle', 'pain-levain'],
  ['beurre', 'beurre-clarifie'],
  ['lait', 'kefir'],
  ['poulet-cuisse', 'poulet-haut-cuisse-desosse', 'poulet-blanc', 'poulet-aile', 'poulet-entier'],
  ['dinde-escalope', 'dinde-cuisse', 'dinde-hachee'],
  ['boeuf-paleron', 'boeuf-joue', 'boeuf-jarret'],
  ['bouillon-volaille', 'bouillon-boeuf'],
  ['lardons', 'bacon', 'pancetta'],
  ['cabillaud', 'bar', 'sole', 'lotte'],
  ['laitue', 'mache'],
  ['courge-butternut', 'potimarron'],
  ['champignon', 'champignon-forestier'],
  ['tomates-concassees', 'concentre-tomate'],
  ['framboise', 'myrtille', 'fraise'],
  ['peche', 'nectarine', 'abricot'],
  ['orange', 'clementine'],
  ['foie-volaille', 'foie-veau', 'foie-agneau'],
];

const EQUIV = new Map<string, string[]>();
for (const g of EQUIVALENTS) for (const id of g) EQUIV.set(id, g.filter((x) => x !== id));

export function equivalentsOf(id: string): string[] {
  return EQUIV.get(id) ?? [];
}

export type MatchMode = 'maintenant' | 'presque' | 'tout';

export interface MatchResult {
  recipe: IndexedRecipe;
  total: number; // ingrédients principaux
  have: string[]; // ids disponibles (exacts)
  substitutes: Array<{ need: string; have: string }>;
  missing: string[]; // ids manquants importants
  missingMinor: string[]; // condiments / épicerie manquants
  usedSelected: number; // nb d'ingrédients sélectionnés par l'utilisateur utilisés
  /** nb d'ingrédients cochés présents dans la recette (directement ou par un équivalent) */
  covered: number;
  score: number;
}

function weight(ing: Ingredient | undefined): number {
  if (!ing) return 1;
  if (ing.protein_group && ing.category !== 'laitier') return 2.2;
  if (ing.category === 'feculent') return 1.8;
  if (ing.category === 'legume' || ing.category === 'fruit') return 1.3;
  if (ing.category === 'laitier' || ing.category === 'oeufs') return 1.5;
  if (ing.category === 'condiment' || ing.category === 'epicerie') return 0.4;
  return 1;
}

function isMinor(ing: Ingredient | undefined): boolean {
  return !!ing && (ing.category === 'condiment' || ing.category === 'epicerie');
}

/**
 * @param selected  ingrédients choisis par l'utilisateur (« j'ai ces ingrédients »)
 * @param pantry    garde-manger (comptés comme disponibles, sans bonus de pertinence)
 */
export function matchRecipes(
  recipes: IndexedRecipe[],
  selected: Set<string>,
  pantry: Set<string>,
  lookup: IngredientLookup,
): MatchResult[] {
  const available = new Set([...selected, ...pantry]);
  const out: MatchResult[] = [];
  for (const recipe of recipes) {
    const main = [...new Set(recipe.mainIngredientIds)];
    if (!main.length) continue;
    const have: string[] = [];
    const substitutes: MatchResult['substitutes'] = [];
    const missing: string[] = [];
    const missingMinor: string[] = [];
    let wTotal = 0;
    let wHave = 0;
    let usedSelected = 0;
    for (const id of main) {
      const ing = lookup(id);
      const w = weight(ing);
      wTotal += w;
      if (available.has(id)) {
        have.push(id);
        wHave += w;
        if (selected.has(id)) usedSelected++;
        continue;
      }
      const sub = equivalentsOf(id).find((e) => available.has(e));
      if (sub) {
        substitutes.push({ need: id, have: sub });
        wHave += w * 0.85;
        if (selected.has(sub)) usedSelected++;
        continue;
      }
      (isMinor(ing) ? missingMinor : missing).push(id);
    }
    if (selected.size && usedSelected === 0) continue;
    const inRecipe = new Set(recipe.ingredients.map((i) => i.id));
    let covered = 0;
    for (const id of selected) if (inRecipe.has(id) || equivalentsOf(id).some((e) => inRecipe.has(e))) covered++;
    const ratio = wTotal ? wHave / wTotal : 0;
    // Priorité : peu de manques, beaucoup d'ingrédients sélectionnés utilisés, bon ratio pondéré
    const score =
      ratio * 100 +
      usedSelected * 12 +
      (selected.size ? (covered / selected.size) * 40 : 0) -
      missing.length * 14 -
      missingMinor.length * 4;
    out.push({ recipe, total: main.length, have, substitutes, missing, missingMinor, usedSelected, covered, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function filterByMode(results: MatchResult[], mode: MatchMode): MatchResult[] {
  switch (mode) {
    case 'maintenant':
      return results.filter((r) => r.missing.length === 0 && r.missingMinor.length === 0);
    case 'presque':
      return results.filter((r) => {
        const n = r.missing.length + r.missingMinor.length;
        return n >= 1 && n <= 2;
      });
    default:
      return results;
  }
}

export function availableCount(r: MatchResult): number {
  return r.have.length + r.substitutes.length;
}
