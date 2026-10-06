// ─────────────────────────────────────────────────────────────
// Suivi du poids : courbe lissée (le poids du jour varie de ±1 kg avec
// l'eau et le sel ; la tendance compte) et bilan sur 14 jours qui
// PROPOSE un ajustement des calories, jamais imposé.
// ─────────────────────────────────────────────────────────────
import type { WeightLog } from './types';
import type { NutritionProfile } from './micronutrients';
import { needs, objectiveOf, paceOf } from './profile';
import { OBJECTIVES, WEIGHT_REVIEW } from '../config/targets';

const DAY = 86400000;
const t = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').getTime();

/** Une pesée par jour (la dernière), triées */
export function dailyWeights(logs: WeightLog[]): Array<{ date: string; kg: number }> {
  const m = new Map<string, number>();
  for (const l of [...logs].sort((a, b) => a.date.localeCompare(b.date))) m.set(l.date.slice(0, 10), l.kg);
  return [...m].map(([date, kg]) => ({ date, kg })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Moyenne mobile exponentielle, tenant compte des jours sans pesée */
export function smooth(points: Array<{ date: string; kg: number }>, alpha = WEIGHT_REVIEW.smoothing): Array<{ date: string; kg: number; trend: number }> {
  let trend: number | null = null;
  let last = 0;
  return points.map((p) => {
    if (trend == null) trend = p.kg;
    else {
      const gap = Math.max(1, Math.round((t(p.date) - last) / DAY));
      const a = 1 - (1 - alpha) ** gap;
      trend = trend + a * (p.kg - trend);
    }
    last = t(p.date);
    return { ...p, trend: Math.round(trend * 100) / 100 };
  });
}

/** Pente (kg par semaine) par moindres carrés */
export function slopePerWeek(points: Array<{ date: string; kg: number }>): number {
  if (points.length < 2) return 0;
  const xs = points.map((p) => (t(p.date) - t(points[0].date)) / DAY);
  const ys = points.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? (num / den) * 7 : 0;
}

export interface WeightReview {
  /** sous la cible = le poids monte moins (ou baisse plus) que prévu → manger un peu plus */
  status: 'pas-assez' | 'dans-la-cible' | 'sous-la-cible' | 'au-dessus';
  /** kg par semaine sur la période */
  slope: number;
  /** fourchette visée en kg par semaine */
  expected: [number, number];
  days: number;
  weighIns: number;
  /** calories actuelles et proposées */
  kcal: number;
  proposal?: number;
  message: string;
}

const fr = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: 'exceptZero' });

/** Bilan des 14 derniers jours (today : date du jour, pour les tests) */
export function reviewWeight(p: NutritionProfile, logs: WeightLog[], today = new Date().toISOString().slice(0, 10)): WeightReview {
  const n = needs(p);
  const kcal = n?.kcal ?? p.kcal;
  const obj = objectiveOf(p) ?? 'maintien';
  const pace = OBJECTIVES[obj].usesPace ? paceOf(p) : 'standard';
  const pts = dailyWeights(logs.filter((l) => l.profileId === p.id));
  const from = t(today) - WEIGHT_REVIEW.days * DAY;
  const recent = pts.filter((x) => t(x.date) >= from && t(x.date) <= t(today));
  const span = recent.length ? Math.round((t(recent[recent.length - 1].date) - t(recent[0].date)) / DAY) : 0;
  const ref = recent.length ? recent.reduce((s, x) => s + x.kg, 0) / recent.length : p.weight;
  const [lo, hi] = WEIGHT_REVIEW.expected[obj][pace];
  const expected: [number, number] = [(lo / 100) * ref, (hi / 100) * ref];
  const base = { expected, days: span, weighIns: recent.length, kcal };
  if (recent.length < WEIGHT_REVIEW.minWeighIns || span < WEIGHT_REVIEW.days - 3)
    return { ...base, status: 'pas-assez', slope: 0, message: `Pesez-vous 2 à 3 fois par semaine, le matin à jeun : le bilan arrive après ${WEIGHT_REVIEW.days} jours (${recent.length} pesée${recent.length > 1 ? 's' : ''} pour l’instant).` };
  const slope = slopePerWeek(recent);
  const target = (expected[0] + expected[1]) / 2;
  const range = `${fr(expected[0], 2)} à ${fr(expected[1], 2)} kg par semaine`;
  if (slope >= expected[0] && slope <= expected[1])
    return { ...base, status: 'dans-la-cible', slope, message: `Évolution de ${fr(slope, 2)} kg par semaine : dans la cible (${range}). On ne change rien.` };
  const deltaRaw = ((target - slope) * WEIGHT_REVIEW.kcalPerKg) / 7;
  const sign = Math.sign(deltaRaw);
  const delta = sign * Math.min(WEIGHT_REVIEW.maxStep, Math.max(WEIGHT_REVIEW.minStep, Math.round(Math.abs(deltaRaw) / WEIGHT_REVIEW.step) * WEIGHT_REVIEW.step));
  const proposal = kcal + delta;
  const below = slope < expected[0];
  const what =
    obj === 'prise-de-muscle'
      ? below
        ? 'Le poids stagne'
        : 'Le poids monte vite (risque de prendre surtout du gras)'
      : obj === 'perte-de-poids'
        ? below
          ? 'La perte est rapide (risque de perdre du muscle)'
          : 'La perte est plus lente que prévu'
        : below
          ? 'Le poids baisse'
          : 'Le poids monte';
  return {
    ...base,
    status: below ? 'sous-la-cible' : 'au-dessus',
    slope,
    proposal,
    message: `${what} : ${fr(slope, 2)} kg par semaine sur ${span} jours, pour une cible de ${range}. Proposition : ${delta > 0 ? '+' : '−'}${Math.abs(delta)} kcal par jour (${kcal.toLocaleString('fr-FR')} → ${proposal.toLocaleString('fr-FR')} kcal).`,
  };
}

/** Applique une proposition : nouvelles calories saisies, historique gardé */
export function applyAdjustment(p: NutritionProfile, review: WeightReview, today = new Date().toISOString().slice(0, 10)): NutritionProfile {
  if (!review.proposal) return p;
  return {
    ...p,
    overrides: { ...(p.overrides ?? {}), kcal: review.proposal },
    adjustments: [...(p.adjustments ?? []), { date: today, from: review.kcal, to: review.proposal, reason: `bilan du poids : ${review.slope.toFixed(2)} kg/semaine` }],
  };
}
