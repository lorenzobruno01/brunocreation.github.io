// ─────────────────────────────────────────────────────────────
// Persistance locale (IndexedDB via Dexie).
// Base relationnelle légère : tables indexées, clés étrangères
// par id (recipeId, ingredientId). Les recettes « seed » sont
// livrées en JSON ; les recettes ajoutées / générées / modifiées
// sont stockées ici et fusionnées à l'exécution.
// ─────────────────────────────────────────────────────────────
import Dexie, { type Table } from 'dexie';
import type { HistoryEntry, Ingredient, PantryItem, PlanEntry, Recipe, Settings, ShoppingItem } from '../domain/types';

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
}
export interface HiddenRow {
  recipeId: string;
}

export class CuisineDB extends Dexie {
  recipes!: Table<Recipe, string>;
  hidden!: Table<HiddenRow, string>;
  customIngredients!: Table<Ingredient, string>;
  favorites!: Table<FavoriteRow, string>;
  history!: Table<HistoryEntry, number>;
  pantry!: Table<PantryItem, string>;
  fridge!: Table<FridgeRow, string>;
  plan!: Table<PlanEntry, string>;
  basket!: Table<BasketRow, string>;
  shopping!: Table<ShoppingItem, string>;
  settings!: Table<Settings, string>;

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
  }
}

export const db = new CuisineDB();

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  defaultServings: 2,
  model: 'claude-opus-5-5',
};

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get('settings')) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, key: 'settings' });
}

// ── Actions ───────────────────────────────────────────────

export async function toggleFavorite(recipeId: string) {
  const ex = await db.favorites.get(recipeId);
  if (ex) await db.favorites.delete(recipeId);
  else await db.favorites.put({ recipeId, addedAt: new Date().toISOString() });
}

export async function markCooked(recipeId: string) {
  await db.history.add({ recipeId, date: new Date().toISOString() });
}

export async function toggleBasket(recipeId: string, servings: number) {
  const ex = await db.basket.get(recipeId);
  if (ex) await db.basket.delete(recipeId);
  else await db.basket.put({ recipeId, servings, addedAt: new Date().toISOString() });
}

export async function setFridge(ids: string[]) {
  await db.transaction('rw', db.fridge, async () => {
    await db.fridge.clear();
    await db.fridge.bulkPut(ids.map((ingredientId) => ({ ingredientId })));
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

// ── Sauvegarde / synchronisation manuelle entre appareils ──

export const BACKUP_TABLES = ['recipes', 'hidden', 'customIngredients', 'favorites', 'history', 'pantry', 'fridge', 'plan', 'basket', 'shopping', 'settings'] as const;

export type Snapshot = Record<(typeof BACKUP_TABLES)[number], unknown[]>;

/** Toutes les données personnelles, sans la clé d'API historique */
export async function snapshotData(): Promise<Snapshot> {
  const out = {} as Snapshot;
  await db.transaction('r', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) out[t] = await db.table(t).toArray();
  });
  out.settings = (out.settings as Settings[]).map(({ apiKey: _apiKey, ...rest }) => rest);
  return out;
}

export async function exportData(): Promise<string> {
  return JSON.stringify({ app: 'cuisine-foyer', version: 1, exportedAt: new Date().toISOString(), data: await snapshotData() }, null, 1);
}

/** Efface toutes les données personnelles de cet appareil (la bibliothèque de base reste) */
export async function wipeLocalData() {
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) await db.table(t).clear();
  });
}

/** mode « merge » : ajoute/écrase par clé ; « replace » : remplace tout */
export async function importData(json: string, mode: 'merge' | 'replace' = 'merge') {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'cuisine-foyer' || !parsed.data) throw new Error('Fichier de sauvegarde non reconnu');
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows = parsed.data[t];
      if (!Array.isArray(rows)) continue;
      if (mode === 'replace') await db.table(t).clear();
      if (t === 'settings') {
        const cur = await getSettings();
        for (const r of rows) await db.settings.put({ ...r, apiKey: r.apiKey ?? cur.apiKey, key: 'settings' });
      } else if (t === 'history' && mode === 'merge') {
        const existing = new Set((await db.history.toArray()).map((h) => `${h.recipeId}|${h.date}`));
        // (les entrées déjà présentes, quel que soit leur id local, ne sont pas dupliquées)
        await db.history.bulkAdd(rows.filter((h: HistoryEntry) => !existing.has(`${h.recipeId}|${h.date}`)).map(({ id: _id, ...h }: HistoryEntry) => h));
      } else if (t === 'history') {
        await db.history.bulkAdd(rows.map(({ id: _id, ...h }: HistoryEntry) => h));
      } else {
        await db.table(t).bulkPut(rows);
      }
    }
  });
}
