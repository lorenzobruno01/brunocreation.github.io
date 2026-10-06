// ─────────────────────────────────────────────────────────────
// Profil personnel → besoins (énergie, protéines, lipides, glucides).
// Toutes les constantes viennent de src/config/targets.ts.
// Chaque valeur calculée peut être remplacée à la main (overrides).
// ─────────────────────────────────────────────────────────────
import type { NutritionProfile } from './micronutrients';
import { DAILY_ACTIVITY, MACROS, OBJECTIVES, SAFETY, SPORTS, type DailyActivity, type Objective, type Pace } from '../config/targets';

/** Ancienne échelle d'activité (profils créés avant la v2) : NAP global, sport compris */
const LEGACY_PAL: Record<NonNullable<NutritionProfile['activity']>, number> = {
  sedentaire: 1.2,
  leger: 1.375,
  modere: 1.55,
  intense: 1.725,
  'tres-intense': 1.9,
};
const LEGACY_GOAL: Record<NonNullable<NutritionProfile['goal']>, Objective> = {
  'prise-de-masse': 'prise-de-muscle',
  maintien: 'maintien',
  'perte-de-poids': 'perte-de-poids',
};

export const objectiveOf = (p: Partial<NutritionProfile>): Objective | undefined => p.objective ?? (p.goal ? LEGACY_GOAL[p.goal] : undefined);
export const paceOf = (p: Partial<NutritionProfile>): Pace => p.pace ?? 'standard';

/** Métabolisme de base (kcal/jour) — Mifflin-St Jeor */
export function bmr(p: { sex: 'homme' | 'femme'; weight: number; height: number; age: number }): number {
  return 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'homme' ? 5 : -161);
}

/** Dépense d'une séance de sport (kcal ajoutées à la journée) */
export function sessionKcal(p: Pick<NutritionProfile, 'weight' | 'sport'>): number {
  if (!p.sport || !p.sport.sessions) return 0;
  return (SPORTS[p.sport.type].met - 1) * p.weight * (p.sport.minutes / 60);
}

export interface Needs {
  bmr: number;
  /** NAP retenu (hors sport si l'activité quotidienne est renseignée) */
  pal: number;
  sportPerDay: number;
  tdee: number;
  objective: Objective;
  pace: Pace;
  factor: number;
  /** énergie calculée avant remplacement manuel */
  kcalCalc: number;
  kcal: number;
  protein: number;
  proteinCalc: number;
  fat: number;
  fatCalc: number;
  carbs: number;
  carbsCalc: number;
  /** le plancher de sécurité a relevé l'énergie */
  floored: boolean;
  /** protéines calculées sur un poids de référence (IMC élevé) */
  proteinWeight: number;
  manual: { kcal: boolean; protein: boolean; fat: boolean; carbs: boolean };
  /** raisonnement pas à pas, en français */
  steps: string[];
  warnings: string[];
}

const round = (v: number, step = 1) => Math.round(v / step) * step;
const fr = (v: number, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

/** Besoins d'une personne (null si âge, taille ou poids manquent) */
export function needs(p: Partial<NutritionProfile>): Needs | null {
  if (!p.sex || !p.weight || !p.height || !p.age) return null;
  const objective = objectiveOf(p) ?? 'maintien';
  const pace = OBJECTIVES[objective].usesPace ? paceOf(p) : 'standard';
  const o = OBJECTIVES[objective];
  const steps: string[] = [];
  const warnings: string[] = [];
  const b = bmr({ sex: p.sex, weight: p.weight, height: p.height, age: p.age });
  steps.push(`Métabolisme de base (Mifflin-St Jeor) : ${fr(round(b))} kcal — l’énergie dépensée au repos.`);

  let pal: number;
  let sportPerDay = 0;
  if (p.daily) {
    pal = DAILY_ACTIVITY[p.daily as DailyActivity].pal;
    steps.push(`Activité quotidienne « ${DAILY_ACTIVITY[p.daily as DailyActivity].label.toLowerCase()} » : × ${fr(pal, 2)}.`);
    const s = sessionKcal({ weight: p.weight, sport: p.sport });
    if (s && p.sport) {
      sportPerDay = (s * p.sport.sessions) / 7;
      steps.push(`Sport : ${p.sport.sessions} × ${p.sport.minutes} min de ${SPORTS[p.sport.type].label.toLowerCase()} ≈ ${fr(round(s, 10))} kcal par séance, soit ${fr(round(sportPerDay, 10))} kcal par jour en moyenne.`);
    }
  } else {
    pal = LEGACY_PAL[p.activity ?? 'modere'];
    steps.push(`Niveau d’activité (sport compris) : × ${fr(pal, 2)}.`);
  }
  const tdee = b * pal + sportPerDay;
  steps.push(`Dépense totale estimée : ${fr(round(tdee, 10))} kcal par jour.`);

  const factor = o.energy[pace];
  let kcalCalc = tdee * factor;
  if (factor !== 1) steps.push(`Objectif « ${o.label.toLowerCase()} »${o.usesPace ? ` (rythme ${pace})` : ''} : ${factor > 1 ? '+' : '−'}${fr(Math.abs(Math.round((factor - 1) * 100)))} % → ${fr(round(kcalCalc, 10))} kcal.`);
  const floor = Math.max(b * SAFETY.minOverBmr, SAFETY.minKcal[p.sex], tdee * (1 - SAFETY.maxDeficit));
  const floored = kcalCalc < floor;
  if (floored) {
    kcalCalc = floor;
    steps.push(`Plancher de sécurité appliqué : jamais moins de ${fr(round(floor, 10))} kcal.`);
  }
  kcalCalc = round(kcalCalc, SAFETY.roundKcal);

  const bmi = p.weight / (p.height / 100) ** 2;
  const proteinWeight = bmi > MACROS.proteinBmiCap ? MACROS.proteinReferenceBmi * (p.height / 100) ** 2 : p.weight;
  const perKg = Math.min(o.protein[pace], MACROS.proteinMaxPerKg);
  const proteinCalc = round(proteinWeight * perKg);
  steps.push(`Protéines : ${fr(perKg, 1)} g par kg${proteinWeight !== p.weight ? ` de poids de référence (${fr(round(proteinWeight))} kg)` : ''} → ${proteinCalc} g (fourchette conseillée ${fr(o.proteinRange[0], 1)} à ${fr(o.proteinRange[1], 1)} g/kg).`);

  const ov = p.overrides ?? {};
  const kcal = ov.kcal ?? kcalCalc;
  const protein = ov.protein ?? proteinCalc;
  const fatShare = Math.min(MACROS.fatShareRange[1], Math.max(MACROS.fatShareRange[0], o.fatShare));
  const fatCalc = round(Math.max((kcal * fatShare) / 9, p.weight * MACROS.fatMinPerKg));
  const fat = ov.fat ?? fatCalc;
  steps.push(`Lipides : ${fr(Math.round(fatShare * 100))} % de l’énergie, au moins ${fr(MACROS.fatMinPerKg, 1)} g/kg → ${fatCalc} g.`);
  const carbsCalc = round(Math.max(0, kcal - protein * 4 - fat * 9) / 4);
  const carbs = ov.carbs ?? carbsCalc;
  steps.push(`Glucides : le reste de l’énergie → ${carbsCalc} g.`);

  if (p.age < SAFETY.adultAge) warnings.push('Les formules utilisées sont prévues pour les adultes : demandez conseil à un professionnel de santé pour un adolescent.');
  if (ov.kcal && ov.kcal < floor) warnings.push(`Les calories saisies (${fr(ov.kcal)} kcal) sont sous le plancher de sécurité calculé (${fr(round(floor, 10))} kcal).`);
  const macroKcal = protein * 4 + fat * 9 + carbs * 4;
  if ((ov.fat || ov.carbs || ov.protein) && Math.abs(macroKcal - kcal) > 150) warnings.push(`Les macros saisies font ${fr(round(macroKcal, 10))} kcal, pour un objectif de ${fr(kcal)} kcal.`);

  return {
    bmr: round(b),
    pal,
    sportPerDay: round(sportPerDay),
    tdee: round(tdee),
    objective,
    pace,
    factor,
    kcalCalc,
    kcal,
    protein,
    proteinCalc,
    fat,
    fatCalc,
    carbs,
    carbsCalc,
    floored,
    proteinWeight: round(proteinWeight),
    manual: { kcal: ov.kcal != null, protein: ov.protein != null, fat: ov.fat != null, carbs: ov.carbs != null },
    steps,
    warnings,
  };
}

/**
 * Énergie d'un jour donné : les jours d'entraînement reçoivent la dépense
 * de la séance, les autres jours un peu moins ; la moyenne de la semaine
 * reste égale à l'objectif. weekday : 0 = lundi … 6 = dimanche.
 */
export function dayKcal(p: NutritionProfile, weekday: number): number {
  const n = needs(p);
  const kcal = n?.kcal ?? p.kcal;
  const days = p.trainingDays ?? [];
  if (!n || !days.length || !p.sport?.sessions || !p.daily) return kcal;
  const s = sessionKcal(p) * n.factor;
  const perDay = (s * days.length) / 7;
  return Math.round(kcal - perDay + (days.includes(weekday) ? s : 0));
}

/**
 * Recopie les besoins calculés dans les champs historiques (kcal,
 * proteinPerKg) utilisés par le reste de l'appli, et convertit les anciens
 * objectifs « saisis à la main » en remplacements.
 */
export function withTargets(p: NutritionProfile): NutritionProfile {
  let q = p;
  if (q.manualTargets) {
    const { manualTargets: _m, ...rest } = q;
    q = { ...rest, overrides: { kcal: q.kcal, protein: Math.round(q.weight * q.proteinPerKg), ...q.overrides } };
  }
  const n = needs(q);
  if (!n) return q;
  return { ...q, kcal: n.kcal, proteinPerKg: Math.round((n.protein / q.weight) * 100) / 100 };
}

export function newProfile(partial: Partial<NutritionProfile> = {}): NutritionProfile {
  return withTargets({
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    sex: 'homme',
    age: 30,
    height: 175,
    weight: 70,
    ...(partial.activity ? {} : { daily: 'leger' as const }),
    ...(partial.goal ? {} : { objective: 'maintien' as const }),
    pace: 'standard',
    kcal: 2500,
    proteinPerKg: 1.2,
    ...partial,
  });
}

/** Indice de masse corporelle (repère, sans valeur diagnostique pour un sportif musclé) */
export function bmi(p: { weight: number; height?: number }): number | null {
  return p.height ? Math.round((p.weight / (p.height / 100) ** 2) * 10) / 10 : null;
}
