import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID, INGREDIENTS } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { computeDetailed } from '../src/domain/micronutrients';
import { answerRequest, parseRequest } from '../src/domain/requests';
import { newProfile } from '../src/domain/profile';
import type { Recipe } from '../src/domain/types';

const lookup = (id: string) => INGREDIENT_BY_ID[id];
const dir = join(__dirname, '../src/data/recipes');
const recipes = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Recipe[])
  .map((r) => ({ ...indexRecipe(r, lookup), micros: computeDetailed(r, lookup) }));
const me = newProfile({ name: 'Inès', sex: 'femme', age: 29, weight: 56, height: 164, allergies: ['crustaces'] });
const ctx = { recipes, ingredients: INGREDIENTS, lookup, profiles: [me], me, useSoon: new Set(['courgette']), favorites: new Set<string>() };

describe('demandes en langage courant (sans IA)', () => {
  it('comprend nutriment, repas, temps, personnes, ingrédients', () => {
    const p = parseRequest('Une recette pour deux ce soir en 30 min avec du poulet', INGREDIENTS);
    expect(p).toMatchObject({ meal: 'diner', maxTime: 30, servings: 2 });
    expect(p.ingredients.map((i) => i.protein_group)).toContain('poulet');
    expect(parseRequest('combler mon manque de fer', INGREDIENTS).nutrient?.key).toBe('fe');
    expect(parseRequest('plus d’oméga-3', INGREDIENTS).nutrient?.key).toBe('epa');
  });
  it('fer : plats riches en fer, aliments simples, pas d’allergène', () => {
    const a = answerRequest('combler mon manque de fer', ctx);
    expect(a.recipes.length).toBeGreaterThan(3);
    const avg = recipes.reduce((s, r) => s + (r.micros?.fe ?? 0), 0) / recipes.length;
    expect(a.recipes[0].micros!.fe).toBeGreaterThan(avg * 2);
    expect(a.foods.length).toBeGreaterThan(0);
    for (const r of a.recipes) expect(r.ingredients.some((i) => /crevette|crabe|langoustine/.test(i.id))).toBe(false);
  });
  it('ce soir en 30 min', () => {
    const a = answerRequest('une recette pour deux ce soir en 30 min', ctx);
    expect(a.recipes.length).toBeGreaterThan(3);
    for (const r of a.recipes) expect(r.totalTime).toBeLessThanOrEqual(30);
  });
  it('utiliser ce qui doit partir vite', () => {
    const a = answerRequest('utiliser ce qui doit partir vite', ctx);
    for (const r of a.recipes) expect(r.ingredients.some((i) => i.id === 'courgette')).toBe(true);
  });
});
