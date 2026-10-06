import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID, INGREDIENTS } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { computeDetailed, dailyRef, NUTRIENTS } from '../src/domain/micronutrients';
import { retention } from '../src/config/retention';
import { cookServings, dayShares, mainPortion } from '../src/domain/shares';
import { analyzeWeek, foodSourcesFor } from '../src/domain/week';
import { generateNutriWeek, householdEaters } from '../src/domain/nutriPlanner';
import { newProfile } from '../src/domain/profile';
import type { Recipe, Slot } from '../src/domain/types';

const lookup = (id: string) => INGREDIENT_BY_ID[id];
const dir = join(__dirname, '../src/data/recipes');
const library = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Recipe[])
  .map((r) => ({ ...indexRecipe(r, lookup), micros: computeDetailed(r, lookup) }));
const byId = new Map(library.map((r) => [r.id, r]));
const lui = newProfile({ name: 'Lui', sex: 'homme', age: 30, height: 182, weight: 75, daily: 'sedentaire', sport: { sessions: 4, type: 'musculation', minutes: 60 }, trainingDays: [0, 1, 3, 4], objective: 'prise-de-muscle' });
const elle = newProfile({ name: 'Elle', sex: 'femme', age: 29, height: 165, weight: 57, daily: 'leger', objective: 'maintien' });

describe('pertes à la cuisson', () => {
  it('la vitamine C d’un légume bouilli diminue, pas celle d’un fruit ni les minéraux d’un plat cru', () => {
    expect(retention('bouilli', 'legume', 'vC')).toBe(0.5);
    expect(retention('bouilli', 'fruit', 'vC')).toBe(1);
    expect(retention('cru', 'legume', 'vC')).toBe(1);
    expect(retention('vapeur', 'legume', 'vC')).toBeGreaterThan(retention('bouilli', 'legume', 'vC'));
    expect(retention('four', 'viande', 'vK')).toBe(1);
  });
  it('appliquées au calcul détaillé', () => {
    const r = library.find((x) => x.technique === 'mijote' && x.ingredients.some((i) => lookup(i.id)?.category === 'legume'))!;
    const raw = computeDetailed({ ...r, technique: 'cru' }, lookup);
    const cooked = computeDetailed(r, lookup);
    expect(cooked.vC ?? 0).toBeLessThan(raw.vC ?? 0);
  });
});

describe('références selon l’âge et le sexe (ANSES)', () => {
  const def = (k: string) => NUTRIENTS.find((n) => n.key === k)!;
  it('fer, calcium, magnésium', () => {
    expect(dailyRef(def('fe'), { sex: 'femme', weight: 60, age: 30 })).toBe(16);
    expect(dailyRef(def('fe'), { sex: 'femme', weight: 60, age: 55 })).toBe(11);
    expect(dailyRef(def('ca'), { sex: 'homme', weight: 70, age: 20 })).toBe(1000);
    expect(dailyRef(def('ca'), { sex: 'homme', weight: 70, age: 30 })).toBe(950);
    expect(dailyRef(def('mg'), { sex: 'homme', weight: 70, age: 30 })).toBe(420);
  });
});

describe('parts de chacun', () => {
  const date = '2026-10-05'; // lundi, jour d'entraînement
  const pick = (slot: Slot, i: number) => library.filter((r) => (slot === 'matin' ? r.mealTypes.includes('petit-dejeuner') : r.mealTypes.includes('diner')))[i];
  const meals = [
    { recipe: pick('matin', 0), slot: 'matin' as Slot },
    { recipe: pick('midi', 3), slot: 'midi' as Slot },
    { recipe: pick('soir', 7), slot: 'soir' as Slot },
  ];
  it('la part suit l’énergie de chacun', () => {
    const [a, b] = dayShares(meals, [lui, elle], date, lookup);
    expect(a.portion).toBeGreaterThan(b.portion);
    expect(cookServings([a, b])).toBeGreaterThanOrEqual(a.portion + b.portion);
  });
  it('complément en vrais aliments si la part plafonne (jamais de poudre)', () => {
    const light = [{ recipe: library.filter((r) => r.mealTypes.includes('diner')).sort((x, y) => x.nutrition.kcal - y.nutrition.kcal)[0], slot: 'soir' as Slot }];
    const big = newProfile({ ...lui, weight: 95, height: 190, sport: { sessions: 6, type: 'musculation', minutes: 90 } });
    const [s] = dayShares(light, [big], date, lookup);
    expect(s.complements.length).toBeGreaterThan(0);
    expect(s.complements.map((c) => c.def.label).join(' ')).not.toMatch(/poudre|whey|shaker/i);
  });
  it('les compléments respectent les allergies', () => {
    const light = [{ recipe: library.filter((r) => r.mealTypes.includes('diner')).sort((x, y) => x.nutrition.kcal - y.nutrition.kcal)[0], slot: 'soir' as Slot }];
    const big = newProfile({ ...lui, weight: 95, allergies: ['lait', 'oeufs'] });
    const [s] = dayShares(light, [big], date, lookup);
    for (const c of s.complements) for (const [id] of c.def.items) expect(['laitier', 'oeufs']).not.toContain(lookup(id)!.category);
  });
  it('ingrédient principal en grammes', () => {
    const r = library.find((x) => x.ingredients.some((i) => i.id === 'poulet-cuisse'))!;
    expect(mainPortion(r, lookup)?.ing.category).toMatch(/volaille|viande/);
  });
});

describe('raisonnement à la semaine', () => {
  const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
  const plan = generateNutriWeek({ recipes: library, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots, servings: 2, seed: 3, eaters: householdEaters([lui, elle]) }, (id) => lookup(id)?.category);
  const weeks = analyzeWeek(plan, byId, [lui, elle], lookup);
  it('une analyse par personne, 7 jours', () => {
    expect(weeks).toHaveLength(2);
    expect(weeks[0].days).toHaveLength(7);
    expect(weeks[0].coverage).toBeGreaterThan(85);
  });
  it('les creux d’un jour compensés par la semaine ne sont pas des manques', () => {
    for (const w of weeks) for (const d of w.dips) expect(w.pct[d.def.key]).toBeGreaterThanOrEqual(99.5);
  });
  it('excès signalés : foie trop fréquent → vitamine A', () => {
    const liver = library.filter((r) => r.ingredients.some((i) => i.id === 'foie-volaille')).slice(0, 1);
    const fake = dates.map((date) => ({ key: `${date}|soir`, date, slot: 'soir' as Slot, recipeId: liver[0].id, servings: 2 }));
    const [w] = analyzeWeek(fake, byId, [elle], lookup);
    expect(w.excess.some((e) => e.def.key === 'vA')).toBe(true);
  });
  it('aliments simples pour combler un manque, sans allergène', () => {
    const fe = NUTRIENTS.find((n) => n.key === 'fe')!;
    const src = foodSourcesFor(fe, { ...elle, allergies: ['mollusques'] }, INGREDIENTS);
    expect(src.length).toBe(3);
    expect(src.every((s) => !/moule|huitre|palourde/.test(s.ing.id))).toBe(true);
    expect(src[0].pct).toBeGreaterThan(15);
  });
});
