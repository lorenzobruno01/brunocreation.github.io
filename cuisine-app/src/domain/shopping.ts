// ─────────────────────────────────────────────────────────────
// RECETTES → COURSES : calcul, consolidation, garde-manger,
// rayons, anti-gaspillage (§36–§39, §51)
// ─────────────────────────────────────────────────────────────
import type { IndexedRecipe, ShoppingAisle, ShoppingItem, StandardUnit } from './types';
import type { IngredientLookup } from './indexing';
import { toStandard, formatStandard } from './units';
import { AISLES } from './labels';
import { costOf, purchaseFor } from '../config/formats';

export interface Selection {
  recipe: IndexedRecipe;
  servings: number;
}

export interface ConsolidatedLine {
  ingredientId: string;
  label: string;
  qty: number;
  unit: StandardUnit;
  aisle: ShoppingAisle;
  recipes: string[];
  /** quantités non convertibles (ex. « 1 botte ») */
  extras: string[];
  /** ingrédient présent uniquement « au goût » */
  toTaste: boolean;
}

export interface ShoppingResult {
  toBuy: ConsolidatedLine[];
  inPantry: Array<ConsolidatedLine & { pantryQty?: number }>;
  leftovers: LeftoverWarning[];
}

export interface LeftoverWarning {
  ingredientId: string;
  label: string;
  needed: number;
  packageSize: number;
  leftover: number;
  unit: StandardUnit;
  suggestions: IndexedRecipe[];
}

const PERISHABLE = new Set(['viande', 'volaille', 'abats', 'poisson', 'fruits-de-mer', 'laitier', 'legume', 'fruit', 'herbe']);

/** Ingrédients jamais listés (eau du robinet) */
const NEVER_BUY = new Set(['eau']);

export function consolidate(selections: Selection[], lookup: IngredientLookup): ConsolidatedLine[] {
  const lines = new Map<string, ConsolidatedLine>();
  for (const { recipe, servings } of selections) {
    const factor = servings / recipe.servings;
    for (const ri of recipe.ingredients) {
      if (NEVER_BUY.has(ri.id)) continue;
      const ing = lookup(ri.id);
      if (!ing) continue;
      let line = lines.get(ing.id);
      if (!line) {
        line = {
          ingredientId: ing.id,
          label: ing.name,
          qty: 0,
          unit: ing.unit,
          aisle: ing.aisle,
          recipes: [],
          extras: [],
          toTaste: true,
        };
        lines.set(ing.id, line);
      }
      if (!line.recipes.includes(recipe.name)) line.recipes.push(recipe.name);
      if (ri.unit === 'au-gout') continue;
      line.toTaste = false;
      const std = toStandard(ri.qty * factor, ri.unit, ing);
      if (std) line.qty += std.qty;
      else line.extras.push(`${ri.qty * factor} ${ri.unit}`);
    }
  }
  return [...lines.values()];
}

export function buildShopping(
  selections: Selection[],
  pantry: Map<string, number | undefined>,
  lookup: IngredientLookup,
  library: IndexedRecipe[],
): ShoppingResult {
  const lines = consolidate(selections, lookup);
  const toBuy: ConsolidatedLine[] = [];
  const inPantry: ShoppingResult['inPantry'] = [];
  for (const line of lines) {
    if (pantry.has(line.ingredientId)) {
      const have = pantry.get(line.ingredientId);
      if (have == null || line.toTaste || have >= line.qty) {
        inPantry.push({ ...line, pantryQty: have });
        continue;
      }
      // quantité partielle disponible → acheter le complément
      toBuy.push({ ...line, qty: line.qty - have });
      continue;
    }
    // ingrédients de base « au goût » (sel, poivre…) sans garde-manger : on les rappelle quand même
    toBuy.push(line);
  }

  // Anti-gaspillage : conditionnements partiellement utilisés
  const selectedIds = new Set(selections.map((s) => s.recipe.id));
  const leftovers: LeftoverWarning[] = [];
  for (const line of toBuy) {
    const ing = lookup(line.ingredientId);
    if (!ing?.packageSize || line.toTaste || ing.staple) continue;
    // seuls les produits frais périssables posent un vrai risque de gaspillage
    if (!PERISHABLE.has(ing.category)) continue;
    const pkg = ing.packageSize;
    const packs = Math.max(1, Math.ceil(line.qty / pkg - 0.02));
    const leftover = packs * pkg - line.qty;
    if (leftover / pkg < 0.4) continue;
    if (ing.unit === 'g' && leftover < 60) continue;
    if (ing.unit === 'ml' && leftover < 80) continue;
    const suggestions = library
      .filter((r) => !selectedIds.has(r.id) && r.ingredients.some((x) => x.id === ing.id && x.unit !== 'au-gout'))
      .map((r) => {
        const ri = r.ingredients.find((x) => x.id === ing.id)!;
        const std = toStandard(ri.qty, ri.unit, ing);
        const used = std?.qty ?? 0;
        return { r, fit: Math.abs(used - leftover) / leftover };
      })
      .sort((a, b) => a.fit - b.fit)
      .slice(0, 3)
      .map((x) => x.r);
    leftovers.push({
      ingredientId: ing.id,
      label: ing.name,
      needed: line.qty,
      packageSize: pkg,
      leftover,
      unit: ing.unit,
      suggestions,
    });
  }

  leftovers.sort((a, b) => b.leftover / b.packageSize - a.leftover / a.packageSize);
  leftovers.splice(8);
  toBuy.sort((a, b) => AISLES[a.aisle].order - AISLES[b.aisle].order || a.label.localeCompare(b.label, 'fr'));
  return { toBuy, inPantry, leftovers };
}

/** Transforme le résultat en lignes persistables (cochables) */
export function toShoppingItems(lines: ConsolidatedLine[], previous: ShoppingItem[]): ShoppingItem[] {
  const prev = new Map(previous.map((p) => [p.key, p]));
  return lines.map((l) => {
    const old = prev.get(l.ingredientId);
    return {
      key: l.ingredientId,
      ingredientId: l.ingredientId,
      label: l.label,
      qty: l.toTaste ? 0 : l.qty,
      unit: l.toTaste ? 'autre' : l.unit,
      aisle: l.aisle,
      checked: old?.checked ?? false,
      recipes: l.recipes,
      note: [l.toTaste ? 'au goût' : '', ...l.extras].filter(Boolean).join(' + ') || undefined,
    };
  });
}

export function itemQtyLabel(item: ShoppingItem, pieceWeight?: number): string {
  if (item.unit === 'autre') return item.note ?? '';
  const main = formatStandard(item.qty, item.unit);
  if (item.unit === 'g' && pieceWeight && pieceWeight >= 40 && item.qty >= pieceWeight * 0.8) {
    const n = Math.max(1, Math.round(item.qty / pieceWeight));
    return `${main} (≈ ${n} pièce${n > 1 ? 's' : ''})`;
  }
  return main;
}

/** Export texte (partage / copier-coller) */
export function shoppingToText(items: ShoppingItem[], lookup: IngredientLookup): string {
  const byAisle = new Map<ShoppingAisle, ShoppingItem[]>();
  for (const it of items) (byAisle.get(it.aisle) ?? byAisle.set(it.aisle, []).get(it.aisle)!).push(it);
  const parts: string[] = ['🛒 Liste de courses'];
  for (const [aisle, list] of [...byAisle.entries()].sort((a, b) => AISLES[a[0]].order - AISLES[b[0]].order)) {
    parts.push('', `${AISLES[aisle].emoji} ${AISLES[aisle].label}`);
    for (const it of list) {
      const ing = it.ingredientId ? lookup(it.ingredientId) : undefined;
      const q = ing && it.unit !== 'autre' && it.qty ? purchaseFor(ing, it.qty).text : itemQtyLabel(it, ing?.pieceWeight);
      parts.push(`${it.checked ? '☑' : '☐'} ${it.label}${q ? ` — ${q}` : ''}`);
    }
  }
  return parts.join('\n');
}

/** Coût estimé d'une portion (€), d'après les prix moyens de src/config/formats.ts */
export function recipeCost(recipe: IndexedRecipe, lookup: IngredientLookup): number {
  let c = 0;
  for (const ri of recipe.ingredients) {
    const ing = lookup(ri.id);
    if (!ing || ing.staple || ri.unit === 'au-gout') continue;
    const std = toStandard(ri.qty, ri.unit, ing);
    if (std) c += costOf(ing, std.qty);
  }
  return c / Math.max(1, recipe.servings);
}
