import { useMemo } from 'react';
import { useLibrary, useUserData } from '../hooks/library';
import { IngredientPicker } from '../components/IngredientPicker';
import { db, togglePantry } from '../db/db';
import { INGREDIENT_CATEGORIES } from '../domain/labels';
import type { Ingredient, IngredientCategory } from '../domain/types';
import { useToast } from '../components/ui';

const PRESETS: Array<{ label: string; ids: string[] }> = [
  { label: '🧂 Kit de base', ids: ['sel', 'poivre', 'huile-olive', 'beurre', 'farine', 'sucre', 'miel', 'vinaigre-cidre', 'moutarde', 'ail', 'oignon'] },
  { label: '🌶️ Épices', ids: ['paprika', 'cumin', 'curcuma', 'cannelle', 'muscade', 'piment-espelette', 'garam-masala', 'ras-el-hanout', 'thym', 'laurier', 'origan', 'romarin', 'girofle', 'vanille'] },
  { label: '🍚 Placard', ids: ['riz-blanc', 'riz-rond', 'pates', 'flocons-avoine', 'semoule', 'sarrasin', 'polenta', 'tomates-concassees', 'concentre-tomate', 'levure-chimique', 'fecule-mais'] },
  { label: '🥢 Asie', ids: ['sauce-soja', 'huile-sesame', 'mirin', 'sauce-poisson', 'sesame', 'gingembre', 'miso'] },
  { label: '🧈 Graisses', ids: ['graisse-canard', 'beurre-clarifie', 'huile-coco'] },
];

export function Pantry() {
  const { lookup, recipes } = useLibrary();
  const { pantry } = useUserData();
  const toast = useToast();

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recipes) for (const ri of r.ingredients) m.set(ri.id, (m.get(ri.id) ?? 0) + 1);
    return m;
  }, [recipes]);

  const grouped = useMemo(() => {
    const g = new Map<IngredientCategory, Ingredient[]>();
    for (const id of pantry) {
      const i = lookup(id);
      if (i) (g.get(i.category) ?? g.set(i.category, []).get(i.category)!).push(i);
    }
    return [...g.entries()];
  }, [pantry, lookup]);

  const addPreset = async (ids: string[]) => {
    const now = new Date().toISOString();
    await db.pantry.bulkPut(ids.filter((id) => lookup(id)).map((ingredientId) => ({ ingredientId, addedAt: now })));
    toast('Ajoutés au garde-manger');
  };

  return (
    <div className="page">
      <h1>🏠 Ce que j’ai déjà</h1>
      <p className="muted" style={{ marginTop: -4 }}>
        Votre garde-manger : ces ingrédients sont retirés automatiquement des listes de courses et comptés comme disponibles dans « J’ai ces ingrédients ».
      </p>

      <div className="chips" style={{ marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <button key={p.label} className="chip" onClick={() => addPreset(p.ids)}>
            + {p.label}
          </button>
        ))}
      </div>

      {grouped.length > 0 && (
        <section className="card pad" style={{ marginBottom: 20 }}>
          <div className="row between">
            <h2 style={{ margin: 0 }}>{pantry.size} ingrédient{pantry.size > 1 ? 's' : ''} en stock</h2>
            <button
              className="btn sm ghost danger"
              onClick={async () => {
                if (confirm('Vider le garde-manger ?')) await db.pantry.clear();
              }}
            >
              Vider
            </button>
          </div>
          {grouped.map(([cat, list]) => (
            <div key={cat} style={{ marginTop: 10 }}>
              <div className="label">
                {INGREDIENT_CATEGORIES[cat].emoji} {INGREDIENT_CATEGORIES[cat].label}
              </div>
              <div className="chips" style={{ marginTop: 4 }}>
                {list.map((i) => (
                  <button key={i.id} className="chip olive on" onClick={() => togglePantry(i.id)}>
                    {i.emoji} {i.name} <span className="x">✕</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <h2>Ajouter des ingrédients</h2>
      <IngredientPicker selected={pantry} onToggle={togglePantry} usage={usage} />
    </div>
  );
}
