// ─────────────────────────────────────────────────────────────
// SEUILS ET RÉFÉRENCES — un seul fichier, documenté.
// Toute valeur chiffrée utilisée pour calculer les besoins d'une
// personne vient d'ici. Modifier une valeur ici change le calcul
// partout (profils, « Mes besoins », planning, courses).
//
// Sources :
// - Métabolisme de base : Mifflin MD, St Jeor ST et al., Am J Clin Nutr
//   1990;51:241-7 — recommandée par l'Academy of Nutrition and Dietetics.
// - Niveaux d'activité physique (NAP) : EFSA, Scientific Opinion on
//   Dietary Reference Values for energy, 2013 (NAP 1,4 à 2,0) ; ANSES,
//   Actualisation des repères du PNNS, 2016.
// - Coût énergétique des séances : Ainsworth BE et al., Compendium of
//   Physical Activities, 2011 (MET).
// - Protéines : ANSES 2016 (référence adulte 0,83 g/kg ; sportif 1,2 à
//   1,7 g/kg) ; ISSN Position Stand, Jäger R et al. 2017 (1,4 à 2,0 g/kg
//   pour l'hypertrophie) ; Helms ER et al. 2014 (2,3 à 3,1 g/kg de masse
//   maigre en déficit).
// - Lipides : ANSES 2016, 35 à 40 % de l'énergie chez l'adulte ; nous
//   retenons 25 à 35 %, avec un plancher de 0,8 g/kg pour les hormones.
// - Vitamines et minéraux : src/domain/micronutrients.ts (EFSA / ANSES).
//
// Ces calculs donnent un point de départ, pas une prescription : le suivi
// du poids sur 2 semaines permet ensuite de les ajuster (voir Phase 5).
// ─────────────────────────────────────────────────────────────

export type DailyActivity = 'sedentaire' | 'leger' | 'actif' | 'tres-actif';
export type SportType = 'musculation' | 'course' | 'collectif' | 'autre';
export type Objective = 'prise-de-muscle' | 'maintien' | 'perte-de-poids' | 'performance';
export type Pace = 'prudent' | 'standard';

/** Activité quotidienne HORS sport → NAP (multiplie le métabolisme de base) */
export const DAILY_ACTIVITY: Record<DailyActivity, { label: string; hint: string; emoji: string; pal: number }> = {
  sedentaire: { label: 'Assis la plupart du temps', hint: 'bureau, télétravail, peu de marche', emoji: '🪑', pal: 1.4 },
  leger: { label: 'Un peu actif', hint: 'debout par moments, 30 min de marche', emoji: '🚶', pal: 1.55 },
  actif: { label: 'Actif', hint: 'debout toute la journée, beaucoup de marche', emoji: '🧑‍🍳', pal: 1.7 },
  'tres-actif': { label: 'Très actif', hint: 'métier physique : chantier, manutention…', emoji: '🏗️', pal: 1.9 },
};

/** Sport : MET moyen d'une séance (Compendium 2011). Dépense ajoutée = (MET − 1) × kg × heures */
export const SPORTS: Record<SportType, { label: string; emoji: string; met: number }> = {
  musculation: { label: 'Musculation', emoji: '🏋️', met: 5 },
  course: { label: 'Course, vélo, natation', emoji: '🏃', met: 8.5 },
  collectif: { label: 'Sport collectif, combat', emoji: '⚽', met: 7.5 },
  autre: { label: 'Autre (yoga, danse, rando…)', emoji: '🧘', met: 4.5 },
};

/**
 * Objectifs : facteur appliqué à la dépense totale, et protéines en g/kg.
 * « prudent » = progression lente (moins de gras pris, moins de faim).
 */
export const OBJECTIVES: Record<
  Objective,
  { label: string; emoji: string; hint: string; energy: Record<Pace, number>; protein: Record<Pace, number>; proteinRange: [number, number]; fatShare: number; usesPace: boolean }
> = {
  'prise-de-muscle': {
    label: 'Prendre du muscle',
    emoji: '💪',
    hint: 'léger surplus d’énergie et protéines élevées',
    energy: { prudent: 1.05, standard: 1.1 },
    protein: { prudent: 1.6, standard: 1.8 },
    proteinRange: [1.6, 2.2],
    fatShare: 0.3,
    usesPace: true,
  },
  maintien: {
    label: 'Rester en forme',
    emoji: '⚖️',
    hint: 'énergie d’équilibre, assiette dense en nutriments',
    energy: { prudent: 1, standard: 1 },
    protein: { prudent: 1.2, standard: 1.2 },
    proteinRange: [1, 1.6],
    fatShare: 0.32,
    usesPace: false,
  },
  'perte-de-poids': {
    label: 'Perdre du gras',
    emoji: '🔥',
    hint: 'déficit modéré, protéines élevées pour garder le muscle',
    energy: { prudent: 0.9, standard: 0.8 },
    protein: { prudent: 1.8, standard: 2 },
    proteinRange: [1.6, 2.4],
    fatShare: 0.3,
    usesPace: true,
  },
  performance: {
    label: 'Performance sportive',
    emoji: '🏅',
    hint: 'énergie couverte, plus de glucides les jours d’entraînement',
    energy: { prudent: 1, standard: 1.05 },
    protein: { prudent: 1.6, standard: 1.7 },
    proteinRange: [1.4, 2],
    fatShare: 0.27,
    usesPace: false,
  },
};

export const MACROS = {
  /** part de l'énergie apportée par les lipides : bornes */
  fatShareRange: [0.25, 0.35] as [number, number],
  /** plancher de lipides (g/kg) : hormones, vitamines liposolubles */
  fatMinPerKg: 0.8,
  /** plafond de protéines (g/kg) au-delà duquel on n'apporte rien de plus */
  proteinMaxPerKg: 2.5,
  /** au-delà de cet IMC, les protéines se calculent sur un poids de référence (IMC 27) */
  proteinBmiCap: 30,
  proteinReferenceBmi: 27,
};

export const SAFETY = {
  /** jamais en dessous : métabolisme de base × 1,1 */
  minOverBmr: 1.1,
  /** jamais en dessous de ces apports quotidiens */
  minKcal: { homme: 1500, femme: 1200 },
  /** déficit maximal par rapport à la dépense */
  maxDeficit: 0.25,
  /** arrondi des calories affichées */
  roundKcal: 50,
  /** âge minimal des formules adultes */
  adultAge: 18,
};

/**
 * Bilan du poids sur 14 jours : évolution attendue par semaine, en % du
 * poids. Repères : Helms et al. 2014 (perte 0,5 à 1 %/sem.), Iraki et al.
 * 2019 (prise de muscle ≈ 0,25 à 0,5 %/mois chez le pratiquant entraîné,
 * plus chez le débutant). 1 kg de variation ≈ 7 700 kcal.
 */
export const WEIGHT_REVIEW = {
  days: 14,
  minWeighIns: 6,
  /** fourchette visée, % du poids par semaine */
  expected: {
    'prise-de-muscle': { prudent: [0.05, 0.2], standard: [0.1, 0.3] },
    maintien: { prudent: [-0.15, 0.15], standard: [-0.15, 0.15] },
    'perte-de-poids': { prudent: [-0.5, -0.2], standard: [-0.8, -0.4] },
    performance: { prudent: [-0.15, 0.15], standard: [-0.15, 0.15] },
  } as Record<Objective, Record<Pace, [number, number]>>,
  kcalPerKg: 7700,
  /** pas d'ajustement proposé */
  step: 50,
  maxStep: 300,
  minStep: 100,
  /** lissage de la courbe (moyenne mobile exponentielle) */
  smoothing: 0.25,
};

/** Repères d'affichage (« Mes besoins ») */
export const EXPLAIN = {
  disclaimer:
    'Ces repères sont calculés à partir de formules validées chez l’adulte en bonne santé. Ils ne remplacent pas l’avis d’un médecin ou d’un·e diététicien·ne, en particulier en cas de grossesse, d’allaitement, de maladie chronique, de traitement, de trouble du comportement alimentaire ou pour un enfant ou un adolescent.',
};
