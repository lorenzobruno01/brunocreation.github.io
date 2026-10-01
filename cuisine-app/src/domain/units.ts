import type { Ingredient, RecipeUnit, StandardUnit } from './types';

/** Volume en ml des mesures ménagères */
const SPOON_ML: Partial<Record<RecipeUnit, number>> = {
  cas: 15,
  cac: 5,
  pincee: 0.5,
  ml: 1,
  cl: 10,
  l: 1000,
  filet: 5,
};

/** Poids par défaut (g) des unités « naturelles » si l'ingrédient n'a pas de poids pièce */
const NATURAL_G: Partial<Record<RecipeUnit, number>> = {
  tranche: 35,
  gousse: 5,
  brin: 2,
  feuille: 1,
  botte: 40,
};

export const UNIT_LABELS: Record<RecipeUnit, { one: string; many: string }> = {
  g: { one: 'g', many: 'g' },
  kg: { one: 'kg', many: 'kg' },
  ml: { one: 'ml', many: 'ml' },
  cl: { one: 'cl', many: 'cl' },
  l: { one: 'L', many: 'L' },
  piece: { one: '', many: '' },
  cas: { one: 'c. à soupe', many: 'c. à soupe' },
  cac: { one: 'c. à café', many: 'c. à café' },
  pincee: { one: 'pincée', many: 'pincées' },
  tranche: { one: 'tranche', many: 'tranches' },
  gousse: { one: 'gousse', many: 'gousses' },
  brin: { one: 'brin', many: 'brins' },
  feuille: { one: 'feuille', many: 'feuilles' },
  botte: { one: 'botte', many: 'bottes' },
  filet: { one: 'filet', many: 'filets' },
  'au-gout': { one: '', many: '' },
};

export const RECIPE_UNITS = Object.keys(UNIT_LABELS) as RecipeUnit[];

/** Convertit une quantité de recette en grammes (null si impossible) */
export function toGrams(qty: number, unit: RecipeUnit, ing: Ingredient): number | null {
  const density = ing.density ?? 1;
  switch (unit) {
    case 'g':
      return qty;
    case 'kg':
      return qty * 1000;
    case 'au-gout':
      return 0;
    case 'piece':
      return ing.pieceWeight ? qty * ing.pieceWeight : null;
    case 'tranche':
    case 'gousse':
    case 'brin':
    case 'feuille':
    case 'botte':
      if (unit === 'gousse' && ing.pieceWeight) return qty * ing.pieceWeight;
      if (unit === 'tranche' && ing.pieceWeight && ing.pieceWeight < 100) return qty * ing.pieceWeight;
      return qty * (NATURAL_G[unit] ?? 0);
    default: {
      const ml = SPOON_ML[unit];
      return ml != null ? qty * ml * density : null;
    }
  }
}

/** Convertit vers l'unité standard de l'ingrédient (pour consolider les courses) */
export function toStandard(qty: number, unit: RecipeUnit, ing: Ingredient): { qty: number; unit: StandardUnit } | null {
  if (unit === 'au-gout') return { qty: 0, unit: ing.unit };
  if (ing.unit === 'piece') {
    if (unit === 'piece') return { qty, unit: 'piece' };
    const g = toGrams(qty, unit, ing);
    if (g == null || !ing.pieceWeight) return null;
    return { qty: g / ing.pieceWeight, unit: 'piece' };
  }
  if (ing.unit === 'ml') {
    const ml = SPOON_ML[unit];
    if (ml != null) return { qty: qty * ml, unit: 'ml' };
    const g = toGrams(qty, unit, ing);
    return g == null ? null : { qty: g / (ing.density ?? 1), unit: 'ml' };
  }
  const g = toGrams(qty, unit, ing);
  return g == null ? null : { qty: g, unit: 'g' };
}

// ── Formatage ─────────────────────────────────────────────

const FRACTIONS: Array<[number, string]> = [
  [0.25, '¼'],
  [0.33, '⅓'],
  [0.5, '½'],
  [0.66, '⅔'],
  [0.75, '¾'],
];

export function formatNumber(n: number): string {
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n);
  const frac = n - whole;
  for (const [v, s] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.06) return whole ? `${whole} ${s}` : s;
  }
  if (frac < 0.06) return String(whole || (n > 0 ? '¼' : 0));
  if (frac > 0.94) return String(whole + 1);
  return n.toFixed(1).replace('.', ',');
}

/** Décimales à la française pour kg / L : 1,5 kg ; 1,25 L */
function formatDecimal(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

/** Arrondi « humain » d'une quantité de pièces (œufs, citrons…) */
function roundPieces(q: number): number {
  if (q <= 0) return 0;
  if (q < 1) return Math.round(q * 4) / 4 || 0.25;
  if (q < 3) return Math.round(q * 2) / 2;
  return Math.round(q);
}

export function formatQty(qty: number, unit: RecipeUnit): string {
  if (unit === 'au-gout') return '';
  if (unit === 'g' && qty >= 1000) return `${formatDecimal(Math.round(qty / 50) / 20)} kg`;
  if (unit === 'ml' && qty >= 1000) return `${formatDecimal(Math.round(qty / 50) / 20)} L`;
  if (unit === 'piece') return formatNumber(roundPieces(qty));
  const label = qty > 1 ? UNIT_LABELS[unit].many : UNIT_LABELS[unit].one;
  return `${formatNumber(qty)} ${label}`.trim();
}

export function formatStandard(qty: number, unit: StandardUnit | 'autre'): string {
  if (unit === 'piece') return formatNumber(roundPieces(qty));
  if (unit === 'g') {
    if (qty >= 1000) return `${formatDecimal(Math.round(qty / 50) / 20)} kg`;
    if (qty < 10) return `${formatNumber(qty)} g`;
    return `${Math.round(qty / 5) * 5 || Math.round(qty)} g`;
  }
  if (unit === 'ml') {
    if (qty >= 1000) return `${formatDecimal(Math.round(qty / 50) / 20)} L`;
    if (qty < 10) return `${formatNumber(qty)} ml`;
    return `${Math.round(qty / 5) * 5 || Math.round(qty)} ml`;
  }
  return formatNumber(qty);
}

/** Libellé d'une ligne d'ingrédient : « 300 g de bœuf », « 2 courgettes » */
export function ingredientLine(qty: number, unit: RecipeUnit, ing: Ingredient): string {
  const name = unit === 'piece' && qty > 1 && ing.plural ? ing.plural : ing.name;
  if (unit === 'au-gout') return `${capitalize(name)} (au goût)`;
  const q = formatQty(qty, unit);
  if (unit === 'piece') return `${q} ${name}`;
  return `${q} ${de(name)}`;
}

export function de(name: string): string {
  return /^[aeiouyéèêâîôûœhAEIOUYÉ]/i.test(name) ? `d'${name}` : `de ${name}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
