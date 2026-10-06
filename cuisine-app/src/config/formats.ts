// ─────────────────────────────────────────────────────────────
// FORMATS DE VENTE ET PRIX MOYENS — pour une liste de courses réaliste.
// On n'achète pas 137 g de beurre ni 7 œufs : on arrondit au format
// vendu (plaquette, boîte de 6, botte, bouteille…) et on indique ce
// qu'il en restera. Chez le boucher, le poissonnier ou le fromager,
// on achète « à la coupe » au plus juste (arrondi à 50 g).
//
// Prix : moyennes constatées en France (2025), qualité recommandée par
// l'appli (fermier, Label Rouge, bio, pâturage), en € par kg, par litre
// ou par pièce. Ce sont des ordres de grandeur pour estimer un budget,
// pas des prix exacts : ils varient selon la région et le commerce.
// ─────────────────────────────────────────────────────────────
import type { Ingredient, IngredientCategory, StandardUnit } from '../domain/types';

export interface Format {
  /** taille d'un format, dans l'unité standard de l'ingrédient */
  size: number;
  /** « plaquette de 250 g », « boîte de 6 »… */
  name: string;
  plural?: string;
}

/** Formats par ingrédient (identifiant ou début d'identifiant) */
const BY_ID: Array<[RegExp, Format[]]> = [
  [/^oeuf$/, [{ size: 12, name: 'boîte de 12' }, { size: 6, name: 'boîte de 6' }]],
  [/^beurre$/, [{ size: 250, name: 'plaquette de 250 g' }, { size: 125, name: 'plaquette de 125 g' }]],
  [/^beurre-clarifie/, [{ size: 250, name: 'pot de 250 g' }]],
  [/^lait$/, [{ size: 1000, name: 'bouteille de 1 L' }]],
  [/^(creme-fraiche|creme-liquide)/, [{ size: 500, name: 'pot de 50 cl' }, { size: 200, name: 'pot de 20 cl' }]],
  [/^(yaourt|skyr|fromage-blanc|kefir)/, [{ size: 500, name: 'pot de 500 g' }]],
  [/conserve|concassee|^lait-coco|^pois-chiches-cuits/, [{ size: 400, name: 'boîte' }]],
  [/^(riz|pates|semoule|boulgour|quinoa|lentilles|pois-chiches|haricots|sarrasin|flocons|farine|polenta|orge)/, [{ size: 1000, name: 'paquet de 1 kg' }, { size: 500, name: 'paquet de 500 g' }]],
  [/^(huile|vinaigre)/, [{ size: 750, name: 'bouteille de 75 cl' }]],
  [/^(miel|confiture|sirop)/, [{ size: 250, name: 'pot' }]],
];

/** Commerces où l'on achète au poids, au plus juste */
const BY_WEIGHT: IngredientCategory[] = ['viande', 'volaille', 'abats', 'poisson', 'fruits-de-mer'];

export interface Purchase {
  /** « 2 plaquettes de 250 g », « 650 g à la coupe », « 3 pièces » */
  text: string;
  /** quantité achetée (unité standard) */
  bought: number;
  /** ce qu'il en restera */
  leftover: number;
  unit: StandardUnit;
}

const fmtG = (g: number) => (g >= 1000 ? `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg` : `${Math.round(g)} g`);

/** Combinaison de formats qui couvre le besoin avec le moins de reste */
function bestCombo(qty: number, formats: Format[]): { counts: number[]; total: number } {
  const sorted = [...formats].sort((a, b) => b.size - a.size);
  let best = { counts: sorted.map(() => 0), total: Infinity };
  const big = sorted[0].size;
  const maxBig = Math.ceil(qty / big) + 1;
  for (let n0 = 0; n0 <= maxBig; n0++) {
    const rest = qty - n0 * big;
    const counts = [n0, ...sorted.slice(1).map(() => 0)];
    if (rest > 0 && sorted.length > 1) counts[1] = Math.ceil(rest / sorted[1].size);
    else if (rest > 0) continue;
    const total = counts.reduce((s, c, i) => s + c * sorted[i].size, 0);
    if (total >= qty && (total < best.total || (total === best.total && counts.reduce((a, b) => a + b, 0) < best.counts.reduce((a, b) => a + b, 0)))) best = { counts, total };
  }
  return best;
}

/** Ce qu'on achète réellement pour une quantité donnée */
export function purchaseFor(ing: Ingredient, qty: number): Purchase {
  const unit = ing.unit;
  if (qty <= 0) return { text: '', bought: 0, leftover: 0, unit };
  // boucher, volailler, poissonnier : à la coupe, arrondi à 50 g (pièces entières : à la pièce)
  if (BY_WEIGHT.includes(ing.category) && unit === 'g') {
    const bought = Math.ceil(qty / 50) * 50;
    return { text: `${fmtG(bought)} à la coupe`, bought, leftover: bought - qty, unit };
  }
  if (ing.category === 'herbe') {
    const n = Math.max(1, Math.ceil(qty / (ing.packageSize ?? 40)));
    return { text: `${n} botte${n > 1 ? 's' : ''}`, bought: n * (ing.packageSize ?? 40), leftover: n * (ing.packageSize ?? 40) - qty, unit };
  }
  const byId = BY_ID.find(([re]) => re.test(ing.id))?.[1];
  // fruits et légumes : à la pièce si on connaît le poids d'une pièce, sinon arrondi à 100 g
  if (!byId && unit === 'g' && ing.pieceWeight && ing.pieceWeight >= 40 && ['legume', 'fruit', 'feculent'].includes(ing.category)) {
    const n = Math.max(1, Math.ceil(qty / ing.pieceWeight - 0.15));
    return { text: `${n} ${n > 1 ? (ing.plural ?? ing.name + 's') : ing.name}`, bought: n * ing.pieceWeight, leftover: Math.max(0, n * ing.pieceWeight - qty), unit };
  }
  const formats = byId ?? BY_ID.find(([re]) => re.test(ing.id))?.[1] ?? (ing.packageSize && !ing.staple ? [{ size: ing.packageSize, name: unit === 'piece' ? `lot de ${ing.packageSize}` : unit === 'ml' ? `bouteille de ${ing.packageSize >= 1000 ? `${ing.packageSize / 1000} L` : `${ing.packageSize / 10} cl`}` : `paquet de ${fmtG(ing.packageSize)}` }] : null);
  if (formats) {
    const sorted = [...formats].sort((a, b) => b.size - a.size);
    const { counts, total } = bestCombo(qty, sorted);
    const text = counts
      .map((c, i) => (c ? `${c} ${c > 1 ? sorted[i].name.replace(/^(\S+)/, (w) => (w.endsWith('s') || w.endsWith('x') ? w : `${w}s`)) : sorted[i].name}` : ''))
      .filter(Boolean)
      .join(' + ');
    return { text, bought: total, leftover: total - qty, unit };
  }
  if (unit === 'g') {
    const bought = Math.ceil(qty / 100) * 100;
    return { text: fmtG(bought), bought, leftover: bought - qty, unit };
  }
  if (unit === 'piece') {
    const n = Math.ceil(qty - 0.05);
    return { text: `${n} pièce${n > 1 ? 's' : ''}`, bought: n, leftover: n - qty, unit };
  }
  const ml = Math.ceil(qty / 50) * 50;
  return { text: ml >= 1000 ? `${ml / 1000} L` : `${ml / 10} cl`, bought: ml, leftover: ml - qty, unit };
}

// ── Prix ──────────────────────────────────────────────────
/** € par kg (ou par litre, ou par pièce pour les œufs), qualité recommandée */
const PRICE_CAT: Record<IngredientCategory, number> = {
  viande: 18,
  volaille: 11,
  abats: 12,
  poisson: 24,
  'fruits-de-mer': 18,
  oeufs: 0.45,
  laitier: 14,
  feculent: 3.5,
  legume: 3.8,
  legumineuse: 4.5,
  fruit: 4.5,
  herbe: 25,
  epice: 40,
  'matiere-grasse': 14,
  condiment: 9,
  epicerie: 14,
  boisson: 3,
};
const PRICE_ID: Array<[RegExp, number]> = [
  [/^boeuf-(hache|paleron|joue|jarret|plat-de-cote|queue)/, 15],
  [/^boeuf-(steak|entrecote|rosbif|bavette)/, 28],
  [/^(veau|agneau)/, 24],
  [/^(porc|echine)/, 12],
  [/^poulet-(cuisse|pilon|entier)|^poulet$/, 10],
  [/^(foie|coeur|rognon|gesier)/, 10],
  [/^(sardine|maquereau|hareng)$/, 11],
  [/^(sardine|maquereau)-conserve/, 22],
  [/^(saumon|bar|sole|lotte|cabillaud)/, 28],
  [/^moule/, 6],
  [/^lait$/, 1.6],
  [/^(yaourt|fromage-blanc|skyr|kefir)/, 4.5],
  [/^beurre/, 13],
  [/^(creme)/, 8],
  [/^(comte|parmesan|beaufort|gruyere|pecorino)/, 26],
  [/^(pomme-de-terre|carotte|oignon|chou|courge|poireau|navet|betterave)/, 2.2],
  [/^(riz|pates|semoule|flocons|farine|polenta)/, 3],
  [/^(amande|noix|noisette|pistache|cajou|macadamia|pignons)/, 25],
  [/^huile/, 12],
];

export function priceOf(ing: Ingredient): number {
  return PRICE_ID.find(([re]) => re.test(ing.id))?.[1] ?? PRICE_CAT[ing.category] ?? 8;
}

/** Coût estimé d'une quantité (unité standard de l'ingrédient) */
export function costOf(ing: Ingredient, qty: number): number {
  const p = priceOf(ing);
  if (ing.unit === 'piece') return ing.category === 'oeufs' ? p * qty : ((p * qty * (ing.pieceWeight ?? 100)) / 1000);
  return (p * qty) / 1000;
}
