// ─────────────────────────────────────────────────────────────
// Profil personnel : taille, poids, âge, activité, objectif
// → besoins énergétiques et protéiques calculés automatiquement.
// Formule de Mifflin-St Jeor (1990), la plus juste chez l'adulte
// selon l'Academy of Nutrition and Dietetics, × niveau d'activité.
// ─────────────────────────────────────────────────────────────
import type { NutritionProfile } from './micronutrients';

export type Activity = 'sedentaire' | 'leger' | 'modere' | 'intense' | 'tres-intense';
export type Goal = 'prise-de-masse' | 'maintien' | 'perte-de-poids';

export const ACTIVITIES: Record<Activity, { label: string; hint: string; factor: number }> = {
  sedentaire: { label: 'Sédentaire', hint: 'travail assis, peu de marche', factor: 1.2 },
  leger: { label: 'Légère', hint: 'sport 1–2 fois/semaine ou métier debout', factor: 1.375 },
  modere: { label: 'Modérée', hint: 'sport 3–4 fois/semaine', factor: 1.55 },
  intense: { label: 'Intense', hint: 'musculation ou sport 5–6 fois/semaine', factor: 1.725 },
  'tres-intense': { label: 'Très intense', hint: 'sport quotidien + métier physique', factor: 1.9 },
};

export const GOALS: Record<Goal, { label: string; emoji: string; kcal: number; proteinPerKg: number; hint: string }> = {
  'prise-de-masse': { label: 'Prise de muscle / de poids', emoji: '💪', kcal: 1.12, proteinPerKg: 1.8, hint: '+12 % d’énergie, 1,8 g de protéines/kg' },
  maintien: { label: 'Maintien, forme', emoji: '⚖️', kcal: 1, proteinPerKg: 1.4, hint: 'énergie d’équilibre, 1,4 g de protéines/kg' },
  'perte-de-poids': { label: 'Perte de gras', emoji: '🔥', kcal: 0.82, proteinPerKg: 1.8, hint: '−18 % d’énergie, protéines élevées pour garder le muscle' },
};

/** Métabolisme de base (kcal/jour) — Mifflin-St Jeor */
export function bmr(p: { sex: 'homme' | 'femme'; weight: number; height: number; age: number }): number {
  return 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'homme' ? 5 : -161);
}

/** Objectifs calculés à partir des données personnelles (null si incomplètes) */
export function computeTargets(p: Partial<NutritionProfile>): { kcal: number; proteinPerKg: number; bmr: number; tdee: number } | null {
  if (!p.sex || !p.weight || !p.height || !p.age || !p.activity || !p.goal) return null;
  const b = bmr({ sex: p.sex, weight: p.weight, height: p.height, age: p.age });
  const tdee = b * ACTIVITIES[p.activity].factor;
  const g = GOALS[p.goal];
  // jamais sous le métabolisme de base + 10 %, arrondi à 50 kcal
  const kcal = Math.round(Math.max(b * 1.1, tdee * g.kcal) / 50) * 50;
  return { kcal, proteinPerKg: g.proteinPerKg, bmr: Math.round(b), tdee: Math.round(tdee) };
}

/** Applique le calcul automatique sauf si l'utilisateur a saisi ses objectifs à la main */
export function withTargets(p: NutritionProfile): NutritionProfile {
  if (p.manualTargets) return p;
  const t = computeTargets(p);
  return t ? { ...p, kcal: t.kcal, proteinPerKg: t.proteinPerKg } : p;
}

export function newProfile(partial: Partial<NutritionProfile> = {}): NutritionProfile {
  return withTargets({
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    sex: 'homme',
    age: 30,
    height: 175,
    weight: 70,
    activity: 'modere',
    goal: 'maintien',
    kcal: 2500,
    proteinPerKg: 1.4,
    ...partial,
  });
}

/** Indice de masse corporelle (repère, sans valeur diagnostique pour un sportif musclé) */
export function bmi(p: { weight: number; height?: number }): number | null {
  return p.height ? Math.round((p.weight / (p.height / 100) ** 2) * 10) / 10 : null;
}
