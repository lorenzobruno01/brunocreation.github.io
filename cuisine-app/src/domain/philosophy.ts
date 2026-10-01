// ─────────────────────────────────────────────────────────────
// Philosophie alimentaire du foyer — règle fondamentale.
// Utilisée par : le validateur de la bibliothèque, le formulaire
// d'ajout, et le générateur IA (prompt + contrôle a posteriori).
// ─────────────────────────────────────────────────────────────
import type { IndexedRecipe, Recipe } from './types';
import { toGrams } from './units';
import type { IngredientLookup } from './indexing';
import { norm } from './text';

/** Termes interdits (ingrédients à éviter fortement) */
export const FORBIDDEN_TERMS = [
  'whey',
  'proteine en poudre',
  'poudre proteinee',
  'shake proteine',
  'beurre de cacahuete',
  'beurre d arachide',
  'puree d amande',
  'puree de noisette',
  'puree de cajou',
  'chia',
  'margarine',
  'sirop de glucose',
  'sirop de mais',
  'pate feuilletee industrielle',
  'nuggets',
  'cordon bleu industriel',
  'soda',
  'surimi',
  'edulcorant',
  'aspartame',
  'huile de palme',
];

export interface PhilosophyIssue {
  level: 'error' | 'warning';
  message: string;
}

/** Contrôle d'une recette par rapport au cahier des charges alimentaire */
export function checkPhilosophy(recipe: Recipe | IndexedRecipe, lookup: IngredientLookup): PhilosophyIssue[] {
  const issues: PhilosophyIssue[] = [];
  const text = norm([recipe.name, recipe.description, ...recipe.steps].join(' '));
  for (const term of FORBIDDEN_TERMS) {
    if (new RegExp(`\\b${term}\\b`).test(text)) issues.push({ level: 'error', message: `Contient un ingrédient à éviter : « ${term} »` });
  }

  const perServing = (id: string) => {
    const ri = recipe.ingredients.find((x) => x.id === id);
    const ing = lookup(id);
    if (!ri || !ing) return 0;
    return (toGrams(ri.qty, ri.unit, ing) ?? 0) / Math.max(1, recipe.servings);
  };

  // Oxalates : pas d'avalanche d'épinards, d'amandes ou de cacao
  if (perServing('epinard') > 120) issues.push({ level: 'warning', message: 'Beaucoup d’épinards (oxalates) — préférer blettes en petite quantité, laitue, courgette…' });
  if (perServing('amande') > 30) issues.push({ level: 'warning', message: 'Beaucoup d’amandes (oxalates).' });
  if (perServing('cacao') + perServing('chocolat-noir') > 25) issues.push({ level: 'warning', message: 'Beaucoup de cacao / chocolat (oxalates).' });
  if (perServing('betterave') > 200) issues.push({ level: 'warning', message: 'Beaucoup de betterave (oxalates).' });

  // Sucre ajouté
  const sugar = perServing('sucre') + perServing('sirop-erable') + perServing('miel') + perServing('confiture') * 0.6;
  if (recipe.category !== 'dessert' && sugar > 25) issues.push({ level: 'warning', message: `Sucre ajouté élevé (${Math.round(sugar)} g/portion) pour un plat non-dessert.` });
  if (recipe.category === 'dessert' && sugar > 45) issues.push({ level: 'warning', message: `Dessert très sucré (${Math.round(sugar)} g de sucres ajoutés/portion).` });

  // Farine blanche en excès
  if (perServing('farine') > 70) issues.push({ level: 'warning', message: 'Beaucoup de farine blanche.' });

  // Ingrédients inconnus
  for (const ri of recipe.ingredients) if (!lookup(ri.id)) issues.push({ level: 'error', message: `Ingrédient inconnu : ${ri.id}` });

  // Instructions vagues
  for (const s of recipe.steps) {
    const n = norm(s);
    if (/jusqu a ce que (ce soit|ca soit) pret/.test(n) || /cuire le temps necessaire/.test(n)) {
      issues.push({ level: 'warning', message: `Étape trop vague : « ${s.slice(0, 60)}… »` });
    }
  }
  return issues;
}

/** Texte de la philosophie, injecté dans les prompts IA (§44) */
export const PHILOSOPHY_PROMPT = `
PHILOSOPHIE ALIMENTAIRE DU FOYER (règle fondamentale, non négociable) :
- Inspirations : alimentation ancestrale, Weston A. Price, Deep Nutrition, Primal Blueprint, approche anti-inflammatoire. Pragmatique, PAS dogmatique : ni paleo strict, ni keto, ni carnivore, ni low-carb.
- Boussole : densité nutritionnelle + digestibilité + qualité des aliments + variété + apport énergétique suffisant + plaisir + simplicité.
- Aliments entiers et peu transformés. Produits de saison, locaux, bio quand c'est raisonnable — jamais de contrainte irréaliste ou hors de prix.
- Objectif : prise de poids et de masse musculaire progressive. Recettes nourrissantes, généreuses, riches en protéines (plats principaux ≥ 30 g de protéines/portion idéalement), avec suffisamment de glucides ET de lipides. Les calories élevées ne sont PAS un problème.
- Protéines animales variées : œufs, bœuf, veau, agneau, porc, poulet, dinde, canard, poissons (dont poissons gras), fruits de mer, crustacés, abats (foie régulièrement mais raisonnablement, cœur, rognons, moelle, bouillons d'os, préparations riches en collagène). Ne pas tout construire autour du poulet.
- Produits laitiers traditionnels : lait cru, kéfir de lait, beurre (cru), fromages (au lait cru), yaourt entier.
- Glucides bienvenus : pommes de terre, riz, patate douce, pain de seigle / au levain, sarrasin, avoine, fruits entiers, miel.
- Légumes variés et bien tolérés ; fruits entiers de saison (petit-déjeuner, dessert, collation, sauces salées).
- À ÉVITER : whey, poudres et boissons protéinées, beurre de cacahuète, purées d'oléagineux, graines de chia, ultra-transformés, sucres ajoutés en excès, boissons sucrées, farine blanche en excès, pâtisseries et plats industriels, huiles de graines raffinées en friture.
- Oxalates : ne pas construire les recettes autour de grandes quantités d'épinards, d'amandes, de cacao, de betterave.
- Digestion : globalement modéré en FODMAP quand c'est pertinent, mais l'ail et l'oignon sont tolérés et s'utilisent normalement. Éviter d'empiler les aliments difficiles à digérer dans un même repas (légumineuses + chou + crucifères crus…).
- Matières grasses de cuisson : beurre, beurre clarifié/ghee, graisse de canard, saindoux, huile d'olive, huile de coco.
- Simplicité : majorité « très facile » ou « facile », minorité « intermédiaire ».
- Instructions précises : températures, temps, repères visuels concrets. Jamais « cuire jusqu'à ce que ce soit prêt ».
`.trim();
