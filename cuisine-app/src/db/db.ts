// ─────────────────────────────────────────────────────────────
// Persistance locale (IndexedDB via Dexie).
// L'appli fonctionne d'abord hors ligne : toutes les données vivent
// ici. Une fois connecté, chaque table est synchronisée élément par
// élément avec le foyer (src/cloud/sync.ts).
// Les recettes « seed » sont livrées en JSON ; les recettes ajoutées
// ou modifiées sont stockées ici et fusionnées à l'exécution.
// ─────────────────────────────────────────────────────────────
import Dexie, { type Table } from 'dexie';
import type { Feedback, HistoryEntry, Ingredient, Leftover, PantryItem, PlanEntry, Recipe, Settings, ShoppingItem, WeekTemplate, WeightLog } from '../domain/types';
import type { NutritionProfile } from '../domain/micronutrients';

export interface FavoriteRow {
  recipeId: string;
  addedAt: string;
}
export interface BasketRow {
  recipeId: string;
  servings: number;
  addedAt: string;
}
export interface FridgeRow {
  ingredientId: string;
  /** produit à consommer rapidement (prioritaire dans les suggestions) */
  useSoon?: boolean;
}
export interface HiddenRow {
  recipeId: string;
}
/** Modification locale en attente d'envoi au foyer (hors ligne) */
export interface OutboxRow {
  seq?: number;
  table: string;
  id: string;
  data: unknown | null; // null = suppression
  at: string;
}

export class CuisineDB extends Dexie {
  recipes!: Table<Recipe, string>;
  hidden!: Table<HiddenRow, string>;
  customIngredients!: Table<Ingredient, string>;
  favorites!: Table<FavoriteRow, string>;
  cooking!: Table<HistoryEntry, string>;
  pantry!: Table<PantryItem, string>;
  fridge!: Table<FridgeRow, string>;
  plan!: Table<PlanEntry, string>;
  basket!: Table<BasketRow, string>;
  shopping!: Table<ShoppingItem, string>;
  settings!: Table<Settings, string>;
  profiles!: Table<NutritionProfile, string>;
  feedback!: Table<Feedback, string>;
  weights!: Table<WeightLog, string>;
  weekTemplate!: Table<WeekTemplate, string>;
  leftovers!: Table<Leftover, string>;
  outbox!: Table<OutboxRow, number>;

  constructor() {
    super('cuisine-foyer');
    this.version(1).stores({
      recipes: 'id, category, cuisine, source, createdAt',
      hidden: 'recipeId',
      customIngredients: 'id, category',
      favorites: 'recipeId, addedAt',
      history: '++id, recipeId, date',
      pantry: 'ingredientId',
      fridge: 'ingredientId',
      plan: 'key, date, recipeId',
      basket: 'recipeId, addedAt',
      shopping: 'key, aisle, checked',
      settings: 'key',
    });
    // v2 : historique à identifiants texte, profils, retours, poids, gabarit, restes, file d'envoi
    this.version(2)
      .stores({
        cooking: 'id, recipeId, date',
        profiles: 'id, userId',
        feedback: 'id, recipeId, profileId, date',
        weights: 'id, profileId, date',
        weekTemplate: 'key',
        leftovers: 'id, createdAt',
        outbox: '++seq, table',
      })
      .upgrade(async (tx) => {
        // historique : identifiants numériques locaux → identifiants texte uniques
        const old = (await tx.table('history').toArray()) as Array<{ id: number; recipeId: string; date: string }>;
        await tx.table('cooking').bulkPut(old.map((h) => ({ id: `h${h.id}-${h.date.slice(0, 19)}`, recipeId: h.recipeId, date: h.date })));
        // profils : stockés jusqu'ici dans les réglages
        const s = (await tx.table('settings').get('settings')) as (Settings & { profiles?: NutritionProfile[] }) | undefined;
        if (s?.profiles?.length) await tx.table('profiles').bulkPut(s.profiles.map((p) => ({ ...p, updatedAt: new Date().toISOString() })));
      });
    this.version(3).stores({ history: null });
  }
}

export const db = new CuisineDB();

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  defaultServings: 2,
};

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get('settings')) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, key: 'settings' });
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ── Actions ───────────────────────────────────────────────

export async function toggleFavorite(recipeId: string) {
  const ex = await db.favorites.get(recipeId);
  if (ex) await db.favorites.delete(recipeId);
  else await db.favorites.put({ recipeId, addedAt: new Date().toISOString() });
}

/** Recette cuisinée : retourne l'entrée d'historique (pour demander les retours) */
export async function markCooked(recipeId: string, profileIds?: string[], servings?: number): Promise<HistoryEntry> {
  const e: HistoryEntry = { id: newId(), recipeId, date: new Date().toISOString(), ...(profileIds?.length ? { profileIds } : {}), ...(servings ? { servings } : {}) };
  await db.cooking.put(e);
  return e;
}

export async function toggleBasket(recipeId: string, servings: number) {
  const ex = await db.basket.get(recipeId);
  if (ex) await db.basket.delete(recipeId);
  else await db.basket.put({ recipeId, servings, addedAt: new Date().toISOString() });
}

export async function setFridge(ids: string[]) {
  await db.transaction('rw', db.fridge, async () => {
    const keep = new Map((await db.fridge.toArray()).map((r) => [r.ingredientId, r]));
    await db.fridge.clear();
    await db.fridge.bulkPut(ids.map((ingredientId) => keep.get(ingredientId) ?? { ingredientId }));
  });
}

export async function togglePantry(ingredientId: string) {
  const ex = await db.pantry.get(ingredientId);
  if (ex) await db.pantry.delete(ingredientId);
  else await db.pantry.put({ ingredientId, addedAt: new Date().toISOString() });
}

export async function saveRecipe(recipe: Recipe) {
  await db.recipes.put({ ...recipe, createdAt: recipe.createdAt ?? new Date().toISOString() });
  await db.hidden.delete(recipe.id);
}

export async function deleteRecipe(recipeId: string, isSeed: boolean) {
  await db.recipes.delete(recipeId);
  if (isSeed) await db.hidden.put({ recipeId });
  await db.favorites.delete(recipeId);
  await db.basket.delete(recipeId);
}

// ── Sauvegarde / synchronisation ──────────────────────────

/** Tables de données personnelles (exportées, synchronisées, effacées à la déconnexion) */
export const BACKUP_TABLES = [
  'recipes',
  'hidden',
  'customIngredients',
  'favorites',
  'cooking',
  'pantry',
  'fridge',
  'plan',
  'basket',
  'shopping',
  'settings',
  'profiles',
  'feedback',
  'weights',
  'weekTemplate',
  'leftovers',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export type Snapshot = Partial<Record<BackupTable | 'history', unknown[]>>;

/** Toutes les données personnelles, sans la clé d'API historique */
export async function snapshotData(): Promise<Snapshot> {
  const out: Snapshot = {};
  await db.transaction('r', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) out[t] = await db.table(t).toArray();
  });
  out.settings = (out.settings as Settings[]).map(({ apiKey: _apiKey, ...rest }) => rest);
  return out;
}

export async function exportData(): Promise<string> {
  return JSON.stringify({ app: 'cuisine-foyer', version: 2, exportedAt: new Date().toISOString(), data: await snapshotData() }, null, 1);
}

/** Efface toutes les données personnelles de cet appareil (la bibliothèque de base reste) */
export async function wipeLocalData() {
  await db.transaction('rw', [...BACKUP_TABLES, 'outbox'].map((t) => db.table(t)), async () => {
    for (const t of [...BACKUP_TABLES, 'outbox']) await db.table(t).clear();
  });
}

/** Anciennes sauvegardes : historique à identifiants numériques, profils dans les réglages */
function normalizeLegacy(data: Snapshot): Snapshot {
  const out = { ...data };
  if (Array.isArray(data.history) && !data.cooking) {
    out.cooking = (data.history as Array<{ id?: number; recipeId: string; date: string }>).map((h, i) => ({ id: `h${h.id ?? i}-${h.date.slice(0, 19)}`, recipeId: h.recipeId, date: h.date }));
  }
  delete out.history;
  const s = (data.settings as Array<Settings & { profiles?: NutritionProfile[] }> | undefined)?.[0];
  if (s?.profiles?.length && !data.profiles) out.profiles = s.profiles;
  return out;
}

/** mode « merge » : ajoute/écrase par clé ; « replace » : remplace tout */
export async function importData(json: string, mode: 'merge' | 'replace' = 'merge') {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'cuisine-foyer' || !parsed.data) throw new Error('Fichier de sauvegarde non reconnu');
  const data = normalizeLegacy(parsed.data as Snapshot);
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows = data[t];
      if (!Array.isArray(rows)) continue;
      if (mode === 'replace') await db.table(t).clear();
      if (t === 'settings') {
        for (const r of rows as Settings[]) {
          const { apiKey: _k, ...rest } = r as Settings & { profiles?: unknown };
          delete (rest as { profiles?: unknown }).profiles;
          await db.settings.put({ ...(await getSettings()), ...rest, key: 'settings' });
        }
      } else {
        await db.table(t).bulkPut(rows);
      }
    }
  });
}
