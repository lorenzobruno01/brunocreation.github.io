import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { indexRecipe } from '../src/domain/indexing';
import { computeDetailed } from '../src/domain/micronutrients';
import { feedbackScore, learnedBonus, recipeScores, suspectIngredients } from '../src/domain/learning';
import { applyAdjustment, reviewWeight, smooth, slopePerWeek } from '../src/domain/weight';
import { needs, newProfile } from '../src/domain/profile';
import { dayShares } from '../src/domain/shares';
import { generateNutriWeek } from '../src/domain/nutriPlanner';
import type { Feedback, Recipe, Slot, WeightLog } from '../src/domain/types';

const lookup = (id: string) => INGREDIENT_BY_ID[id];
const dir = join(__dirname, '../src/data/recipes');
const library = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Recipe[])
  .map((r) => ({ ...indexRecipe(r, lookup), micros: computeDetailed(r, lookup) }));
const byId = new Map(library.map((r) => [r.id, r]));
const fb = (recipeId: string, p: Partial<Feedback>, i = 0): Feedback => ({ id: `c${i}|lo`, cookedId: `c${i}`, recipeId, profileId: 'lo', date: `2026-10-0${(i % 9) + 1}`, ...p });

describe('retours et apprentissage', () => {
  it('score d’un retour', () => {
    expect(feedbackScore({ ...fb('x', {}), taste: 5, again: 'oui' })).toBeGreaterThan(3);
    expect(feedbackScore({ ...fb('x', {}), taste: 2, again: 'non', digestion: 'inconfort' })).toBeLessThan(-4);
  });
  it('plat à ne pas refaire : fortement écarté', () => {
    const s = recipeScores([fb('a', { taste: 4, again: 'non' }, 1)], 'lo');
    expect(learnedBonus(s, 'a')).toBe(-40);
  });
  it('ingrédient suspect : présent dans les repas mal digérés, pas dans les autres', () => {
    const withOnion = library.filter((r) => r.ingredients.some((i) => i.id === 'oignon')).slice(0, 4);
    const without = library.filter((r) => !r.ingredients.some((i) => ['oignon', 'ail'].includes(i.id))).slice(0, 6);
    const feedback = [
      ...withOnion.map((r, i) => fb(r.id, { digestion: i < 3 ? 'inconfort' : 'bien' }, i)),
      ...without.map((r, i) => fb(r.id, { digestion: 'bien' }, 10 + i)),
    ];
    const sus = suspectIngredients(feedback, 'lo', (id) => byId.get(id), lookup);
    expect(sus.map((s) => s.ingredient.id)).toContain('oignon');
    expect(suspectIngredients(feedback, 'lo', (id) => byId.get(id), lookup, ['oignon']).map((s) => s.ingredient.id)).not.toContain('oignon');
  });
  it('le générateur écarte un plat « à ne pas refaire » et favorise un plat adoré', () => {
    const p = newProfile({ id: 'lo', name: 'Lo', sex: 'homme', age: 30, height: 180, weight: 75, objective: 'maintien' });
    const dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
    const slots: Slot[] = ['matin', 'midi', 'collation', 'soir'];
    const ctx = { recipes: library, favorites: new Set<string>(), lastCooked: new Map(), available: new Set<string>(), locked: [], dates, slots, servings: 1, seed: 4, eaters: [{ profile: p, portions: 1 }], lookup };
    const first = generateNutriWeek(ctx, (id) => lookup(id)?.category);
    const banned = first.find((e) => e.slot === 'soir')!.recipeId;
    const again = generateNutriWeek({ ...ctx, feedback: [fb(banned, { taste: 1, again: 'non' }, 1)] }, (id) => lookup(id)?.category);
    expect(again.map((e) => e.recipeId)).not.toContain(banned);
  }, 30000);
});

describe('suivi du poids', () => {
  const p = newProfile({ id: 'lo', name: 'Lo', sex: 'homme', age: 30, height: 180, weight: 75, daily: 'leger', sport: { sessions: 4, type: 'musculation', minutes: 60 }, objective: 'prise-de-muscle' });
  const series = (kgAt: (d: number) => number, days = 15, every = 2): WeightLog[] =>
    Array.from({ length: Math.ceil(days / every) }, (_, i) => {
      const d = i * every;
      const date = new Date(Date.UTC(2026, 8, 20 + d)).toISOString().slice(0, 10);
      return { id: `w${i}`, profileId: 'lo', date, kg: kgAt(d) };
    });
  const today = '2026-10-04';
  it('courbe lissée et pente', () => {
    const pts = smooth(series((d) => 75 + (d % 4 === 0 ? 0.8 : -0.8)).map((l) => ({ date: l.date, kg: l.kg })));
    const spread = Math.max(...pts.map((x) => x.trend)) - Math.min(...pts.map((x) => x.trend));
    expect(spread).toBeLessThan(1.6);
    expect(slopePerWeek([{ date: '2026-10-01', kg: 70 }, { date: '2026-10-08', kg: 70.5 }])).toBeCloseTo(0.5);
  });
  it('pas assez de pesées : pas de bilan', () => {
    expect(reviewWeight(p, series(() => 75, 6), today).status).toBe('pas-assez');
  });
  it('poids stagnant en prise de muscle → proposition d’augmenter, qui se répercute sur les parts', () => {
    const r = reviewWeight(p, series(() => 75), today);
    expect(r.status).toBe('sous-la-cible');
    expect(r.message).toMatch(/stagne/);
    expect(r.proposal!).toBeGreaterThan(r.kcal);
    expect(r.proposal! - r.kcal).toBeGreaterThanOrEqual(100);
    expect(r.proposal! - r.kcal).toBeLessThanOrEqual(300);
    const q = applyAdjustment(p, r, today);
    expect(needs(q)!.kcal).toBe(r.proposal);
    expect(q.adjustments).toHaveLength(1);
    const meal = [{ recipe: library.find((x) => x.mealTypes.includes('diner'))!, slot: 'soir' as Slot }];
    expect(dayShares(meal, [q], '2026-10-06', lookup)[0].portion).toBeGreaterThan(dayShares(meal, [p], '2026-10-06', lookup)[0].portion);
  });
  it('dans la cible : rien ne change', () => {
    const r = reviewWeight(p, series((d) => 75 + (0.15 * d) / 7), today);
    expect(r.status).toBe('dans-la-cible');
    expect(r.proposal).toBeUndefined();
  });
  it('perte trop rapide → proposition de manger un peu plus', () => {
    const perte = newProfile({ ...p, objective: 'perte-de-poids' });
    const r = reviewWeight(perte, series((d) => 80 - (1.2 * d) / 7), today);
    expect(r.status).toBe('sous-la-cible');
    expect(r.message).toMatch(/rapide/);
    expect(r.proposal!).toBeGreaterThan(r.kcal);
  });
});
