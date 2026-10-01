// ─────────────────────────────────────────────────────────────
// Recherche booléenne par ingrédients : ET entre groupes,
// OU à l'intérieur d'un groupe, SANS pour exclure.
// « patates et saumon ou bœuf » → [pomme de terre] ET [saumon OU bœuf]
// ─────────────────────────────────────────────────────────────
import type { IndexedRecipe, Ingredient, ProteinGroup } from './types';
import { norm, stem } from './text';
import { equivalentsOf } from './matching';

/** Une option = un terme compris (« bœuf ») et les ingrédients qu'il couvre */
export interface IngOption {
  label: string;
  ids: string[];
}
export type IngGroup = IngOption[]; // OU
export interface IngQuery {
  groups: IngGroup[]; // ET
  exclude: IngOption[]; // SANS
}

const FAMILY: Record<string, ProteinGroup | 'poisson' | 'viande' | 'fromage'> = {
  boeuf: 'boeuf',
  veau: 'veau',
  agneau: 'agneau',
  mouton: 'agneau',
  porc: 'porc',
  cochon: 'porc',
  poulet: 'poulet',
  volaille: 'poulet',
  dinde: 'dinde',
  canard: 'canard',
  poisson: 'poisson',
  'fruit de mer': 'fruits-de-mer',
  'fruits de mer': 'fruits-de-mer',
  oeuf: 'oeufs',
  abat: 'abats',
  viande: 'viande',
  fromage: 'fromage',
};
const CHEESES = new Set(['comte', 'parmesan', 'pecorino', 'feta', 'halloumi', 'mozzarella', 'reblochon', 'camembert', 'roquefort', 'manchego', 'cheddar', 'paneer', 'chevre-buche', 'fromage-frais-chevre', 'ricotta']);
const FLESH = new Set(['viande', 'volaille', 'abats', 'poisson', 'fruits-de-mer', 'oeufs']);

/** Résout un terme libre en ensemble d'ingrédients */
export function resolveTerm(term: string, ingredients: Ingredient[]): IngOption | null {
  const t = norm(term);
  if (!t) return null;
  const ts = t.split(' ').map(stem).join(' ');
  const fam = FAMILY[ts] ?? FAMILY[t];
  if (fam) {
    const ids = ingredients
      .filter((i) => {
        if (fam === 'fromage') return CHEESES.has(i.id);
        if (fam === 'viande') return ['viande', 'volaille'].includes(i.category);
        if (fam === 'poisson') return i.category === 'poisson';
        return i.protein_group === fam && FLESH.has(i.category);
      })
      .map((i) => i.id);
    if (ids.length) return { label: term.trim(), ids };
  }
  const names = (i: Ingredient) => [i.name, i.plural ?? '', ...(i.aliases ?? [])].map((x) => norm(x)).filter(Boolean);
  const stemmed = (x: string) => x.split(' ').map(stem).join(' ');
  // 1. correspondance exacte (nom, pluriel, alias)
  const exact = ingredients.filter((i) => names(i).some((n) => n === t || stemmed(n) === ts));
  if (exact.length) {
    // … plus les variantes nommées « <terme> … » (saumon → saumon fumé, riz → riz rond)
    const variants = ingredients.filter((i) => [i.name, i.plural ?? ''].map(norm).some((n) => n.startsWith(t + ' ')) && i.category !== 'condiment' && !(i.id === 'patate-douce' && !t.includes('douce')));
    return { label: term.trim(), ids: [...new Set([...exact, ...variants].map((i) => i.id))] };
  }
  // 2. le nom commence par le terme (« saumon » → pavé de saumon, saumon fumé)
  const words = ingredients.filter((i) => names(i).slice(0, 2).some((n) => stemmed(n).split(' ').includes(ts) || stemmed(n).startsWith(ts + ' ')));
  if (words.length) return { label: term.trim(), ids: words.map((i) => i.id) };
  const prefix = ingredients.filter((i) => names(i).some((n) => n.startsWith(t)));
  if (prefix.length) return { label: term.trim(), ids: prefix.map((i) => i.id) };
  return null;
}

/** Analyse « patates et saumon ou bœuf sans fromage » */
export function parseIngredientQuery(text: string, ingredients: Ingredient[]): { query: IngQuery; unknown: string[] } {
  const unknown: string[] = [];
  let s = ` ${norm(text.replace(/\+/g, ' et ').replace(/[,;]/g, ' et ').replace(/\//g, ' ou '))} `;
  let excludePart = '';
  const sansIdx = s.search(/ (sans|pas de|sauf) /);
  if (sansIdx >= 0) {
    excludePart = s.slice(sansIdx).replace(/ (sans|pas de|sauf) /, ' ');
    s = s.slice(0, sansIdx);
  }
  const toOptions = (part: string) =>
    part
      .split(/ ou /)
      .map((x) => x.replace(/^ *(de |d |du |des |la |le |les |l |avec )+/, '').trim())
      .filter(Boolean)
      .map((x) => {
        const o = resolveTerm(x, ingredients);
        if (!o) unknown.push(x);
        return o;
      })
      .filter(Boolean) as IngOption[];
  const groups = s
    .split(/ et | avec /)
    .map(toOptions)
    .filter((g) => g.length);
  const exclude = excludePart ? excludePart.split(/ et | ou /).flatMap(toOptions) : [];
  return { query: { groups, exclude }, unknown };
}

export interface BoolMatch {
  recipe: IndexedRecipe;
  matched: string[]; // libellés des options satisfaites
  score: number;
}

/** Filtre les recettes : chaque groupe doit avoir au moins une option présente ; aucune exclusion */
export function matchBoolean(recipes: IndexedRecipe[], q: IngQuery, withEquivalents = true): BoolMatch[] {
  if (!q.groups.length && !q.exclude.length) return [];
  const expand = (ids: string[]) => (withEquivalents ? [...new Set(ids.flatMap((id) => [id, ...equivalentsOf(id)]))] : ids);
  const groups = q.groups.map((g) => g.map((o) => ({ label: o.label, ids: new Set(expand(o.ids)) })));
  const excl = new Set(q.exclude.flatMap((o) => o.ids));
  const out: BoolMatch[] = [];
  for (const r of recipes) {
    const have = new Set(r.ingredients.filter((i) => !i.optional).map((i) => i.id));
    if ([...excl].some((id) => have.has(id))) continue;
    const matched: string[] = [];
    let ok = true;
    let score = 0;
    for (const g of groups) {
      const hit = g.filter((o) => [...o.ids].some((id) => have.has(id)));
      if (!hit.length) {
        ok = false;
        break;
      }
      matched.push(...hit.map((h) => h.label));
      score += 10 + hit.length;
    }
    if (!ok) continue;
    // privilégier les recettes où les ingrédients demandés sont « principaux »
    score += r.mainIngredientIds.length ? 5 / r.mainIngredientIds.length : 0;
    out.push({ recipe: r, matched, score });
  }
  return out.sort((a, b) => b.score - a.score || a.recipe.totalTime - b.recipe.totalTime);
}

export function describeQuery(q: IngQuery): string {
  const g = q.groups.map((grp) => (grp.length > 1 ? `(${grp.map((o) => o.label).join(' OU ')})` : grp[0]?.label)).join(' ET ');
  return q.exclude.length ? `${g} SANS ${q.exclude.map((o) => o.label).join(', ')}` : g;
}
