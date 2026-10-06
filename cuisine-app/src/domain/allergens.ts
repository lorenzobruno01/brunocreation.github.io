// ─────────────────────────────────────────────────────────────
// Allergies, intolérances, aliments non aimés → ingrédients exclus.
// Les 14 allergènes à déclaration obligatoire (règlement UE 1169/2011)
// sont regroupés en familles reconnues à partir des identifiants et
// catégories d'ingrédients de la base.
// ─────────────────────────────────────────────────────────────
import type { Ingredient } from './types';
import type { NutritionProfile } from './micronutrients';

type Rule = (i: Ingredient) => boolean;
const ids = (re: RegExp): Rule => (i) => re.test(i.id);

export const ALLERGENS: Record<string, { label: string; emoji: string; match: Rule }> = {
  gluten: {
    label: 'Gluten (blé, seigle, orge, épeautre)',
    emoji: '🌾',
    match: ids(/^(pain(?!-de-mie-sans)|pates|gnocchi|udon|semoule|boulgour|crozets|orge|farine$|farine-seigle|farine-ble|panure|levain|couscous|epeautre|ble|biere|sauce-soja|seitan|chapelure|brioche|biscuit|crepe)/),
  },
  lait: { label: 'Lait (protéines de lait)', emoji: '🥛', match: (i) => i.category === 'laitier' },
  oeufs: { label: 'Œufs', emoji: '🥚', match: (i) => i.category === 'oeufs' && i.id !== 'oeufs-poisson' },
  poisson: { label: 'Poisson', emoji: '🐟', match: (i) => i.category === 'poisson' || /^(fumet-poisson|sauce-poisson|oeufs-poisson|anchois)/.test(i.id) },
  crustaces: { label: 'Crustacés', emoji: '🦐', match: ids(/^(crevette|crabe|langoustine|homard|ecrevisse|tourteau)/) },
  mollusques: { label: 'Mollusques', emoji: '🦪', match: ids(/^(moule|huitre|palourde|saint-jacques|calamar|poulpe|seiche|escargot|coque|bulot)/) },
  'fruits-a-coque': {
    label: 'Fruits à coque (noix, amande, noisette…)',
    emoji: '🌰',
    match: ids(/^(noix$|noix-cajou|noix-pecan|noix-bresil|huile-noix|noisette|amande|pistache|macadamia|praline|puree-amande|pignons|lait-amande|creme-marrons-x)/),
  },
  arachide: { label: 'Arachide', emoji: '🥜', match: ids(/arachide|cacahuete|beurre-cacahuete/) },
  soja: { label: 'Soja', emoji: '🫘', match: ids(/soja|tofu|tempeh|miso|edamame/) },
  sesame: { label: 'Sésame', emoji: '⚪', match: ids(/sesame|tahini|gomasio/) },
  celeri: { label: 'Céleri', emoji: '🥬', match: ids(/^celeri/) },
  moutarde: { label: 'Moutarde', emoji: '🟡', match: ids(/moutarde/) },
};

/** Fromages affinés, beurre clarifié, kéfir : quasi sans lactose */
const LOW_LACTOSE = /^(beurre-clarifie|beurre|comte|parmesan|pecorino|manchego|cheddar|reblochon|gruyere|beaufort|emmental|kefir|halloumi)$/;

export const INTOLERANCES: Record<string, { label: string; emoji: string; hint: string; match: Rule }> = {
  lactose: { label: 'Lactose', emoji: '🥛', hint: 'fromages affinés, beurre et kéfir restent possibles', match: (i) => i.category === 'laitier' && !LOW_LACTOSE.test(i.id) },
  gluten: { label: 'Gluten (sensibilité)', emoji: '🌾', hint: 'même liste que l’allergie', match: ALLERGENS.gluten.match },
  fodmap: { label: 'FODMAP (ventre sensible)', emoji: '🫃', hint: 'ail, oignon, légumineuses, certains fruits…', match: (i) => !!i.flags?.includes('fodmap') },
  oxalates: { label: 'Oxalates', emoji: '🥬', hint: 'épinards, blettes, amandes, cacao…', match: (i) => !!i.flags?.includes('oxalates') },
};

export const SPICE_LEVELS = ['Pas du tout', 'Doux', 'Relevé', 'Très piquant'];
export const TEXTURES: Record<string, string> = {
  croquant: '🥕 Croquant',
  fondant: '🍲 Fondant, mijoté',
  cremeux: '🥣 Crémeux, velouté',
  grille: '🔥 Grillé, rôti',
  cru: '🥗 Cru, frais',
};

/** Raison pour laquelle un ingrédient ne convient pas à cette personne (null s'il convient) */
export function ingredientConflict(p: Pick<NutritionProfile, 'allergies' | 'intolerances' | 'dislikes'>, ing: Ingredient): string | null {
  for (const a of p.allergies ?? []) {
    if (a === ing.id) return 'allergie';
    if (ALLERGENS[a]?.match(ing)) return `allergie : ${ALLERGENS[a].label.toLowerCase()}`;
  }
  for (const t of p.intolerances ?? []) {
    if (t === ing.id) return 'mal toléré';
    if (INTOLERANCES[t]?.match(ing)) return `intolérance : ${INTOLERANCES[t].label.toLowerCase()}`;
  }
  if (p.dislikes?.includes(ing.id)) return 'n’aime pas';
  return null;
}

/** Ingrédients exclus pour cette personne : id → raison */
export function excludedIngredients(p: Pick<NutritionProfile, 'allergies' | 'intolerances' | 'dislikes'>, all: Ingredient[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const i of all) {
    const why = ingredientConflict(p, i);
    if (why) out.set(i.id, why);
  }
  return out;
}
