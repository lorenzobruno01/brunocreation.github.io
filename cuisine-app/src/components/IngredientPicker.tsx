import { useMemo, useState } from 'react';
import { searchIngredients, useLibrary } from '../hooks/library';
import { INGREDIENT_CATEGORIES } from '../domain/labels';
import type { IngredientCategory } from '../domain/types';
import { SearchInput } from './ui';

/** Sauces : celles qu'on fait maison ou qu'on trouve sans huile de graines ni sucre ajouté */
const SAUCES = ['tomates-concassees', 'concentre-tomate', 'pesto', 'mayonnaise', 'creme-fraiche', 'lait-coco', 'moutarde', 'sauce-soja', 'harissa', 'tahini', 'pate-curry', 'sauce-poisson', 'vinaigre-balsamique'];
const SAUCE_LABEL: Record<string, string> = { 'tomates-concassees': 'Sauce tomate / coulis / tomates concassées' };

/** Sélecteur d'ingrédients : recherche instantanée + catégories + tuiles cochables */
export function IngredientPicker({
  selected,
  onToggle,
  marked,
  markedLabel,
  usage,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** ingrédients à mettre en évidence (ex. garde-manger) */
  marked?: Set<string>;
  markedLabel?: string;
  /** nb de recettes utilisant chaque ingrédient (tri par popularité) */
  usage?: Map<string, number>;
}) {
  const { ingredients } = useLibrary();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<IngredientCategory | 'populaires' | 'choisis' | 'sauces'>('populaires');

  const visible = useMemo(() => {
    if (q.trim()) return searchIngredients(q, ingredients, 60);
    const list = ingredients.filter((i) => i.id !== 'eau' && i.id !== 'sel' && i.id !== 'poivre');
    if (cat === 'choisis') return list.filter((i) => selected.has(i.id));
    if (cat === 'sauces') return SAUCES.map((id) => list.find((i) => i.id === id)).filter((i): i is (typeof list)[number] => !!i);
    if (cat === 'populaires') {
      return [...list]
        .sort((a, b) => (usage?.get(b.id) ?? 0) - (usage?.get(a.id) ?? 0))
        .slice(0, 48);
    }
    return list.filter((i) => i.category === cat).sort((a, b) => (usage?.get(b.id) ?? 0) - (usage?.get(a.id) ?? 0));
  }, [q, cat, ingredients, selected, usage]);

  const cats = Object.keys(INGREDIENT_CATEGORIES) as IngredientCategory[];

  return (
    <div className="stack">
      <SearchInput value={q} onChange={setQ} placeholder="Chercher un ingrédient… ex. « cour »" />
      {!q && (
        <div className="chips scroll">
          <button className={`chip ${cat === 'populaires' ? 'on' : ''}`} onClick={() => setCat('populaires')}>
            ⭐ Les plus utilisés
          </button>
          {selected.size > 0 && (
            <button className={`chip olive ${cat === 'choisis' ? 'on' : ''}`} onClick={() => setCat('choisis')}>
              ✓ Sélectionnés ({selected.size})
            </button>
          )}
          <button className={`chip ${cat === 'sauces' ? 'on' : ''}`} onClick={() => setCat('sauces')}>
            🥫 Sauces
          </button>
          {cats.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
              {INGREDIENT_CATEGORIES[c].emoji} {INGREDIENT_CATEGORIES[c].label}
            </button>
          ))}
        </div>
      )}
      <div className="ing-grid">
        {visible.map((i) => {
          const on = selected.has(i.id);
          const mk = marked?.has(i.id);
          return (
            <button
              key={i.id}
              className={`ing-tile ${on ? 'on' : ''} ${mk && !on ? 'pantry' : ''}`}
              onClick={() => onToggle(i.id)}
              aria-pressed={on}
              title={mk ? markedLabel : undefined}
            >
              <span className="ie">{i.emoji ?? '•'}</span>
              <span>{SAUCE_LABEL[i.id] ?? capital(i.plural && i.unit === 'piece' ? i.plural : i.name)}</span>
              {mk && <span className="tag" style={{ fontSize: '0.65rem' }}>{markedLabel}</span>}
            </button>
          );
        })}
      </div>
      {visible.length === 0 && <p className="muted center">Aucun ingrédient trouvé.</p>}
    </div>
  );
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
