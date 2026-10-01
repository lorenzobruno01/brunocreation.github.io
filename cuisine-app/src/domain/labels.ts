import type {
  Cuisine,
  Difficulty,
  Flavor,
  IngredientCategory,
  MealType,
  ProteinGroup,
  RecipeCategory,
  Season,
  ShoppingAisle,
  Technique,
} from './types';

type L = { label: string; emoji: string };

export const CUISINES: Record<Cuisine, L & { region: string }> = {
  francaise: { label: 'Française', emoji: '🇫🇷', region: 'europe' },
  italienne: { label: 'Italienne', emoji: '🇮🇹', region: 'mediterranee' },
  grecque: { label: 'Grecque', emoji: '🇬🇷', region: 'mediterranee' },
  espagnole: { label: 'Espagnole', emoji: '🇪🇸', region: 'mediterranee' },
  portugaise: { label: 'Portugaise', emoji: '🇵🇹', region: 'mediterranee' },
  levantine: { label: 'Levantine', emoji: '🇱🇧', region: 'orient' },
  turque: { label: 'Turque', emoji: '🇹🇷', region: 'orient' },
  'nord-africaine': { label: 'Nord-africaine', emoji: '🇲🇦', region: 'orient' },
  japonaise: { label: 'Japonaise', emoji: '🇯🇵', region: 'asie' },
  coreenne: { label: 'Coréenne', emoji: '🇰🇷', region: 'asie' },
  chinoise: { label: 'Chinoise', emoji: '🇨🇳', region: 'asie' },
  'thai-vietnamienne': { label: 'Thaï / Vietnamienne', emoji: '🇹🇭', region: 'asie' },
  indienne: { label: 'Indienne', emoji: '🇮🇳', region: 'asie' },
  mexicaine: { label: 'Mexicaine', emoji: '🇲🇽', region: 'ameriques' },
  'latino-americaine': { label: 'Latino-américaine', emoji: '🌎', region: 'ameriques' },
  nordique: { label: 'Nordique', emoji: '🇸🇪', region: 'europe' },
  britannique: { label: 'Britannique / Irlandaise', emoji: '🇬🇧', region: 'europe' },
  'europe-centrale': { label: "Europe centrale & de l'Est", emoji: '🇭🇺', region: 'europe' },
  americaine: { label: 'Américaine', emoji: '🇺🇸', region: 'ameriques' },
  rustique: { label: 'Rustique / Terroir', emoji: '🌾', region: 'europe' },
};

export const MEAL_TYPES: Record<MealType, L> = {
  'petit-dejeuner': { label: 'Petit-déjeuner', emoji: '🌅' },
  dejeuner: { label: 'Déjeuner', emoji: '☀️' },
  diner: { label: 'Dîner', emoji: '🌙' },
  collation: { label: 'Collation', emoji: '🍎' },
  dessert: { label: 'Dessert', emoji: '🍮' },
};

export const CATEGORIES: Record<RecipeCategory, L> = {
  'petit-dejeuner': { label: 'Petit-déjeuner', emoji: '🌅' },
  plat: { label: 'Plat', emoji: '🍽️' },
  'salade-composee': { label: 'Salade composée', emoji: '🥗' },
  soupe: { label: 'Soupe', emoji: '🥣' },
  mijote: { label: 'Plat mijoté', emoji: '🍲' },
  accompagnement: { label: 'Accompagnement', emoji: '🥔' },
  collation: { label: 'Collation', emoji: '🍎' },
  dessert: { label: 'Dessert', emoji: '🍮' },
  sauce: { label: 'Sauce / base', emoji: '🫙' },
  boisson: { label: 'Boisson', emoji: '🥛' },
};

export const DIFFICULTIES: Record<Difficulty, L & { rank: number }> = {
  'tres-facile': { label: 'Très facile', emoji: '🟢', rank: 0 },
  facile: { label: 'Facile', emoji: '🟢', rank: 1 },
  intermediaire: { label: 'Intermédiaire', emoji: '🟡', rank: 2 },
};

export const TECHNIQUES: Record<Technique, L> = {
  poele: { label: 'Poêle', emoji: '🍳' },
  four: { label: 'Four', emoji: '🔥' },
  mijote: { label: 'Mijoté', emoji: '🍲' },
  grill: { label: 'Grill / barbecue', emoji: '🔥' },
  vapeur: { label: 'Vapeur', emoji: '♨️' },
  poche: { label: 'Poché', emoji: '💧' },
  cru: { label: 'Cru / tartare', emoji: '🥗' },
  'friture-legere': { label: 'Friture légère', emoji: '🍤' },
  braise: { label: 'Braisé', emoji: '🍖' },
  roti: { label: 'Rôti', emoji: '🍗' },
  wok: { label: 'Wok / sauté', emoji: '🥢' },
  mixe: { label: 'Mixé', emoji: '🥤' },
  'sans-cuisson': { label: 'Sans cuisson', emoji: '❄️' },
  bouilli: { label: 'Bouilli / poché', emoji: '🫕' },
};

export const FLAVORS: Record<Flavor, string> = {
  umami: 'Umami',
  herbace: 'Herbacé',
  epice: 'Épicé',
  piquant: 'Piquant',
  acidule: 'Acidulé',
  sucre: 'Sucré',
  fume: 'Fumé',
  cremeux: 'Crémeux',
  frais: 'Frais',
  reconfortant: 'Réconfortant',
  iode: 'Iodé',
  grille: 'Grillé',
  lacte: 'Lacté',
  fruite: 'Fruité',
};

export const PROTEINS: Record<ProteinGroup, L> = {
  boeuf: { label: 'Bœuf', emoji: '🥩' },
  veau: { label: 'Veau', emoji: '🥩' },
  agneau: { label: 'Agneau', emoji: '🍖' },
  porc: { label: 'Porc', emoji: '🐖' },
  poulet: { label: 'Poulet & volailles', emoji: '🍗' },
  dinde: { label: 'Dinde', emoji: '🦃' },
  canard: { label: 'Canard', emoji: '🦆' },
  'poisson-blanc': { label: 'Poisson blanc', emoji: '🐟' },
  'poisson-gras': { label: 'Poisson gras', emoji: '🐟' },
  'fruits-de-mer': { label: 'Fruits de mer', emoji: '🦐' },
  oeufs: { label: 'Œufs', emoji: '🥚' },
  abats: { label: 'Abats', emoji: '🫀' },
  laitier: { label: 'Produits laitiers', emoji: '🧀' },
  legumineuses: { label: 'Légumineuses', emoji: '🫘' },
};

export const SEASONS: Record<Season, L> = {
  printemps: { label: 'Printemps', emoji: '🌱' },
  ete: { label: 'Été', emoji: '☀️' },
  automne: { label: 'Automne', emoji: '🍂' },
  hiver: { label: 'Hiver', emoji: '❄️' },
};

export const INGREDIENT_CATEGORIES: Record<IngredientCategory, L> = {
  viande: { label: 'Viandes', emoji: '🥩' },
  volaille: { label: 'Volailles', emoji: '🍗' },
  abats: { label: 'Abats & os', emoji: '🫀' },
  poisson: { label: 'Poissons', emoji: '🐟' },
  'fruits-de-mer': { label: 'Fruits de mer', emoji: '🦐' },
  oeufs: { label: 'Œufs', emoji: '🥚' },
  laitier: { label: 'Produits laitiers', emoji: '🧀' },
  feculent: { label: 'Féculents', emoji: '🥔' },
  legume: { label: 'Légumes', emoji: '🥬' },
  legumineuse: { label: 'Légumineuses', emoji: '🫘' },
  fruit: { label: 'Fruits', emoji: '🍎' },
  herbe: { label: 'Herbes', emoji: '🌿' },
  epice: { label: 'Épices', emoji: '🧂' },
  'matiere-grasse': { label: 'Huiles & graisses', emoji: '🫒' },
  condiment: { label: 'Condiments', emoji: '🫙' },
  epicerie: { label: 'Épicerie', emoji: '🛒' },
  boisson: { label: 'Liquides', emoji: '💧' },
};

export const AISLES: Record<ShoppingAisle, L & { order: number }> = {
  'viandes-poissons': { label: 'Viandes / poissons', emoji: '🥩', order: 1 },
  oeufs: { label: 'Œufs', emoji: '🥚', order: 2 },
  laitiers: { label: 'Produits laitiers', emoji: '🥛', order: 3 },
  legumes: { label: 'Légumes', emoji: '🥬', order: 4 },
  fruits: { label: 'Fruits', emoji: '🍎', order: 5 },
  feculents: { label: 'Féculents', emoji: '🥔', order: 6 },
  epicerie: { label: 'Épicerie', emoji: '🧂', order: 7 },
  'herbes-epices': { label: 'Herbes / épices', emoji: '🌿', order: 8 },
};

/** Tags de contexte recommandés (§49) */
export const CONTEXT_TAGS: string[] = [
  'rapide',
  'économique',
  'batch cooking',
  'week-end',
  'sportif',
  'riche en protéines',
  'riche en glucides',
  'calorique',
  'léger',
  'familial',
  'une poêle',
  'four',
  'barbecue',
  'mijoté',
  'préparation à l’avance',
  'repas froid',
  'abats',
  'prise de masse',
  'lunch box',
  'réconfortant',
  'sans gluten',
  'riche en collagène',
  'fermenté',
];

export const TIME_BUCKETS = [
  { key: '15', label: '< 15 min', max: 15 },
  { key: '30', label: '< 30 min', max: 30 },
  { key: '45', label: '< 45 min', max: 45 },
  { key: '60', label: '< 60 min', max: 60 },
  { key: 'long', label: 'Long (> 1 h)', max: Infinity },
] as const;
