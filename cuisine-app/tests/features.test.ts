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

import { composeRecipe } from '../src/domain/composer';
import { checkPhilosophy } from '../src/domain/philosophy';
import { generateNutriWeek, dayReport, householdEaters } from '../src/domain/nutriPlanner';
import { computeDetailed as cd, densityScore, DEFAULT_PROFILES } from '../src/domain/micronutrients';

describe('créateur de recettes intégré', () => {
  it('compose un repas complet respectant « patates et saumon ou bœuf »', () => {
    const { query } = parseIngredientQuery('patates et saumon ou bœuf', INGREDIENTS);
    const r = composeRecipe(query, lookup)!;
    expect(r).toBeTruthy();
    const ix = indexRecipe(r, lookup);
    expect(matchBoolean([ix], query).length).toBe(1);
    expect(r.steps.length).toBeGreaterThanOrEqual(4);
    expect(ix.nutrition.protein).toBeGreaterThan(30);
    expect(checkPhilosophy(r, lookup).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('fonctionne pour des combinaisons variées', () => {
    for (const q of ['agneau et riz', 'oeufs et courgette', 'moules', 'foie de veau', 'paleron', 'poulet entier et patate douce', 'cabillaud et brocoli et sarrasin']) {
      const { query } = parseIngredientQuery(q, INGREDIENTS);
      const r = composeRecipe(query, lookup);
      expect(r, q).toBeTruthy();
      expect(matchBoolean([indexRecipe(r!, lookup)], query).length, q).toBe(1);
    }
  });
});

describe('planificateur densité nutritionnelle', () => {
  it('approche 100 % des besoins chaque jour', () => {
    const lib = library.map((r) => {
      r.micros = cd(r, lookup);
      r.density = densityScore(r.micros, r.nutrition.kcal);
      return r;
    });
    const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    const profile = DEFAULT_PROFILES[0];
    const plan = generateNutriWeek({ recipes: lib, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots: ['matin', 'midi', 'collation', 'soir'], servings: 2, seed: 1, profile }, (id) => lookup(id)?.category);
    expect(plan).toHaveLength(28);
    expect(new Set(plan.map((p) => p.recipeId)).size).toBe(28);
    const byId = new Map(lib.map((r) => [r.id, r]));
    for (const d of dates) {
      const rep = dayReport(d, plan.filter((p) => p.date === d).map((p) => byId.get(p.recipeId)!), profile);
      expect(rep.coverage).toBeGreaterThan(95);
    }
  }, 30000);

  it('optimise pour deux personnes qui partagent les mêmes plats', () => {
    const lib = library.map((r) => {
      r.micros = cd(r, lookup);
      return r;
    });
    const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    const eaters = householdEaters(DEFAULT_PROFILES);
    expect(eaters.reduce((s, e) => s + e.portions, 0)).toBeCloseTo(2);
    expect(eaters[0].portions).toBeGreaterThan(eaters[1].portions);
    const plan = generateNutriWeek({ recipes: lib, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots: ['matin', 'midi', 'collation', 'soir'], servings: 2, seed: 1, eaters }, (id) => lookup(id)?.category);
    expect(plan).toHaveLength(28);
    const byId = new Map(lib.map((r) => [r.id, r]));
    for (const d of dates) {
      const day = plan.filter((p) => p.date === d).map((p) => byId.get(p.recipeId)!);
      for (const e of eaters) {
        const rep = dayReport(d, day, e.profile, () => e.portions);
        expect(rep.coverage).toBeGreaterThan(90);
        expect(rep.pct.kcal).toBeGreaterThan(85);
        expect(rep.pct.kcal).toBeLessThan(115);
      }
    }
  }, 60000);
});

import { analyzeDigestion as ad } from '../src/domain/digestion';
describe('digestion', () => {
  it('le créateur ajoute le trempage pour le sarrasin et les lentilles', () => {
    for (const q of ['sarrasin et poulet', 'lentilles et saucisse', 'riz complet et saumon']) {
      const { query } = parseIngredientQuery(q, INGREDIENTS);
      const r = composeRecipe(query, lookup)!;
      expect(ad(r, lookup).issues.filter((i) => i.level === 'error' && i.topic === 'phytates'), q).toEqual([]);
      expect(r.restTime, q).toBeGreaterThan(0);
    }
  });
  it('signale l’avoine non trempée', () => {
    const r = { id: 'x', name: 'x', description: '', category: 'petit-dejeuner', mealTypes: ['petit-dejeuner'], cuisine: 'francaise', prepTime: 5, cookTime: 5, difficulty: 'facile', servings: 1, ingredients: [{ id: 'flocons-avoine', qty: 60, unit: 'g' }, { id: 'lait', qty: 200, unit: 'ml' }], steps: ['Cuire les flocons dans le lait 5 min.', 'b', 'c'], tags: [], seasons: [], technique: 'bouilli', flavors: [] } as Recipe;
    expect(ad(r, lookup).issues.some((i) => i.topic === 'phytates' && i.level === 'error')).toBe(true);
    r.steps[0] = 'La veille, faire tremper les flocons 12 h dans de l’eau tiède avec 1 c. à soupe de kéfir et 1 c. à soupe de farine de seigle.';
    expect(ad(r, lookup).issues.some((i) => i.topic === 'phytates' && i.level === 'error')).toBe(false);
  });
});
