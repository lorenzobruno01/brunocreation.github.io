// ─────────────────────────────────────────────────────────────
// Allergies, intolérances, aliments non aimés → ingrédients exclus.
// Les 14 allergènes à déclaration obligatoire (règlement UE 1169/2011)
// sont regroupés en familles reconnues à partir des identifiants et
// catégories d'ingrédients de la base.
// ─────────────────────────────────────────────────────────────
import type { Ingredient, IndexedRecipe, Recipe } from './types';
import type { IngredientLookup } from './indexing';
import type { NutritionProfile } from './micronutrients';

type Rule = (i: Ingredient) => boolean;
const ids = (re: RegExp): Rule => (i) => re.test(i.id);

export const ALLERGENS: Record<string, { label: string; emoji: string; match: Rule }> = {
  gluten: {
    label: 'Gluten (blé, seigle, orge, épeautre)',
    emoji: '🌾',
    match: ids(/^(pain(?!-de-mie-sans)|pates|gnocchi|udon|semoule|boulgour|crozets|orge|farine$|farine-seigle|farine-ble|panure|levain|couscous|epeautre|ble|biere|sauce-soja|seitan|chapelure|brioche|biscuit|crepe)/),
  },
  lait: { label: 'Lait (protéines de lait)', emoji: '🥛', match: (i) => i.category === 'laitier' || i.id === 'pesto' },
  oeufs: { label: 'Œufs', emoji: '🥚', match: (i) => (i.category === 'oeufs' && i.id !== 'oeufs-poisson') || i.id === 'mayonnaise' },
  poisson: { label: 'Poisson', emoji: '🐟', match: (i) => i.category === 'poisson' || /^(fumet-poisson|sauce-poisson|oeufs-poisson|anchois|foie-morue|huile-foie-morue|dashi|bonite|katsuobushi|tarama|poutargue|surimi)/.test(i.id) },
  crustaces: { label: 'Crustacés', emoji: '🦐', match: ids(/^(crevette|crabe|langoustine|homard|ecrevisse|tourteau)/) },
  mollusques: { label: 'Mollusques', emoji: '🦪', match: ids(/^(moule|huitre|palourde|saint-jacques|calamar|poulpe|seiche|escargot|coque|bulot)/) },
  'fruits-a-coque': {
    label: 'Fruits à coque (noix, amande, noisette…)',
    emoji: '🌰',
    match: ids(/^(noix$|noix-cajou|noix-pecan|noix-bresil|huile-noix|noisette|amande|pistache|macadamia|praline|puree-amande|pignons|pesto|lait-amande|creme-marrons-x)/),
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

export interface RecipeConflict {
  profile: NutritionProfile;
  ingredient?: Ingredient;
  reason: string;
}

/** Première raison pour laquelle une recette ne convient pas à l'une des personnes (null si elle convient à tous) */
export function recipeConflict(r: Pick<Recipe, 'ingredients' | 'flavors'>, profiles: NutritionProfile[], lookup: IngredientLookup): RecipeConflict | null {
  for (const p of profiles) {
    if (p.spice === 0 && r.flavors?.includes('piquant')) return { profile: p, reason: 'plat piquant' };
    if (!p.allergies?.length && !p.intolerances?.length && !p.dislikes?.length) continue;
    for (const ri of r.ingredients) {
      if (ri.optional) continue;
      const ing = lookup(ri.id);
      if (!ing) continue;
      const why = ingredientConflict(p, ing);
      if (why) return { profile: p, ingredient: ing, reason: why };
    }
  }
  return null;
}

const TEXTURE_OF = (r: IndexedRecipe): string[] => {
  const t: string[] = [];
  if (r.flavors.includes('cremeux') || r.category === 'soupe') t.push('cremeux');
  if (r.flavors.includes('grille') || ['grill', 'four', 'roti'].includes(r.technique)) t.push('grille');
  if (['mijote', 'braise'].includes(r.technique)) t.push('fondant');
  if (['cru', 'sans-cuisson'].includes(r.technique)) t.push('cru');
  if (r.category === 'salade-composee') t.push('croquant');
  return t;
};

/** Petit bonus quand un plat contient ce que la personne aime (0 à ~10) */
export function preferenceBonus(r: IndexedRecipe, p: NutritionProfile): number {
  let b = 0;
  if (p.likes?.length) b += r.ingredients.filter((i) => p.likes!.includes(i.id)).length * 4;
  if (p.textures?.length) b += TEXTURE_OF(r).filter((t) => p.textures!.includes(t)).length * 2;
  if ((p.spice ?? 1) >= 2 && r.flavors.includes('piquant')) b += 2;
  if (p.spice === 1 && r.flavors.includes('piquant')) b -= 2;
  return Math.min(10, b);
}
