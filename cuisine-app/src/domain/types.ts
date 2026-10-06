// ─────────────────────────────────────────────────────────────
// Modèle de données — partagé par l'UI, la base locale, les
// scripts de validation et le générateur IA.
// ─────────────────────────────────────────────────────────────

export type IngredientCategory =
  | 'viande'
  | 'volaille'
  | 'abats'
  | 'poisson'
  | 'fruits-de-mer'
  | 'oeufs'
  | 'laitier'
  | 'feculent'
  | 'legume'
  | 'legumineuse'
  | 'fruit'
  | 'herbe'
  | 'epice'
  | 'matiere-grasse'
  | 'condiment'
  | 'epicerie'
  | 'boisson';

/** Rayon de la liste de courses */
export type ShoppingAisle =
  | 'viandes-poissons'
  | 'oeufs'
  | 'laitiers'
  | 'legumes'
  | 'fruits'
  | 'feculents'
  | 'epicerie'
  | 'herbes-epices';

/** Famille de protéine (pour filtres, variété, menus) */
export type ProteinGroup =
  | 'boeuf'
  | 'veau'
  | 'agneau'
  | 'porc'
  | 'poulet'
  | 'dinde'
  | 'canard'
  | 'poisson-blanc'
  | 'poisson-gras'
  | 'fruits-de-mer'
  | 'oeufs'
  | 'abats'
  | 'laitier'
  | 'legumineuses';

export type StandardUnit = 'g' | 'ml' | 'piece';

export type Season = 'printemps' | 'ete' | 'automne' | 'hiver';

export interface Ingredient {
  id: string;
  name: string; // singulier, ex. « pomme de terre »
  plural?: string; // ex. « pommes de terre »
  aliases?: string[]; // ex. « PDT », « patate »
  category: IngredientCategory;
  aisle: ShoppingAisle;
  unit: StandardUnit; // unité de référence pour les courses
  /** poids moyen d'une pièce (g) — permet g ↔ pièce */
  pieceWeight?: number;
  /** densité g/ml (défaut 1) — permet ml ↔ g et cuillères */
  density?: number;
  /** valeurs nutritionnelles pour 100 g (partie comestible) */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** ingrédient « de base » (sel, poivre, huile, épices) : ne pénalise pas la correspondance */
  staple?: boolean;
  protein_group?: ProteinGroup;
  seasons?: Season[];
  /** part comestible (os, coquilles) appliquée au calcul nutritionnel */
  edible?: number;
  /** part comestible seulement quand l'ingrédient est compté en pièces entières (poissons entiers) */
  edibleWhole?: number;
  /** taille de conditionnement usuelle (dans l'unité standard) → calcul des restes */
  packageSize?: number;
  /** marqueurs de philosophie alimentaire */
  flags?: Array<'oxalates' | 'fodmap' | 'transforme' | 'eviter'>;
  emoji?: string;
}

export type MealType = 'petit-dejeuner' | 'dejeuner' | 'diner' | 'collation' | 'dessert';

export type RecipeCategory =
  | 'petit-dejeuner'
  | 'plat'
  | 'salade-composee'
  | 'soupe'
  | 'mijote'
  | 'accompagnement'
  | 'collation'
  | 'dessert'
  | 'sauce'
  | 'boisson';

export type Cuisine =
  | 'francaise'
  | 'italienne'
  | 'grecque'
  | 'espagnole'
  | 'portugaise'
  | 'levantine'
  | 'turque'
  | 'nord-africaine'
  | 'japonaise'
  | 'coreenne'
  | 'chinoise'
  | 'thai-vietnamienne'
  | 'indienne'
  | 'mexicaine'
  | 'latino-americaine'
  | 'nordique'
  | 'britannique'
  | 'europe-centrale'
  | 'americaine'
  | 'rustique';

export type Difficulty = 'tres-facile' | 'facile' | 'intermediaire';

export type Technique =
  | 'poele'
  | 'four'
  | 'mijote'
  | 'grill'
  | 'vapeur'
  | 'poche'
  | 'cru'
  | 'friture-legere'
  | 'braise'
  | 'roti'
  | 'wok'
  | 'mixe'
  | 'sans-cuisson'
  | 'bouilli';

export type Flavor =
  | 'umami'
  | 'herbace'
  | 'epice'
  | 'piquant'
  | 'acidule'
  | 'sucre'
  | 'fume'
  | 'cremeux'
  | 'frais'
  | 'reconfortant'
  | 'iode'
  | 'grille'
  | 'lacte'
  | 'fruite';

/** Unités autorisées dans une recette (converties automatiquement) */
export type RecipeUnit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'cl'
  | 'l'
  | 'piece'
  | 'cas' // cuillère à soupe (15 ml)
  | 'cac' // cuillère à café (5 ml)
  | 'pincee'
  | 'tranche'
  | 'gousse'
  | 'brin'
  | 'feuille'
  | 'botte'
  | 'filet'
  | 'au-gout';

export interface RecipeIngredient {
  id: string; // ingredient_id normalisé
  qty: number; // pour `servings` portions
  unit: RecipeUnit;
  note?: string; // « en dés », « à température ambiante »…
  optional?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  photo?: string; // URL ou data-URL (recettes ajoutées)
  emoji?: string;
  category: RecipeCategory;
  mealTypes: MealType[];
  cuisine: Cuisine;
  prepTime: number; // min
  cookTime: number; // min
  /** temps d'attente passif (repos, marinade…) */
  restTime?: number;
  difficulty: Difficulty;
  servings: number; // portions de base des quantités
  ingredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
  seasons: Season[]; // vide = toute l'année
  technique: Technique;
  flavors: Flavor[];
  tips?: string;
  source?: 'seed' | 'user' | 'ai';
  createdAt?: string; // ISO
  /** nutrition saisie manuellement (sinon calculée) — par portion */
  nutritionOverride?: Nutrition;
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Recette enrichie de champs calculés (index de recherche, anti-répétition) */
export interface IndexedRecipe extends Recipe {
  totalTime: number;
  nutrition: Nutrition; // par portion
  proteins: ProteinGroup[];
  mainProtein?: ProteinGroup;
  starches: string[]; // ingredient ids
  vegetables: string[];
  fruits: string[];
  mainIngredientIds: string[]; // hors ingrédients de base
  searchText: string;
  /** apports détaillés par portion (vitamines, minéraux, acides aminés…) */
  micros?: Record<string, number>;
  /** indice de densité nutritionnelle 0–100 */
  density?: number;
  /** digestibilité : oxalates (mg/portion), préparations, alertes */
  digest?: { oxalateMg: number; oxalateLevel: string; prepared: string[]; alerts: number; fermented: boolean; broth: boolean; organs: boolean };
  /** profils alimentaires incompatibles → raisons */
  incompatible?: Record<string, string[]>;
}

// ── Données utilisateur (persistées) ────────────────────────

/** Recette cuisinée (historique partagé du foyer) */
export interface HistoryEntry {
  /** identifiant texte (synchronisable entre appareils) */
  id: string;
  recipeId: string;
  date: string; // ISO
  /** membres qui ont mangé ce repas */
  profileIds?: string[];
  servings?: number;
}

/** Retour d'un membre après un repas */
export interface Feedback {
  id: string; // `${cookedId}|${profileId}`
  cookedId: string;
  recipeId: string;
  profileId: string;
  date: string;
  /** goût de 1 à 5 */
  taste?: number;
  digestion?: 'bien' | 'lourd' | 'inconfort';
  again?: 'oui' | 'peut-etre' | 'non';
  note?: string;
}

export interface WeightLog {
  id: string; // `${profileId}|${date}`
  profileId: string;
  date: string; // AAAA-MM-JJ
  kg: number;
}

/** Restes disponibles (« Il me reste… ») */
export interface Leftover {
  id: string;
  label: string;
  ingredientIds: string[];
  recipeId?: string;
  createdAt: string;
  /** à consommer avant (AAAA-MM-JJ) */
  useBy?: string;
}

/** Gabarit de semaine : contrainte par jour (0 = lundi) et par repas */
export type SlotMode = 'libre' | '15' | '30' | '45' | 'long' | 'dehors' | 'restes' | 'batch';
export interface WeekTemplate {
  key: 'template';
  slots: Record<string, SlotMode>; // clé `${jour}|${repas}`
}

export interface PantryItem {
  ingredientId: string;
  /** quantité disponible facultative (unité standard) */
  qty?: number;
  addedAt: string;
}

export type Slot = 'matin' | 'midi' | 'collation' | 'soir';

export interface PlanEntry {
  key: string; // `${date}|${slot}`
  date: string; // YYYY-MM-DD
  slot: Slot;
  recipeId: string;
  servings: number;
  /** restes d'un autre créneau (clé) : rien à cuisiner ni à acheter */
  leftoverOf?: string;
}

export interface ShoppingItem {
  key: string; // ingredientId ou `custom:...`
  ingredientId?: string;
  label: string;
  qty: number; // unité standard
  unit: StandardUnit | 'autre';
  aisle: ShoppingAisle;
  checked: boolean;
  recipes: string[]; // noms des recettes concernées
  note?: string;
}

export interface Settings {
  key: 'settings';
  defaultServings: number;
  apiKey?: string;
  model?: string;
  householdName?: string;
  activeProfile?: string;
  /** le profil du foyer a été configuré (premier lancement terminé) */
  onboarded?: boolean;
  /** assistant courses : code postal et rayon de recherche (km) */
  shopCp?: string;
  shopRadius?: number;
  /** budget courses de la semaine (€), facultatif */
  weeklyBudget?: number;
  /** liste de courses groupée par rayon ou par commerce */
  shopGroup?: 'rayon' | 'commerce';
  /** planning : « nous » (tous les profils partagent les repas) ou l'id d'un profil */
  planFor?: string;
  /** créer automatiquement une recette quand une recherche ne donne rien */
  autoCreate?: boolean;
  /** profils alimentaires actifs (filtrent recettes et planning) */
  diets?: string[];
  /** afficher aussi les recettes hors profil */
  showIncompatible?: boolean;
}
