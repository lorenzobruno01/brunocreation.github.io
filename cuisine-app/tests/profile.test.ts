import { describe, expect, it } from 'vitest';
import { bmr, computeTargets, newProfile, withTargets } from '../src/domain/profile';
import { householdEaters, soloEater } from '../src/domain/nutriPlanner';

describe('profil personnel', () => {
  it('métabolisme de base Mifflin-St Jeor', () => {
    // homme 30 ans, 180 cm, 75 kg : 10×75 + 6,25×180 − 5×30 + 5 = 1730
    expect(bmr({ sex: 'homme', weight: 75, height: 180, age: 30 })).toBe(1730);
    // femme 30 ans, 165 cm, 60 kg : 600 + 1031,25 − 150 − 161 = 1320,25
    expect(bmr({ sex: 'femme', weight: 60, height: 165, age: 30 })).toBeCloseTo(1320.25);
  });

  it('objectif et activité changent les besoins', () => {
    const base = { sex: 'homme' as const, weight: 75, height: 180, age: 30, activity: 'modere' as const };
    const masse = computeTargets({ ...base, goal: 'prise-de-masse' })!;
    const maintien = computeTargets({ ...base, goal: 'maintien' })!;
    const perte = computeTargets({ ...base, goal: 'perte-de-poids' })!;
    expect(maintien.kcal).toBe(2700); // 1730 × 1,55 = 2681 → 2700
    expect(masse.kcal).toBeGreaterThan(maintien.kcal);
    expect(perte.kcal).toBeLessThan(maintien.kcal);
    expect(perte.kcal).toBeGreaterThanOrEqual(Math.round((1730 * 1.1) / 50) * 50);
    expect(masse.proteinPerKg).toBe(1.8);
  });

  it('les objectifs saisis à la main ne sont pas écrasés', () => {
    const p = newProfile({ manualTargets: true, kcal: 3333, proteinPerKg: 2.2 });
    expect(withTargets({ ...p, weight: 90 }).kcal).toBe(3333);
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
