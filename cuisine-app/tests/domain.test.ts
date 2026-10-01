import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID, INGREDIENTS } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { matchRecipes, filterByMode } from '../src/domain/matching';
import { buildShopping, consolidate } from '../src/domain/shopping';
import { parseQuery, searchRecipes, EMPTY_FILTERS } from '../src/domain/search';
import { toStandard, formatStandard, ingredientLine } from '../src/domain/units';
import { generateWeek } from '../src/domain/planner';
import { searchIngredients } from '../src/hooks/library';
import type { Recipe } from '../src/domain/types';

const lookup = (id: string) => INGREDIENT_BY_ID[id];
const dir = join(__dirname, '../src/data/recipes');
const seed: Recipe[] = readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const library = seed.map((r) => indexRecipe(r, lookup));

describe('bibliothèque', () => {
  it('contient au moins 300 recettes uniques', () => {
    expect(library.length).toBeGreaterThanOrEqual(300);
    expect(new Set(library.map((r) => r.id)).size).toBe(library.length);
  });
  it('respecte la répartition initiale', () => {
    const n = (m: string) => library.filter((r) => r.mealTypes.includes(m as never)).length;
    expect(n('petit-dejeuner')).toBeGreaterThanOrEqual(50);
    expect(n('dejeuner')).toBeGreaterThanOrEqual(80);
    expect(n('diner')).toBeGreaterThanOrEqual(100);
    expect(n('collation')).toBeGreaterThanOrEqual(30);
    expect(n('dessert')).toBeGreaterThanOrEqual(30);
    expect(library.filter((r) => ['soupe', 'mijote', 'accompagnement'].includes(r.category)).length).toBeGreaterThanOrEqual(40);
  });
  it('ne repose pas sur le poulet', () => {
    expect(library.filter((r) => r.mainProtein === 'poulet').length / library.length).toBeLessThan(0.15);
  });
});

describe('normalisation', () => {
  it('« PDT », « pommes de terre » et « pomme de terre » désignent le même ingrédient', () => {
    for (const q of ['PDT', 'pommes de terre', 'pomme de terre', 'patate']) expect(searchIngredients(q, INGREDIENTS)[0].id).toBe('pomme-de-terre');
  });
  it('« cour » propose courgette et courge', () => {
    const ids = searchIngredients('cour', INGREDIENTS).map((i) => i.id);
    expect(ids).toContain('courgette');
    expect(ids).toContain('courge-butternut');
  });
  it('convertit les unités', () => {
    expect(toStandard(2, 'piece', lookup('courgette'))).toEqual({ qty: 400, unit: 'g' });
    expect(toStandard(1, 'kg', lookup('pomme-de-terre'))).toEqual({ qty: 1000, unit: 'g' });
    expect(toStandard(2, 'cas', lookup('huile-olive'))).toEqual({ qty: 30, unit: 'ml' });
    expect(toStandard(20, 'cl', lookup('lait'))).toEqual({ qty: 200, unit: 'ml' });
    expect(formatStandard(1500, 'g')).toBe('1,5 kg');
    expect(ingredientLine(300, 'g', lookup('boeuf-hache'))).toBe('300 g de bœuf haché');
    expect(ingredientLine(2, 'piece', lookup('courgette'))).toBe('2 courgettes');
  });
});

describe('scénario A — ingrédients → recettes', () => {
  const selected = new Set(['oeuf', 'pomme-de-terre', 'courgette', 'comte']);
  const res = matchRecipes(library, selected, new Set(['sel', 'poivre', 'huile-olive', 'beurre']), lookup);
  it('propose des recettes utilisant les ingrédients choisis, les plus complètes en premier', () => {
    expect(res.length).toBeGreaterThan(10);
    expect(res[0].usedSelected).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < Math.min(res.length, 20); i++) expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
  });
  it('les modes filtrent par nombre de manques', () => {
    for (const r of filterByMode(res, 'maintenant')) expect(r.missing.length + r.missingMinor.length).toBe(0);
    for (const r of filterByMode(res, 'presque')) expect(r.missing.length + r.missingMinor.length).toBeLessThanOrEqual(2);
  });
});

describe('scénario B — « dîner rapide »', () => {
  it('interprète la requête en filtres', () => {
    const p = parseQuery('dîner rapide');
    expect(p.filters.meals).toEqual(['diner']);
    expect(p.filters.maxTime).toBe(30);
    expect(p.text).toEqual([]);
  });
  it('ne renvoie que des dîners de 30 min max', () => {
    const { results } = searchRecipes(library, 'dîner rapide', EMPTY_FILTERS, new Set());
    expect(results.length).toBeGreaterThan(20);
    for (const r of results) {
      expect(r.mealTypes).toContain('diner');
      expect(r.totalTime).toBeLessThanOrEqual(30);
    }
  });
  it('« italien », « saumon », « œufs fromage »', () => {
    expect(searchRecipes(library, 'italien', EMPTY_FILTERS, new Set()).results.every((r) => r.cuisine === 'italienne')).toBe(true);
    expect(searchRecipes(library, 'saumon', EMPTY_FILTERS, new Set()).results.length).toBeGreaterThan(5);
    const of = searchRecipes(library, 'œufs fromage', EMPTY_FILTERS, new Set()).results;
    expect(of.length).toBeGreaterThan(5);
  });
});

describe('scénario C — recettes → courses', () => {
  it('fusionne et additionne les quantités (500 g + 700 g + 300 g = 1,5 kg)', () => {
    const mk = (id: string, qty: number): Recipe => ({
      id, name: id, description: '', category: 'plat', mealTypes: ['diner'], cuisine: 'francaise', prepTime: 5, cookTime: 5, difficulty: 'facile',
      servings: 2, ingredients: [{ id: 'pomme-de-terre', qty, unit: 'g' }, { id: 'sel', qty: 1, unit: 'au-gout' }], steps: ['a', 'b', 'c'], tags: [], seasons: [], technique: 'four', flavors: [],
    });
    const sel = [mk('a', 500), mk('b', 700), mk('c', 300)].map((r) => ({ recipe: indexRecipe(r, lookup), servings: 2 }));
    const lines = consolidate(sel, lookup);
    const pdt = lines.find((l) => l.ingredientId === 'pomme-de-terre')!;
    expect(formatStandard(pdt.qty, pdt.unit)).toBe('1,5 kg');
    expect(pdt.recipes).toEqual(['a', 'b', 'c']);
  });
  it('7 recettes : portions adaptées, garde-manger retiré, rayons ordonnés', () => {
    const week = library.filter((r) => r.category === 'plat').slice(0, 7);
    const sel = week.map((recipe) => ({ recipe, servings: 2 }));
    const pantry = new Map<string, number | undefined>([['sel', undefined], ['poivre', undefined], ['huile-olive', undefined], ['beurre', undefined]]);
    const res = buildShopping(sel, pantry, lookup, library);
    expect(res.toBuy.some((l) => ['sel', 'poivre', 'huile-olive', 'beurre'].includes(l.ingredientId))).toBe(false);
    expect(res.toBuy.length).toBeGreaterThan(10);
    const ids = res.toBuy.map((l) => l.ingredientId);
    expect(new Set(ids).size).toBe(ids.length);
    // portions doublées → quantités doublées
    const x2 = buildShopping(week.map((recipe) => ({ recipe, servings: 4 })), pantry, lookup, library);
    const a = res.toBuy.find((l) => !l.toTaste)!;
    const b = x2.toBuy.find((l) => l.ingredientId === a.ingredientId)!;
    expect(b.qty).toBeCloseTo((a.qty * 4) / 2 * (2 / 2), 0);
  });
});

describe('planificateur', () => {
  it('génère 14 repas variés sans répéter la même protéine deux fois de suite', () => {
    const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    const plan = generateWeek({ recipes: library, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots: ['midi', 'soir'], servings: 2, seed: 42 }, (id) => lookup(id)?.category);
    expect(plan.length).toBe(14);
    const byId = new Map(library.map((r) => [r.id, r]));
    const proteins = plan.map((p) => byId.get(p.recipeId)!.mainProtein);
    for (let i = 1; i < proteins.length; i++) if (proteins[i]) expect(proteins[i]).not.toBe(proteins[i - 1]);
    const counts = new Map<string, number>();
    proteins.forEach((p) => p && counts.set(p, (counts.get(p) ?? 0) + 1));
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    expect(new Set(plan.map((p) => p.recipeId)).size).toBe(14);
  });
});
