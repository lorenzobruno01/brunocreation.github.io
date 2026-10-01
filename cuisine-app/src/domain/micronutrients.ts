// ─────────────────────────────────────────────────────────────
// Nutrition détaillée : vitamines, minéraux, électrolytes,
// acides aminés essentiels, oméga-3, fibres — par portion, et
// en % des besoins journaliers d'un profil (EFSA / ANSES).
// ─────────────────────────────────────────────────────────────
import type { Ingredient, Recipe } from './types';
import type { IngredientLookup } from './indexing';
import { gramsEaten } from './indexing';

export type MicroKey =
  | 'fib' | 'vA' | 'vB1' | 'vB2' | 'vB3' | 'vB5' | 'vB6' | 'vB9' | 'vB12' | 'vC' | 'vD' | 'vE' | 'vK' | 'chol'
  | 'ca' | 'fe' | 'mg' | 'p' | 'k' | 'na' | 'zn' | 'cu' | 'mn' | 'se' | 'i' | 'o3' | 'epa';

export type MicroValues = Partial<Record<MicroKey, number>>;

// Données par ingrédient (pour 100 g), un fichier par lot
const files = import.meta.glob<{ default: Record<string, MicroValues> }>('../data/micronutrients/*.json', { eager: true });
export const MICROS: Record<string, MicroValues> = Object.assign({}, ...Object.values(files).map((m) => m.default));

export interface NutrientDef {
  key: MicroKey | AminoKey | 'cl';
  label: string;
  unit: string;
  group: 'vitamines' | 'mineraux' | 'electrolytes' | 'acides-amines' | 'lipides' | 'autres';
  /** rôle en quelques mots */
  role: string;
  /** apport de référence journalier : [homme, femme] (ou par kg pour les acides aminés) */
  ref: [number, number];
  /** apport à ne pas dépasser (sodium) — l'objectif est de rester en dessous */
  limit?: boolean;
}

export type AminoKey = 'his' | 'ile' | 'leu' | 'lys' | 'saa' | 'aaa' | 'thr' | 'trp' | 'val';

// Références : EFSA (DRV 2017–2023) — PRI/AI adulte 18–60 ans
export const NUTRIENTS: NutrientDef[] = [
  { key: 'vA', label: 'Vitamine A', unit: 'µg', group: 'vitamines', role: 'vision, peau, immunité', ref: [750, 650] },
  { key: 'vB1', label: 'Vitamine B1 (thiamine)', unit: 'mg', group: 'vitamines', role: 'énergie, nerfs', ref: [1.2, 0.9] },
  { key: 'vB2', label: 'Vitamine B2 (riboflavine)', unit: 'mg', group: 'vitamines', role: 'énergie, fatigue', ref: [1.6, 1.6] },
  { key: 'vB3', label: 'Vitamine B3 (niacine)', unit: 'mg', group: 'vitamines', role: 'énergie, peau', ref: [16, 13] },
  { key: 'vB5', label: 'Vitamine B5', unit: 'mg', group: 'vitamines', role: 'métabolisme, hormones', ref: [5, 5] },
  { key: 'vB6', label: 'Vitamine B6', unit: 'mg', group: 'vitamines', role: 'protéines, système nerveux', ref: [1.7, 1.6] },
  { key: 'vB9', label: 'Vitamine B9 (folates)', unit: 'µg', group: 'vitamines', role: 'cellules, sang', ref: [330, 330] },
  { key: 'vB12', label: 'Vitamine B12', unit: 'µg', group: 'vitamines', role: 'sang, nerfs', ref: [4, 4] },
  { key: 'vC', label: 'Vitamine C', unit: 'mg', group: 'vitamines', role: 'immunité, collagène, fer', ref: [110, 95] },
  { key: 'vD', label: 'Vitamine D', unit: 'µg', group: 'vitamines', role: 'os, muscles, immunité', ref: [15, 15] },
  { key: 'vE', label: 'Vitamine E', unit: 'mg', group: 'vitamines', role: 'antioxydant', ref: [13, 11] },
  { key: 'vK', label: 'Vitamine K', unit: 'µg', group: 'vitamines', role: 'coagulation, os', ref: [70, 70] },
  { key: 'chol', label: 'Choline', unit: 'mg', group: 'vitamines', role: 'foie, cerveau', ref: [400, 400] },
  { key: 'ca', label: 'Calcium', unit: 'mg', group: 'mineraux', role: 'os, muscles', ref: [950, 950] },
  { key: 'fe', label: 'Fer', unit: 'mg', group: 'mineraux', role: 'oxygène, énergie', ref: [11, 16] },
  { key: 'zn', label: 'Zinc', unit: 'mg', group: 'mineraux', role: 'immunité, testostérone, peau', ref: [12.7, 9.3] },
  { key: 'se', label: 'Sélénium', unit: 'µg', group: 'mineraux', role: 'thyroïde, antioxydant', ref: [70, 70] },
  { key: 'i', label: 'Iode', unit: 'µg', group: 'mineraux', role: 'thyroïde', ref: [150, 150] },
  { key: 'cu', label: 'Cuivre', unit: 'mg', group: 'mineraux', role: 'sang, collagène', ref: [1.6, 1.3] },
  { key: 'mn', label: 'Manganèse', unit: 'mg', group: 'mineraux', role: 'os, métabolisme', ref: [3, 3] },
  { key: 'p', label: 'Phosphore', unit: 'mg', group: 'mineraux', role: 'os, énergie', ref: [550, 550] },
  { key: 'na', label: 'Sodium', unit: 'mg', group: 'electrolytes', role: 'hydratation (hors sel ajouté « au goût »)', ref: [2000, 2000], limit: true },
  { key: 'k', label: 'Potassium', unit: 'mg', group: 'electrolytes', role: 'cœur, muscles, tension', ref: [3500, 3500] },
  { key: 'mg', label: 'Magnésium', unit: 'mg', group: 'electrolytes', role: 'muscles, sommeil, stress', ref: [350, 300] },
  { key: 'cl', label: 'Chlorure', unit: 'mg', group: 'electrolytes', role: 'hydratation, digestion', ref: [3100, 3100] },
  { key: 'o3', label: 'Oméga-3 (total)', unit: 'g', group: 'lipides', role: 'anti-inflammatoire, cœur', ref: [2, 1.6] },
  { key: 'epa', label: 'EPA + DHA', unit: 'g', group: 'lipides', role: 'cerveau, inflammation', ref: [0.25, 0.25] },
  { key: 'fib', label: 'Fibres', unit: 'g', group: 'autres', role: 'digestion, microbiote', ref: [30, 30] },
  // Acides aminés essentiels : besoin OMS 2007 en mg/kg/jour (× poids du profil)
  { key: 'his', label: 'Histidine', unit: 'mg', group: 'acides-amines', role: 'croissance, tissus', ref: [10, 10] },
  { key: 'ile', label: 'Isoleucine', unit: 'mg', group: 'acides-amines', role: 'muscle, énergie', ref: [20, 20] },
  { key: 'leu', label: 'Leucine', unit: 'mg', group: 'acides-amines', role: 'déclencheur de la synthèse musculaire', ref: [39, 39] },
  { key: 'lys', label: 'Lysine', unit: 'mg', group: 'acides-amines', role: 'collagène, immunité', ref: [30, 30] },
  { key: 'saa', label: 'Méthionine + cystéine', unit: 'mg', group: 'acides-amines', role: 'antioxydants, cheveux', ref: [15, 15] },
  { key: 'aaa', label: 'Phénylalanine + tyrosine', unit: 'mg', group: 'acides-amines', role: 'neurotransmetteurs', ref: [25, 25] },
  { key: 'thr', label: 'Thréonine', unit: 'mg', group: 'acides-amines', role: 'muqueuses, collagène', ref: [15, 15] },
  { key: 'trp', label: 'Tryptophane', unit: 'mg', group: 'acides-amines', role: 'sérotonine, sommeil', ref: [4, 4] },
  { key: 'val', label: 'Valine', unit: 'mg', group: 'acides-amines', role: 'muscle, récupération', ref: [26, 26] },
];

export const GROUP_LABELS: Record<NutrientDef['group'], string> = {
  vitamines: '💊 Vitamines',
  mineraux: '🪨 Minéraux',
  electrolytes: '⚡ Électrolytes',
  'acides-amines': '💪 Acides aminés essentiels',
  lipides: '🐟 Acides gras essentiels',
  autres: '🌾 Fibres',
};

// Profils d'acides aminés (mg par g de protéine) par famille d'aliments
type Profile = Record<AminoKey, number>;
const AA: Record<string, Profile> = {
  viande: { his: 35, ile: 45, leu: 80, lys: 85, saa: 38, aaa: 75, thr: 42, trp: 11, val: 50 },
  poisson: { his: 30, ile: 46, leu: 81, lys: 92, saa: 40, aaa: 73, thr: 44, trp: 11, val: 52 },
  oeuf: { his: 24, ile: 54, leu: 86, lys: 70, saa: 57, aaa: 93, thr: 47, trp: 16, val: 66 },
  laitier: { his: 27, ile: 50, leu: 95, lys: 78, saa: 33, aaa: 100, thr: 44, trp: 14, val: 64 },
  legumineuse: { his: 28, ile: 42, leu: 76, lys: 68, saa: 25, aaa: 85, thr: 38, trp: 11, val: 48 },
  cereale: { his: 23, ile: 37, leu: 75, lys: 32, saa: 40, aaa: 80, thr: 32, trp: 12, val: 50 },
  tubercule: { his: 22, ile: 40, leu: 62, lys: 60, saa: 30, aaa: 82, thr: 38, trp: 14, val: 55 },
  vegetal: { his: 20, ile: 40, leu: 60, lys: 50, saa: 25, aaa: 70, thr: 38, trp: 11, val: 50 },
  oleagineux: { his: 25, ile: 40, leu: 70, lys: 35, saa: 35, aaa: 85, thr: 35, trp: 14, val: 50 },
  gelatine: { his: 8, ile: 14, leu: 30, lys: 40, saa: 10, aaa: 25, thr: 19, trp: 0, val: 25 },
};

function aminoProfile(ing: Ingredient): Profile {
  if (['gelatine', 'os-boeuf', 'os-a-moelle', 'pied-veau', 'bouillon-boeuf', 'bouillon-volaille', 'carcasse-poulet'].includes(ing.id)) return AA.gelatine;
  switch (ing.category) {
    case 'viande':
    case 'volaille':
    case 'abats':
      return AA.viande;
    case 'poisson':
    case 'fruits-de-mer':
      return AA.poisson;
    case 'oeufs':
      return AA.oeuf;
    case 'laitier':
      return AA.laitier;
    case 'legumineuse':
      return AA.legumineuse;
    case 'feculent':
      return ['pomme-de-terre', 'pomme-de-terre-farineuse', 'patate-douce', 'manioc', 'plantain', 'chataigne'].includes(ing.id) ? AA.tubercule : AA.cereale;
    case 'epicerie':
      return ing.fat > 30 ? AA.oleagineux : AA.cereale;
    default:
      return AA.vegetal;
  }
}

export type DetailedNutrition = Record<string, number>;

/** Apports détaillés par portion */
export function computeDetailed(recipe: Recipe, lookup: IngredientLookup): DetailedNutrition {
  const out: DetailedNutrition = {};
  const add = (k: string, v: number) => (out[k] = (out[k] ?? 0) + v);
  for (const ri of recipe.ingredients) {
    const ing = lookup(ri.id);
    if (!ing) continue;
    const g = gramsEaten(ri, ing);
    if (!g) continue;
    const f = g / 100;
    const m = MICROS[ing.id];
    if (m) for (const [k, v] of Object.entries(m)) add(k, (v ?? 0) * f);
    const prot = ing.protein * f;
    if (prot > 0) {
      const prof = aminoProfile(ing);
      for (const [k, v] of Object.entries(prof)) add(k, v * prot);
    }
  }
  out.cl = (out.na ?? 0) * 1.5; // chlorure ≈ 1,5 × sodium (sel)
  const s = Math.max(1, recipe.servings);
  for (const k of Object.keys(out)) out[k] /= s;
  return out;
}

export interface NutritionProfile {
  id: string;
  name: string;
  sex: 'homme' | 'femme';
  weight: number; // kg
  kcal: number; // objectif journalier
  proteinPerKg: number; // g/kg/jour
}

export const DEFAULT_PROFILES: NutritionProfile[] = [
  { id: 'moi', name: 'Moi', sex: 'homme', weight: 70, kcal: 3000, proteinPerKg: 1.8 },
  { id: 'elle', name: 'Ma copine', sex: 'femme', weight: 58, kcal: 2200, proteinPerKg: 1.6 },
];

/** Besoin journalier d'un nutriment pour un profil */
export function dailyRef(def: NutrientDef, p: NutritionProfile): number {
  const base = p.sex === 'homme' ? def.ref[0] : def.ref[1];
  return def.group === 'acides-amines' ? base * p.weight : base;
}

export function formatAmount(v: number, unit: string): string {
  if (unit === 'g') return v >= 10 ? `${Math.round(v)} g` : `${v.toFixed(v < 1 ? 2 : 1).replace('.', ',')} g`;
  if (v >= 1000 && unit === 'mg') return `${(v / 1000).toFixed(1).replace('.', ',')} g`;
  if (v >= 100) return `${Math.round(v)} ${unit}`;
  if (v >= 10) return `${Math.round(v)} ${unit}`;
  return `${v.toFixed(1).replace('.', ',')} ${unit}`;
}
