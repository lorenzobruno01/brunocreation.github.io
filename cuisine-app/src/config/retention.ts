// ─────────────────────────────────────────────────────────────
// PERTES À LA CUISSON — part des vitamines et minéraux conservée.
// Les tables d'ingrédients donnent des valeurs pour l'aliment CRU ;
// la cuisson en détruit une partie (chaleur, eau de cuisson, oxydation).
//
// Source : USDA Table of Nutrient Retention Factors, Release 6 (2007),
// moyennes arrondies par mode de cuisson pour les légumes, viandes et
// poissons. Pour les plats mijotés ou braisés, le jus est consommé :
// les minéraux et une partie des vitamines hydrosolubles y restent.
// ─────────────────────────────────────────────────────────────
import type { IngredientCategory, Technique } from '../domain/types';

type Group = 'vC' | 'vB1' | 'vB9' | 'vB6' | 'vB' | 'vB12' | 'vA' | 'vE' | 'chol' | 'min' | 'kmg';

/** Nutriment → groupe de sensibilité */
export const SENSITIVITY: Record<string, Group> = {
  vC: 'vC',
  vB1: 'vB1',
  vB9: 'vB9',
  vB6: 'vB6',
  vB2: 'vB',
  vB3: 'vB',
  vB5: 'vB',
  vB12: 'vB12',
  vA: 'vA',
  vE: 'vE',
  chol: 'chol',
  k: 'kmg',
  mg: 'kmg',
  ca: 'min',
  fe: 'min',
  zn: 'min',
  cu: 'min',
  mn: 'min',
  p: 'min',
  se: 'min',
  i: 'min',
};

const RAW: Record<Group, number> = { vC: 1, vB1: 1, vB9: 1, vB6: 1, vB: 1, vB12: 1, vA: 1, vE: 1, chol: 1, min: 1, kmg: 1 };

export const RETENTION: Record<Technique, Record<Group, number>> = {
  cru: RAW,
  'sans-cuisson': RAW,
  mixe: RAW,
  vapeur: { vC: 0.85, vB1: 0.9, vB9: 0.85, vB6: 0.9, vB: 0.95, vB12: 0.9, vA: 0.95, vE: 0.95, chol: 0.95, min: 0.98, kmg: 0.95 },
  wok: { vC: 0.8, vB1: 0.85, vB9: 0.8, vB6: 0.85, vB: 0.9, vB12: 0.9, vA: 0.9, vE: 0.9, chol: 0.9, min: 0.97, kmg: 0.97 },
  poele: { vC: 0.75, vB1: 0.8, vB9: 0.8, vB6: 0.8, vB: 0.9, vB12: 0.85, vA: 0.9, vE: 0.9, chol: 0.9, min: 0.97, kmg: 0.97 },
  'friture-legere': { vC: 0.75, vB1: 0.8, vB9: 0.8, vB6: 0.8, vB: 0.9, vB12: 0.85, vA: 0.85, vE: 0.85, chol: 0.9, min: 0.97, kmg: 0.97 },
  grill: { vC: 0.75, vB1: 0.75, vB9: 0.8, vB6: 0.8, vB: 0.9, vB12: 0.85, vA: 0.9, vE: 0.9, chol: 0.9, min: 0.95, kmg: 0.95 },
  four: { vC: 0.7, vB1: 0.75, vB9: 0.75, vB6: 0.8, vB: 0.9, vB12: 0.85, vA: 0.9, vE: 0.9, chol: 0.9, min: 0.95, kmg: 0.95 },
  roti: { vC: 0.7, vB1: 0.75, vB9: 0.75, vB6: 0.8, vB: 0.9, vB12: 0.85, vA: 0.9, vE: 0.9, chol: 0.9, min: 0.95, kmg: 0.95 },
  mijote: { vC: 0.5, vB1: 0.7, vB9: 0.6, vB6: 0.7, vB: 0.85, vB12: 0.85, vA: 0.85, vE: 0.9, chol: 0.85, min: 0.95, kmg: 0.95 },
  braise: { vC: 0.5, vB1: 0.65, vB9: 0.6, vB6: 0.7, vB: 0.85, vB12: 0.85, vA: 0.85, vE: 0.9, chol: 0.85, min: 0.95, kmg: 0.95 },
  poche: { vC: 0.6, vB1: 0.75, vB9: 0.65, vB6: 0.75, vB: 0.85, vB12: 0.85, vA: 0.9, vE: 0.95, chol: 0.9, min: 0.92, kmg: 0.85 },
  bouilli: { vC: 0.5, vB1: 0.65, vB9: 0.55, vB6: 0.65, vB: 0.8, vB12: 0.8, vA: 0.9, vE: 0.95, chol: 0.85, min: 0.9, kmg: 0.8 },
};

/**
 * Catégories en général ajoutées crues ou en fin de cuisson (fruits,
 * herbes, fromages, huiles de finition…) : pas de perte appliquée.
 */
export const NOT_COOKED: IngredientCategory[] = ['fruit', 'herbe', 'laitier', 'matiere-grasse', 'condiment', 'boisson', 'epice'];

/** Part conservée d'un nutriment pour un ingrédient cuit avec cette technique */
export function retention(technique: Technique | undefined, category: IngredientCategory, nutrient: string): number {
  if (!technique || NOT_COOKED.includes(category)) return 1;
  const g = SENSITIVITY[nutrient];
  return g ? (RETENTION[technique]?.[g] ?? 1) : 1;
}
