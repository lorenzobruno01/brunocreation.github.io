import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID, INGREDIENTS } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { computeDetailed, dailyRef, NUTRIENTS } from '../src/domain/micronutrients';
import { retention } from '../src/config/retention';
import { cookServings, dayShares, mainPortion } from '../src/domain/shares';
import { analyzeWeek, foodSourcesFor } from '../src/domain/week';
import { generateNutriWeek, householdEaters, recentPlanned } from '../src/domain/nutriPlanner';
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

import { recipeConflict } from '../src/domain/allergens';

describe('générateur : ≥ 100 % sur la semaine pour chacun', () => {
  const dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
  const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
  const ines = newProfile({ ...elle, allergies: ['crustaces'], intolerances: ['lactose'], dislikes: ['foie-volaille'], spice: 0 });
  const plan = generateNutriWeek({ recipes: library, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots, servings: 2, seed: 5, eaters: householdEaters([lui, ines]), lookup }, (id) => lookup(id)?.category);
  const weeks = analyzeWeek(plan, byId, [lui, ines], lookup);
  it('aucun plat interdit pour l’un des deux', () => {
    for (const e of plan) expect(recipeConflict(byId.get(e.recipeId)!, [lui, ines], lookup)).toBeNull();
  });
  it('100 % de chaque nutriment pour chacun, sans excès', () => {
    for (const w of weeks) {
      expect(w.gaps.map((g) => `${w.profile.name} ${g.key} ${Math.round(w.pct[g.key])}`)).toEqual([]);
      expect(w.excess.map((e) => e.def.key)).toEqual([]);
    }
  });
  it('jamais deux fois la même recette', () => {
    expect(new Set(plan.map((e) => e.recipeId)).size).toBe(plan.length);
  });
});

describe('variété d’une semaine à l’autre', () => {
  const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
  const week = (start: number) => [...Array(7)].map((_, i) => `2026-10-${String(start + i).padStart(2, '0')}`);
  const eaters = householdEaters([lui, elle]);
  const w1 = generateNutriWeek({ recipes: library, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates: week(5), slots, servings: 2, seed: 7, eaters }, (id) => lookup(id)?.category);
  const recent = recentPlanned(w1, '2026-10-12');
  const w2 = generateNutriWeek({ recipes: library, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates: week(12), slots, servings: 2, seed: 8, eaters, recent }, (id) => lookup(id)?.category);
  it('historique : la semaine dernière pèse plus que les précédentes, les restes ne comptent pas', () => {
    const h = recentPlanned(
      [
        { key: 'a', date: '2026-10-08', slot: 'soir', recipeId: 'x', servings: 2 },
        { key: 'b', date: '2026-09-20', slot: 'soir', recipeId: 'y', servings: 2 },
        { key: 'c', date: '2026-10-09', slot: 'midi', recipeId: 'z', servings: 0, leftoverOf: 'a' },
        { key: 'd', date: '2026-10-12', slot: 'soir', recipeId: 'w', servings: 2 },
      ],
      '2026-10-12',
    );
    expect(h.get('x')).toBe(1);
    expect(h.get('y')).toBeLessThan(1);
    expect(h.has('z')).toBe(false);
    expect(h.has('w')).toBe(false);
  });
  it('aucun plat de midi ou du soir repris de la semaine précédente, toujours 100 %', () => {
    const before = new Set(w1.filter((e) => e.slot === 'midi' || e.slot === 'soir').map((e) => e.recipeId));
    expect(w2.filter((e) => (e.slot === 'midi' || e.slot === 'soir') && before.has(e.recipeId))).toEqual([]);
    for (const w of analyzeWeek(w2, byId, [lui, elle], lookup)) expect(w.coverage).toBeGreaterThan(99);
  });
});

describe('générateur : dit quand c’est impossible', () => {
  it('sans poisson ni fruits de mer, l’EPA + DHA est signalé comme manque, avec des solutions', () => {
    const dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
    const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
    const p = newProfile({ ...elle, allergies: ['poisson', 'crustaces', 'mollusques'] });
    const plan = generateNutriWeek({ recipes: library, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots, servings: 1, seed: 2, eaters: [{ profile: p, portions: 1 }], lookup }, (id) => lookup(id)?.category);
    const [w] = analyzeWeek(plan, byId, [p], lookup);
    const epa = w.gaps.find((g) => g.key === 'epa');
    expect(epa).toBeDefined();
    const src = foodSourcesFor(epa!, p, INGREDIENTS);
    expect(src.every((s) => s.ing.category !== 'poisson' && s.ing.category !== 'fruits-de-mer')).toBe(true);
  });
});

import { batchFriendly, leftoverLinks } from '../src/domain/nutriPlanner';
import { planServings } from '../src/domain/shares';
import type { SlotMode } from '../src/domain/types';

describe('gabarit de semaine', () => {
  const dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
  const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
  // lundi midi dehors, mardi midi restes du lundi soir, mercredi soir 15 min, dimanche soir batch
  const template: Record<string, SlotMode> = { '0|midi': 'dehors', '1|midi': 'restes', '2|soir': '15', '6|soir': 'batch', '3|midi': 'restes' };
  const ctx = { recipes: library, favorites: new Set<string>(), lastCooked: new Map(), available: new Set<string>(), locked: [], dates, slots, servings: 2, seed: 6, eaters: householdEaters([lui, elle]), lookup, template };
  const plan = generateNutriWeek(ctx, (id) => lookup(id)?.category);
  const at = (date: string, slot: Slot) => plan.find((e) => e.key === `${date}|${slot}`);
  it('liens « restes » : le repas principal précédent', () => {
    const links = leftoverLinks(dates, slots, template);
    expect(links.get('2026-10-13|midi')).toBe('2026-10-12|soir');
    expect(links.get('2026-10-15|midi')).toBe('2026-10-14|soir');
  });
  it('dehors : rien de prévu ; restes : même plat, rien à cuisiner', () => {
    expect(at('2026-10-12', 'midi')).toBeUndefined();
    const r = at('2026-10-13', 'midi')!;
    expect(r.leftoverOf).toBe('2026-10-12|soir');
    expect(r.recipeId).toBe(at('2026-10-12', 'soir')!.recipeId);
    expect(r.servings).toBe(0);
  });
  it('temps disponible et batch respectés', () => {
    expect(byId.get(at('2026-10-14', 'soir')!.recipeId)!.totalTime).toBeLessThanOrEqual(25);
    expect(batchFriendly(byId.get(at('2026-10-18', 'soir')!.recipeId)!)).toBe(true);
  });
  it('la semaine reste à 100 % pour chacun', () => {
    for (const w of analyzeWeek(plan, byId, [lui, elle], lookup)) expect(w.gaps.map((g) => `${g.key} ${Math.round(w.pct[g.key])}`)).toEqual([]);
  });
  it('quantité cuisinée = parts du jour + parts des restes', () => {
    const withServ = planServings(plan, byId, [lui, elle], lookup);
    const src = withServ.find((e) => e.key === '2026-10-12|soir')!;
    const plain = withServ.find((e) => e.key === '2026-10-16|soir')!;
    expect(src.servings).toBeGreaterThan(plain.servings * 1.5);
    expect(withServ.find((e) => e.key === '2026-10-13|midi')!.servings).toBe(0);
  });
  it('ingrédients à utiliser vite : favorisés en début de semaine', () => {
    const soon = new Set(['courgette']);
    const p2 = generateNutriWeek({ ...ctx, template: undefined, useSoon: soon }, (id) => lookup(id)?.category);
    const early = p2.filter((e) => e.date <= '2026-10-14').some((e) => byId.get(e.recipeId)!.ingredients.some((i) => i.id === 'courgette'));
    expect(early).toBe(true);
  });
});

import { breakfastOk, isSweetBreakfast } from '../src/domain/planner';

describe('petits-déjeuners', () => {
  const dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
  const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
  const gen = (constraints: Record<string, unknown>) =>
    generateNutriWeek({ recipes: library, favorites: new Set(), lastCooked: new Map(), available: new Set(), locked: [], dates, slots, servings: 2, seed: 8, eaters: householdEaters([lui, elle]), lookup, constraints }, (id) => lookup(id)?.category);
  const morning = (plan: ReturnType<typeof gen>) => plan.filter((e) => e.slot === 'matin').map((e) => byId.get(e.recipeId)!);
  it('par défaut : ni poisson ni abats le matin', () => {
    for (const r of morning(gen({}))) expect(r.proteins.some((p) => ['abats', 'poisson-gras', 'poisson-blanc', 'fruits-de-mer'].includes(p)), r.name).toBe(false);
  });
  it('sucré et express : uniquement des petits-déjeuners sucrés prêts en 15 min', () => {
    const c = { breakfast: 'sucre', breakfastExpress: true } as const;
    const m = morning(gen(c));
    expect(m.length).toBe(7);
    for (const r of m) {
      expect(isSweetBreakfast(r), r.name).toBe(true);
      expect(r.prepTime + r.cookTime, r.name).toBeLessThanOrEqual(15);
      expect(breakfastOk(r, c)).toBe(true);
    }
  });
});
