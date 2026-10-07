import { withTargets } from '../domain/profile';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from '../db/db';
import { INGREDIENTS } from '../data/ingredients';
import { indexRecipe } from '../domain/indexing';
import { computeDetailed, DEFAULT_PROFILES, densityScore, type NutritionProfile } from '../domain/micronutrients';
import { analyzeDigestion, compatibility, DIET_PROFILES } from '../domain/digestion';
import type { Ingredient, IndexedRecipe, Recipe, Settings, PhotoCredit } from '../domain/types';
import { norm } from '../domain/text';

// Les recettes de base sont des fichiers JSON chargés à la demande (découpage par fichier).
const seedModules = import.meta.glob<{ default: Recipe[] }>('../data/recipes/*.json');

async function loadSeed(): Promise<Recipe[]> {
  const [mods, photos] = await Promise.all([Promise.all(Object.values(seedModules).map((load) => load())), import('../data/photos.json')]);
  // photos libres de droits vérifiées une à une (public/photos, crédits dans src/data/photos.json)
  const P = photos.default as Record<string, { file: string } & PhotoCredit>;
  return mods.flatMap((m) =>
    m.default.map((r) => {
      const ph = P[r.id];
      return { ...r, source: 'seed' as const, createdAt: r.createdAt ?? '2026-10-01T00:00:00.000Z', ...(ph && !r.photo ? { photo: `photos/${ph.file}`, photoCredit: { author: ph.author, license: ph.license, source: ph.source } } : {}) };
    }),
  );
}

interface LibraryValue {
  ready: boolean;
  /** recettes compatibles avec les profils alimentaires actifs */
  recipes: IndexedRecipe[];
  /** toute la bibliothèque */
  allRecipes: IndexedRecipe[];
  diets: string[];
  byId: Map<string, IndexedRecipe>;
  seedIds: Set<string>;
  ingredients: Ingredient[];
  lookup: (id: string) => Ingredient | undefined;
}

const LibraryContext = createContext<LibraryValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<Recipe[] | null>(null);
  useEffect(() => {
    loadSeed().then(setSeed, (e) => {
      console.error(e);
      setSeed([]);
    });
  }, []);
  const userRecipes = useLiveQuery(() => db.recipes.toArray(), []);
  const hidden = useLiveQuery(() => db.hidden.toArray(), []);
  const custom = useLiveQuery(() => db.customIngredients.toArray(), []);
  const settingsRow = useLiveQuery(() => db.settings.get('settings'), []);
  const diets = settingsRow?.diets ?? ['wapf'];
  const showIncompatible = !!settingsRow?.showIncompatible;

  const value = useMemo<LibraryValue>(() => {
    const ingredients = [...INGREDIENTS, ...(custom ?? [])];
    const ingMap = new Map(ingredients.map((i) => [i.id, i]));
    const lookup = (id: string) => ingMap.get(id);
    const ready = seed != null && userRecipes != null && hidden != null && custom != null;
    if (!ready) return { ready, recipes: [], allRecipes: [], diets, byId: new Map(), seedIds: new Set(), ingredients, lookup };
    const hiddenIds = new Set(hidden!.map((h) => h.recipeId));
    const merged = new Map<string, Recipe>();
    for (const r of seed!) if (!hiddenIds.has(r.id)) merged.set(r.id, r);
    for (const r of userRecipes!) merged.set(r.id, r); // les modifications locales priment
    const recipes = [...merged.values()].map((r) => {
      const ix = indexRecipe(r, lookup);
      ix.micros = computeDetailed(r, lookup);
      ix.density = densityScore(ix.micros, ix.nutrition.kcal);
      const d = analyzeDigestion(r, lookup);
      ix.digest = { oxalateMg: d.oxalateMg, oxalateLevel: d.oxalateLevel, prepared: d.prepared, alerts: d.issues.filter((i) => i.level !== 'info').length, fermented: d.fermented, broth: d.broth, organs: d.organs };
      const inc: Record<string, string[]> = {};
      for (const p of DIET_PROFILES) {
        const c = compatibility(r, p, lookup, d);
        if (!c.ok) inc[p.id] = c.reasons;
      }
      ix.incompatible = inc;
      return ix;
    });
    const visible = showIncompatible ? recipes : recipes.filter((r) => !diets.some((d) => r.incompatible?.[d]));
    return {
      ready,
      recipes: visible,
      allRecipes: recipes,
      diets,
      byId: new Map(recipes.map((r) => [r.id, r])),
      seedIds: new Set(seed!.map((r) => r.id)),
      ingredients,
      lookup,
    };
  }, [seed, userRecipes, hidden, custom, diets.join(','), showIncompatible]); // eslint-disable-line react-hooks/exhaustive-deps

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const v = useContext(LibraryContext);
  if (!v) throw new Error('LibraryProvider manquant');
  return v;
}

// ── Données utilisateur ──────────────────────────────────

export function useFavorites(): Set<string> {
  const rows = useLiveQuery(() => db.favorites.toArray(), []);
  return useMemo(() => new Set((rows ?? []).map((r) => r.recipeId)), [rows]);
}

export function useHistory() {
  return useLiveQuery(() => db.cooking.orderBy('date').reverse().toArray(), []) ?? [];
}

/** Membres du foyer (profils créés dans l'appli), triés par date de création ; undefined pendant le chargement */
export function useStoredProfiles(): NutritionProfile[] | undefined {
  const rows = useLiveQuery(() => db.profiles.toArray(), []);
  // besoins recalculés à la lecture : un changement de src/config/targets.ts s'applique à tous
  return useMemo(() => rows && [...rows].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id)).map(withTargets), [rows]);
}

/** Membres du foyer ; profils d'exemple tant qu'aucun n'est créé */
export function useProfiles(): NutritionProfile[] {
  const rows = useStoredProfiles();
  return rows?.length ? rows : DEFAULT_PROFILES;
}

export function useLastCooked(): Map<string, string> {
  const h = useHistory();
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const e of h) if (!m.has(e.recipeId)) m.set(e.recipeId, e.date);
    return m;
  }, [h]);
}

export function usePantry(): Set<string> {
  const rows = useLiveQuery(() => db.pantry.toArray(), []);
  return useMemo(() => new Set((rows ?? []).map((r) => r.ingredientId)), [rows]);
}

export function usePantryRows() {
  return useLiveQuery(() => db.pantry.toArray(), []) ?? [];
}

export function useFridge(): Set<string> {
  const rows = useLiveQuery(() => db.fridge.toArray(), []);
  return useMemo(() => new Set((rows ?? []).map((r) => r.ingredientId)), [rows]);
}

export function useBasket() {
  return useLiveQuery(() => db.basket.orderBy('addedAt').toArray(), []) ?? [];
}

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('settings'), []);
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...(s ?? {}) }), [s]);
}

// ── Recherche d'ingrédients (instantanée, tolérante) ─────

export function searchIngredients(q: string, list: Ingredient[], limit = 40): Ingredient[] {
  const n = norm(q);
  if (!n) return [];
  const scored: Array<{ i: Ingredient; s: number }> = [];
  for (const i of list) {
    const names = [i.name, i.plural ?? '', ...(i.aliases ?? [])].map(norm);
    let s = 0;
    names.forEach((x, idx) => {
      if (!x) return;
      const w = idx === 0 ? 3 : idx === 1 ? 2.5 : 1;
      if (x === n) s = Math.max(s, 1000 + w);
      else if (x.startsWith(n)) s = Math.max(s, 50 * w);
      else if (x.split(' ').some((word) => word.startsWith(n))) s = Math.max(s, 25 * w);
      else if (n.length >= 3 && x.includes(n)) s = Math.max(s, 8 * w);
    });
    if (s) scored.push({ i, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.i.name.localeCompare(b.i.name, 'fr')).slice(0, limit).map((x) => x.i);
}

// ── Contexte partagé des données utilisateur (une seule souscription) ──

interface UserData {
  favorites: Set<string>;
  basket: Map<string, number>; // recipeId → portions
  pantry: Set<string>;
  fridge: Set<string>;
  lastCooked: Map<string, string>;
  settings: Settings;
}

const UserDataContext = createContext<UserData | null>(null);

export function UserDataProvider({ children }: { children: ReactNode }) {
  const favorites = useFavorites();
  const basketRows = useBasket();
  const pantry = usePantry();
  const fridge = useFridge();
  const lastCooked = useLastCooked();
  const settings = useSettings();
  const basket = useMemo(() => new Map(basketRows.map((b) => [b.recipeId, b.servings])), [basketRows]);
  const value = useMemo(() => ({ favorites, basket, pantry, fridge, lastCooked, settings }), [favorites, basket, pantry, fridge, lastCooked, settings]);
  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserData {
  const v = useContext(UserDataContext);
  if (!v) throw new Error('UserDataProvider manquant');
  return v;
}
