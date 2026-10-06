import { describe, expect, it } from 'vitest';
import { bmr, dayKcal, needs, newProfile, sessionKcal, withTargets } from '../src/domain/profile';
import { householdEaters, soloEater } from '../src/domain/nutriPlanner';
import { MACROS, SAFETY } from '../src/config/targets';

const base = { sex: 'homme' as const, weight: 75, height: 180, age: 30 };

describe('profil personnel', () => {
  it('métabolisme de base Mifflin-St Jeor', () => {
    // homme 30 ans, 180 cm, 75 kg : 10×75 + 6,25×180 − 5×30 + 5 = 1730
    expect(bmr(base)).toBe(1730);
    // femme 30 ans, 165 cm, 60 kg : 600 + 1031,25 − 150 − 161 = 1320,25
    expect(bmr({ sex: 'femme', weight: 60, height: 165, age: 30 })).toBeCloseTo(1320.25);
  });

  it('anciens profils (activité globale) : même calcul qu’avant', () => {
    const maintien = needs({ ...base, activity: 'modere', goal: 'maintien' })!;
    expect(maintien.kcal).toBe(2700); // 1730 × 1,55 = 2681 → 2700
    const masse = needs({ ...base, activity: 'modere', goal: 'prise-de-masse' })!;
    expect(masse.kcal).toBeGreaterThan(maintien.kcal);
    expect(masse.objective).toBe('prise-de-muscle');
  });

  it('activité quotidienne + sport + objectif', () => {
    const sport = { sessions: 4, type: 'musculation' as const, minutes: 60 };
    // séance : (5 − 1) × 75 × 1 h = 300 kcal ; 4 séances → 171 kcal/jour
    expect(sessionKcal({ weight: 75, sport })).toBe(300);
    const m = needs({ ...base, daily: 'sedentaire', sport, objective: 'maintien' })!;
    expect(m.tdee).toBe(Math.round(1730 * 1.4 + 1200 / 7));
    const muscle = needs({ ...base, daily: 'sedentaire', sport, objective: 'prise-de-muscle', pace: 'standard' })!;
    const prudent = needs({ ...base, daily: 'sedentaire', sport, objective: 'prise-de-muscle', pace: 'prudent' })!;
    expect(muscle.kcal).toBeGreaterThan(prudent.kcal);
    expect(prudent.kcal).toBeGreaterThan(m.kcal);
    expect(muscle.protein).toBe(135); // 1,8 g × 75 kg
    expect(muscle.steps.length).toBeGreaterThan(4);
  });

  it('lipides 25–35 % avec plancher 0,8 g/kg ; glucides = le reste', () => {
    const n = needs({ ...base, daily: 'leger', objective: 'maintien' })!;
    const share = (n.fat * 9) / n.kcal;
    expect(share).toBeGreaterThanOrEqual(0.25 - 0.01);
    expect(share).toBeLessThanOrEqual(0.35 + 0.01);
    expect(n.fat).toBeGreaterThanOrEqual(75 * MACROS.fatMinPerKg);
    expect(Math.abs(n.protein * 4 + n.fat * 9 + n.carbs * 4 - n.kcal)).toBeLessThan(10);
  });

  it('déficit plafonné par un plancher de sécurité', () => {
    const petite = needs({ sex: 'femme', weight: 48, height: 155, age: 45, daily: 'sedentaire', objective: 'perte-de-poids' })!;
    expect(petite.kcal).toBeGreaterThanOrEqual(SAFETY.minKcal.femme);
    expect(petite.kcal).toBeGreaterThanOrEqual(petite.bmr * SAFETY.minOverBmr - 25);
    expect(petite.floored).toBe(true);
  });

  it('IMC élevé : protéines sur un poids de référence', () => {
    const n = needs({ ...base, weight: 130, daily: 'leger', objective: 'perte-de-poids' })!;
    expect(n.proteinWeight).toBeLessThan(130);
    expect(n.protein).toBeLessThan(130 * 2);
  });

  it('chaque valeur peut être remplacée à la main', () => {
    const p = newProfile({ ...base, overrides: { kcal: 3333, protein: 170 } });
    expect(p.kcal).toBe(3333);
    expect(Math.round(p.weight * p.proteinPerKg)).toBe(170);
    const n = needs(p)!;
    expect(n.manual.kcal).toBe(true);
    expect(n.kcalCalc).not.toBe(3333);
    // anciens objectifs « saisis à la main » convertis
    const old = withTargets({ ...newProfile(base), manualTargets: true, kcal: 2900, proteinPerKg: 2 });
    expect(old.overrides?.kcal).toBe(2900);
    expect(old.kcal).toBe(2900);
  });

  it('jours d’entraînement : plus d’énergie, même moyenne', () => {
    const p = newProfile({ ...base, daily: 'leger', sport: { sessions: 3, type: 'musculation', minutes: 60 }, trainingDays: [0, 2, 4] });
    const days = [0, 1, 2, 3, 4, 5, 6].map((d) => dayKcal(p, d));
    expect(days[0]).toBeGreaterThan(days[1]);
    expect(Math.abs(days.reduce((a, b) => a + b, 0) / 7 - p.kcal)).toBeLessThan(2);
  });

  it('les parts suivent les objectifs, seul ou à plusieurs', () => {
    const a = newProfile({ sex: 'homme', weight: 85, height: 185, age: 28, activity: 'intense', goal: 'prise-de-masse' });
    const b = newProfile({ sex: 'femme', weight: 55, height: 160, age: 28, activity: 'leger', goal: 'perte-de-poids' });
    expect(soloEater(b).portions).toBeLessThan(1);
    expect(soloEater(a).portions).toBeGreaterThan(1);
    const both = householdEaters([a, b]);
    expect(both[0].portions + both[1].portions).toBeCloseTo(2);
    expect(householdEaters([a])[0].portions).toBe(soloEater(a).portions);
  });
});

import { excludedIngredients, ingredientConflict } from '../src/domain/allergens';
import { INGREDIENTS } from '../src/data/ingredients';

describe('allergies et intolérances', () => {
  const get = (id: string) => INGREDIENTS.find((i) => i.id === id)!;
  it('reconnaît les familles d’allergènes', () => {
    const p = { allergies: ['gluten', 'fruits-a-coque', 'crustaces'] };
    expect(ingredientConflict(p, get('pates'))).toMatch(/gluten/);
    expect(ingredientConflict(p, get('amande'))).toMatch(/coque/);
    expect(ingredientConflict(p, get('crevette'))).toMatch(/crustac/);
    expect(ingredientConflict(p, get('noix-coco'))).toBeNull();
    expect(ingredientConflict({ allergies: ['poisson'] }, get('foie-morue'))).toMatch(/poisson/);
    expect(ingredientConflict({ allergies: ['poisson'] }, get('dashi'))).toMatch(/poisson/);
    expect(ingredientConflict(p, get('riz-blanc'))).toBeNull();
  });
  it('lactose : les fromages affinés restent permis', () => {
    const p = { intolerances: ['lactose'] };
    expect(ingredientConflict(p, get('lait'))).not.toBeNull();
    expect(ingredientConflict(p, get('comte'))).toBeNull();
    expect(ingredientConflict(p, get('beurre-clarifie'))).toBeNull();
  });
  it('aliments non aimés', () => {
    const ex = excludedIngredients({ dislikes: ['foie-volaille'] }, INGREDIENTS);
    expect(ex.size).toBeLessThanOrEqual(1);
  });
});
