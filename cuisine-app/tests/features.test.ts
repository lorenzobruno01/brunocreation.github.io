import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID, INGREDIENTS } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { matchBoolean, parseIngredientQuery } from '../src/domain/ingredientQuery';
import { computeDetailed, MICROS, NUTRIENTS } from '../src/domain/micronutrients';
import { generateWeek } from '../src/domain/planner';
import type { Recipe } from '../src/domain/types';

const lookup = (id: string) => INGREDIENT_BY_ID[id];
const dir = join(__dirname, '../src/data/recipes');
const library = readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Recipe[]).map((r) => indexRecipe(r, lookup));

describe('recherche ET / OU / SANS', () => {
  it('« patates et saumon ou bœuf »', () => {
    const { query, unknown } = parseIngredientQuery('patates et saumon ou bœuf', INGREDIENTS);
    expect(unknown).toEqual([]);
    expect(query.groups).toHaveLength(2);
    expect(query.groups[1]).toHaveLength(2);
    const res = matchBoolean(library, query);
    expect(res.length).toBeGreaterThan(3);
    for (const m of res) {
      const ids = m.recipe.ingredients.map((i) => i.id);
      expect(ids.some((i) => i.startsWith('pomme-de-terre'))).toBe(true);
      expect(ids.some((i) => i.startsWith('saumon') || (INGREDIENT_BY_ID[i]?.protein_group === 'boeuf'))).toBe(true);
    }
  });
  it('« œufs sans lardons » exclut les lardons', () => {
    const { query } = parseIngredientQuery('œufs sans lardons', INGREDIENTS);
    const res = matchBoolean(library, query);
    expect(res.length).toBeGreaterThan(10);
    expect(res.every((m) => !m.recipe.ingredients.some((i) => i.id === 'lardons'))).toBe(true);
  });
});

describe('nutrition détaillée', () => {
  it('couvre tous les ingrédients', () => {
    const missing = INGREDIENTS.filter((i) => !(i.id in MICROS)).map((i) => i.id);
    expect(missing).toEqual([]);
  });
  it('le foie apporte beaucoup de vitamine A et de B12', () => {
    const r = library.find((x) => x.ingredients.some((i) => i.id === 'foie-veau'))!;
    const d = computeDetailed(r, lookup);
    expect(d.vA).toBeGreaterThan(1000);
    expect(d.vB12).toBeGreaterThan(10);
    expect(d.leu).toBeGreaterThan(1000);
  });
  it('fournit tous les nutriments affichés', () => {
    const d = computeDetailed(library[0], lookup);
    for (const n of NUTRIENTS) expect(typeof (d[n.key] ?? 0)).toBe('number');
  });
});

describe('critères du menu', () => {
  it('respecte la durée max et les protéines exclues', () => {
    const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    const plan = generateWeek(
      { recipes: library, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots: ['midi', 'soir'], servings: 2, seed: 7, constraints: { maxTimeWeek: 30, maxTimeWeekend: 90, excludeProteins: ['porc'], minFish: 3 } },
      (id) => lookup(id)?.category,
    );
    const byId = new Map(library.map((r) => [r.id, r]));
    expect(plan).toHaveLength(14);
    let fish = 0;
    for (const p of plan) {
      const r = byId.get(p.recipeId)!;
      const weekend = ['2026-10-10', '2026-10-11'].includes(p.date);
      expect(r.totalTime).toBeLessThanOrEqual(weekend ? 90 : 30);
      expect(r.mainProtein).not.toBe('porc');
      if (['poisson-gras', 'poisson-blanc', 'fruits-de-mer'].includes(r.mainProtein ?? '')) fish++;
    }
    expect(fish).toBeGreaterThanOrEqual(3);
  });
});
