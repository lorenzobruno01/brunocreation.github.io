// ─────────────────────────────────────────────────────────────
// Recherche plein texte « intelligente » + filtres combinables
// « dîner rapide » → repas=dîner + temps ≤ 30 min
// « italien »      → cuisine italienne
// « œufs fromage » → recettes contenant les deux
// ─────────────────────────────────────────────────────────────
import type { Cuisine, Difficulty, IndexedRecipe, MealType, ProteinGroup, RecipeCategory, Season } from './types';
import { norm, stem } from './text';
import { CUISINES } from './labels';

export interface Filters {
  meals: MealType[];
  categories: RecipeCategory[];
  maxTime?: number; // minutes ; Infinity → « long »
  longOnly?: boolean;
  difficulties: Difficulty[];
  proteins: ProteinGroup[];
  cuisines: Cuisine[];
  regions: string[];
  tags: string[];
  seasons: Season[];
  kcalMin?: number;
  kcalMax?: number;
  proteinMin?: number;
  favoritesOnly?: boolean;
  /** nombre max d'ingrédients manquants (avec le frigo/garde-manger) */
  maxMissing?: number;
}

export const EMPTY_FILTERS: Filters = {
  meals: [],
  categories: [],
  difficulties: [],
  proteins: [],
  cuisines: [],
  regions: [],
  tags: [],
  seasons: [],
};

interface Keyword {
  words: string[];
  apply: (f: Filters) => void;
}

const meal = (m: MealType) => (f: Filters) => void (f.meals = [...new Set([...f.meals, m])]);
const cuisine = (c: Cuisine) => (f: Filters) => void (f.cuisines = [...new Set([...f.cuisines, c])]);
const region = (r: string) => (f: Filters) => void (f.regions = [...new Set([...f.regions, r])]);
const time = (t: number) => (f: Filters) => void (f.maxTime = Math.min(f.maxTime ?? Infinity, t));
const tag = (t: string) => (f: Filters) => void (f.tags = [...new Set([...f.tags, t])]);
const season = (s: Season) => (f: Filters) => void (f.seasons = [...new Set([...f.seasons, s])]);
const diff = (d: Difficulty[]) => (f: Filters) => void (f.difficulties = d);

/** Mots-clés interprétés comme filtres (sur la forme normalisée) */
const KEYWORDS: Keyword[] = [
  { words: ['petit dejeuner', 'petit dej', 'petit dejeune', 'brunch', 'matin'], apply: meal('petit-dejeuner') },
  { words: ['dejeuner', 'midi', 'lunch'], apply: meal('dejeuner') },
  { words: ['diner', 'soir', 'souper'], apply: meal('diner') },
  { words: ['collation', 'gouter', 'en cas', 'snack', 'encas'], apply: meal('collation') },
  { words: ['dessert', 'desserts'], apply: meal('dessert') },
  { words: ['express', 'tres rapide', 'ultra rapide'], apply: time(15) },
  { words: ['rapide', 'rapides', 'vite', 'pressé', 'presse'], apply: time(30) },
  { words: ['week end', 'weekend', 'dimanche'], apply: tag('week-end') },
  { words: ['batch', 'batch cooking'], apply: tag('batch cooking') },
  { words: ['calorique', 'prise de masse', 'masse', 'nourrissant'], apply: tag('calorique') },
  { words: ['sportif', 'entrainement', 'muscu', 'recuperation'], apply: tag('sportif') },
  { words: ['economique', 'pas cher'], apply: tag('économique') },
  { words: ['froid', 'repas froid'], apply: tag('repas froid') },
  { words: ['lunch box', 'gamelle'], apply: tag('lunch box') },
  { words: ['barbecue', 'bbq', 'plancha'], apply: tag('barbecue') },
  { words: ['facile', 'simple'], apply: diff(['tres-facile', 'facile']) },
  { words: ['tres facile'], apply: diff(['tres-facile']) },
  { words: ['printemps'], apply: season('printemps') },
  { words: ['ete', 'estival'], apply: season('ete') },
  { words: ['automne'], apply: season('automne') },
  { words: ['hiver', 'hivernal'], apply: season('hiver') },
  { words: ['francais', 'francaise', 'bistrot'], apply: cuisine('francaise') },
  { words: ['italien', 'italienne'], apply: cuisine('italienne') },
  { words: ['grec', 'grecque'], apply: cuisine('grecque') },
  { words: ['espagnol', 'espagnole'], apply: cuisine('espagnole') },
  { words: ['portugais', 'portugaise'], apply: cuisine('portugaise') },
  { words: ['libanais', 'libanaise', 'levantin', 'levantine', 'moyen orient', 'oriental', 'orientale'], apply: region('orient') },
  { words: ['turc', 'turque'], apply: cuisine('turque') },
  { words: ['marocain', 'marocaine', 'maghreb', 'tunisien', 'algerien', 'nord africain'], apply: cuisine('nord-africaine') },
  { words: ['japonais', 'japonaise'], apply: cuisine('japonaise') },
  { words: ['coreen', 'coreenne'], apply: cuisine('coreenne') },
  { words: ['chinois', 'chinoise'], apply: cuisine('chinoise') },
  { words: ['thai', 'thailandais', 'vietnamien', 'vietnamienne'], apply: cuisine('thai-vietnamienne') },
  { words: ['indien', 'indienne', 'curry'], apply: cuisine('indienne') },
  { words: ['mexicain', 'mexicaine'], apply: cuisine('mexicaine') },
  { words: ['nordique', 'scandinave', 'suedois', 'danois'], apply: cuisine('nordique') },
  { words: ['asiatique', 'asie'], apply: region('asie') },
  { words: ['mediterraneen', 'mediterraneenne', 'mediterranee'], apply: region('mediterranee') },
  { words: ['rustique', 'terroir', 'paysan', 'grand mere'], apply: cuisine('rustique') },
];

// Trier pour que les expressions longues gagnent (« petit dejeuner » avant « dejeuner »)
const SORTED_KW = KEYWORDS.flatMap((k) => k.words.map((w) => ({ w: norm(w), apply: k.apply }))).sort((a, b) => b.w.length - a.w.length);

export interface ParsedQuery {
  text: string[]; // termes libres (racinisés)
  filters: Filters;
  recognized: string[]; // mots-clés compris
}

export function parseQuery(q: string, base: Filters = EMPTY_FILTERS): ParsedQuery {
  let s = ` ${norm(q)} `;
  const filters: Filters = structuredClone(base);
  const recognized: string[] = [];
  for (const { w, apply } of SORTED_KW) {
    const re = new RegExp(` ${w} `);
    if (re.test(s)) {
      apply(filters);
      recognized.push(w);
      s = s.replace(re, ' ');
    }
  }
  const text = s
    .split(' ')
    .filter((t) => t.length > 1 && !['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'un', 'une', 'avec', 'pour', 'sans', 'recette', 'recettes', 'plat', 'plats'].includes(t))
    .map(stem);
  return { text, filters, recognized };
}

/** Vérifie si une recette respecte les filtres */
export function matchesFilters(r: IndexedRecipe, f: Filters, favorites?: Set<string>): boolean {
  if (f.meals.length && !f.meals.some((m) => r.mealTypes.includes(m))) return false;
  if (f.categories.length && !f.categories.includes(r.category)) return false;
  if (f.longOnly && r.totalTime <= 60) return false;
  if (f.maxTime != null && Number.isFinite(f.maxTime) && r.totalTime > f.maxTime) return false;
  if (f.difficulties.length && !f.difficulties.includes(r.difficulty)) return false;
  if (f.proteins.length && !f.proteins.some((p) => r.proteins.includes(p) || r.mainProtein === p)) return false;
  if (f.cuisines.length || f.regions.length) {
    const okC = f.cuisines.includes(r.cuisine);
    const okR = f.regions.includes(CUISINES[r.cuisine]?.region);
    if (!okC && !okR) return false;
  }
  if (f.tags.length && !f.tags.every((t) => r.tags.includes(t) || (t === 'calorique' && (r.tags.includes('prise de masse') || r.nutrition.kcal >= 750)))) return false;
  if (f.seasons.length && r.seasons.length && !f.seasons.some((s) => r.seasons.includes(s))) return false;
  if (f.kcalMin != null && r.nutrition.kcal < f.kcalMin) return false;
  if (f.kcalMax != null && r.nutrition.kcal > f.kcalMax) return false;
  if (f.proteinMin != null && r.nutrition.protein < f.proteinMin) return false;
  if (f.favoritesOnly && !favorites?.has(r.id)) return false;
  return true;
}

/** Score texte : chaque terme doit apparaître (préfixe) ; bonus si dans le nom */
export function textScore(r: IndexedRecipe, terms: string[]): number {
  if (!terms.length) return 1;
  const name = norm(r.name);
  let score = 0;
  for (const t of terms) {
    const inName = new RegExp(`\\b${t}`).test(name);
    const inText = inName || new RegExp(`\\b${t}`).test(r.searchText);
    if (!inText) return 0;
    score += inName ? 3 : 1;
  }
  return score;
}

export type SortKey = 'pertinence' | 'temps' | 'calories' | 'proteines' | 'recent' | 'nom';

export function searchRecipes(
  recipes: IndexedRecipe[],
  query: string,
  filters: Filters,
  favorites: Set<string>,
  sort: SortKey = 'pertinence',
): { results: IndexedRecipe[]; parsed: ParsedQuery } {
  const parsed = parseQuery(query, filters);
  const scored: Array<{ r: IndexedRecipe; s: number }> = [];
  for (const r of recipes) {
    if (!matchesFilters(r, parsed.filters, favorites)) continue;
    const s = textScore(r, parsed.text);
    if (s > 0) scored.push({ r, s });
  }
  const cmp: Record<SortKey, (a: { r: IndexedRecipe; s: number }, b: { r: IndexedRecipe; s: number }) => number> = {
    pertinence: (a, b) => b.s - a.s || (favorites.has(b.r.id) ? 1 : 0) - (favorites.has(a.r.id) ? 1 : 0) || a.r.name.localeCompare(b.r.name, 'fr'),
    temps: (a, b) => a.r.totalTime - b.r.totalTime,
    calories: (a, b) => b.r.nutrition.kcal - a.r.nutrition.kcal,
    proteines: (a, b) => b.r.nutrition.protein - a.r.nutrition.protein,
    recent: (a, b) => (b.r.createdAt ?? '').localeCompare(a.r.createdAt ?? ''),
    nom: (a, b) => a.r.name.localeCompare(b.r.name, 'fr'),
  };
  scored.sort(cmp[sort]);
  return { results: scored.map((x) => x.r), parsed };
}

export function countActiveFilters(f: Filters): number {
  return (
    f.meals.length +
    f.categories.length +
    (f.maxTime != null ? 1 : 0) +
    (f.longOnly ? 1 : 0) +
    f.difficulties.length +
    f.proteins.length +
    f.cuisines.length +
    f.regions.length +
    f.tags.length +
    f.seasons.length +
    (f.kcalMin != null || f.kcalMax != null ? 1 : 0) +
    (f.proteinMin != null ? 1 : 0) +
    (f.favoritesOnly ? 1 : 0) +
    (f.maxMissing != null ? 1 : 0)
  );
}
