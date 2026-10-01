import { useMemo, useState } from 'react';
import { useLibrary, useUserData } from '../hooks/library';
import { searchRecipes, EMPTY_FILTERS, type Filters } from '../domain/search';
import { Sheet, SearchInput, useDebounced } from './ui';
import type { IndexedRecipe, MealType } from '../domain/types';
import { CUISINES } from '../domain/labels';
import { formatDuration } from './format';

export function RecipePicker({ title, meals, onPick, onClose }: { title: string; meals?: MealType[]; onPick: (r: IndexedRecipe) => void; onClose: () => void }) {
  const { recipes } = useLibrary();
  const { favorites } = useUserData();
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const dq = useDebounced(q, 100);
  const results = useMemo(() => {
    const f: Filters = { ...EMPTY_FILTERS, meals: meals ?? [], favoritesOnly: onlyFav };
    return searchRecipes(recipes, dq, f, favorites).results.slice(0, 80);
  }, [recipes, dq, meals, onlyFav, favorites]);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher une recette…" autoFocus />
        <div className="chips">
          <button className={`chip ${onlyFav ? 'on' : ''}`} onClick={() => setOnlyFav(!onlyFav)}>
            ❤️ Favoris
          </button>
        </div>
        <div className="menu-list">
          {results.map((r) => (
            <button key={r.id} onClick={() => onPick(r)}>
              <span className="mi">{r.emoji}</span>
              <span className="grow">
                {r.name}
                <span className="small muted" style={{ display: 'block', fontWeight: 600 }}>
                  {CUISINES[r.cuisine].emoji} ⏱ {formatDuration(r.totalTime)} · 🔥 {r.nutrition.kcal} kcal · 🥩 {r.nutrition.protein} g {favorites.has(r.id) ? '· ❤️' : ''}
                </span>
              </span>
            </button>
          ))}
          {results.length === 0 && <p className="muted center">Aucune recette.</p>}
        </div>
      </div>
    </Sheet>
  );
}
