// ─────────────────────────────────────────────────────────────
// COMPLÉMENTS EN VRAIS ALIMENTS — quand la part d'un plat partagé ne
// suffit pas à couvrir l'énergie ou les protéines d'une personne
// (typiquement celle qui prend du muscle), l'appli propose d'ajouter
// un de ces en-cas simples. Jamais de poudre de protéines ni de
// produit ultra-transformé : uniquement des aliments bruts.
// Les apports sont recalculés à partir de la base d'ingrédients.
// ─────────────────────────────────────────────────────────────
export interface ComplementDef {
  id: string;
  label: string;
  emoji: string;
  /** ingrédients et grammes (partie comestible) */
  items: Array<[string, number]>;
}

export const COMPLEMENTS: ComplementDef[] = [
  { id: 'oeufs', label: '2 œufs durs ou mollets', emoji: '🥚', items: [['oeuf', 110]] },
  { id: 'skyr', label: '1 pot de skyr ou de fromage blanc entier (150 g)', emoji: '🥛', items: [['skyr', 150]] },
  { id: 'sardines', label: '1 boîte de sardines à l’huile, sur du pain au levain', emoji: '🐟', items: [['sardine-conserve', 90], ['pain-levain', 40]] },
  { id: 'comte', label: '40 g de comté et une pomme', emoji: '🧀', items: [['comte', 40], ['pomme', 150]] },
  { id: 'lait', label: '1 grand verre de lait entier (250 ml)', emoji: '🥛', items: [['lait', 255]] },
  { id: 'kefir', label: '1 bol de kéfir (250 ml) et une banane', emoji: '🍌', items: [['kefir', 250], ['banane', 120]] },
  { id: 'oleagineux', label: '30 g d’amandes ou de noix et quelques dattes', emoji: '🌰', items: [['amande', 30], ['datte', 30]] },
  { id: 'feculent', label: 'Une portion de riz en plus au repas (150 g cuit)', emoji: '🍚', items: [['riz-blanc', 55]] },
  { id: 'tartine', label: '1 tartine de pain au levain beurrée', emoji: '🍞', items: [['pain-levain', 60], ['beurre', 10]] },
];
