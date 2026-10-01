import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLibrary, useUserData } from '../hooks/library';
import { RecipeCard } from '../components/RecipeCard';
import { FiltersPanel } from '../components/FiltersPanel';
import { Empty, SearchInput, Sheet, useDebounced, useProgressive } from '../components/ui';
import { countActiveFilters, EMPTY_FILTERS, searchRecipes, type Filters, type SortKey } from '../domain/search';
import { matchRecipes } from '../domain/matching';
import { matchBoolean, parseIngredientQuery, describeQuery } from '../domain/ingredientQuery';
import { MEAL_TYPES } from '../domain/labels';
import type { MealType } from '../domain/types';

const FILTER_KEY = 'cuisine.filters';

function loadFilters(): Filters {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    return raw ? { ...EMPTY_FILTERS, ...JSON.parse(raw) } : EMPTY_FILTERS;
  } catch {
    return EMPTY_FILTERS;
  }
}

const EXAMPLES = ['saumon', 'pommes de terre', 'dîner rapide', 'italien', 'œufs fromage', 'foie', 'week-end', 'agneau', 'kéfir'];

export function Recipes() {
  const { recipes, lookup, ingredients } = useLibrary();
  const { favorites, fridge, pantry } = useUserData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [sort, setSort] = useState<SortKey>((params.get('sort') as SortKey) ?? 'pertinence');
  const [showFilters, setShowFilters] = useState(false);
  const dq = useDebounced(q, 120);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      /* stockage indisponible */
    }
  }, [filters]);
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (dq) next.set('q', dq);
    else next.delete('q');
    next.delete('focus');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const { results, parsed, boolLabel } = useMemo(() => {
    // « saumon ou bœuf et patates », « œufs sans lardons » → recherche booléenne sur les ingrédients
    if (/ (ou|sans) /i.test(` ${dq} `)) {
      const b = parseIngredientQuery(dq, ingredients);
      if (!b.unknown.length && b.query.groups.length) {
        const base = searchRecipes(recipes, '', filters, favorites, sort);
        const ok = new Set(matchBoolean(base.results, b.query).map((m) => m.recipe.id));
        return { results: base.results.filter((r) => ok.has(r.id)), parsed: base.parsed, boolLabel: describeQuery(b.query) };
      }
    }
    const res = { ...searchRecipes(recipes, dq, filters, favorites, sort), boolLabel: '' };
    if (filters.maxMissing == null) return res;
    const available = new Set([...fridge, ...pantry]);
    const matches = matchRecipes(res.results, new Set(), available, lookup);
    const ok = new Set(matches.filter((m) => m.missing.length + m.missingMinor.length <= filters.maxMissing!).map((m) => m.recipe.id));
    return { ...res, results: res.results.filter((r) => ok.has(r.id)) };
  }, [recipes, dq, filters, favorites, sort, fridge, pantry, lookup, ingredients]);

  const { visible, sentinel } = useProgressive(results, 24);
  const active = countActiveFilters(filters);

  return (
    <div className="page">
      <h1>🍽️ Toutes les recettes</h1>
      <div className="sticky-bar stack" style={{ gap: 10 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Nom, ingrédient, cuisine… ex. « dîner rapide »" autoFocus={params.get('focus') === '1'} />
        <div className="chips scroll">
          <button className={`chip ${active ? 'on' : ''}`} onClick={() => setShowFilters(true)}>
            ⚙️ Filtres{active ? ` (${active})` : ''}
          </button>
          {(Object.keys(MEAL_TYPES) as MealType[]).map((m) => (
            <button
              key={m}
              className={`chip ${filters.meals.includes(m) ? 'on' : ''}`}
              onClick={() => setFilters({ ...filters, meals: filters.meals.includes(m) ? filters.meals.filter((x) => x !== m) : [...filters.meals, m] })}
            >
              {MEAL_TYPES[m].emoji} {MEAL_TYPES[m].label}
            </button>
          ))}
          <button className={`chip ${filters.maxTime === 30 ? 'on' : ''}`} onClick={() => setFilters({ ...filters, maxTime: filters.maxTime === 30 ? undefined : 30, longOnly: false })}>
            ⚡ &lt; 30 min
          </button>
          <button className={`chip ${filters.favoritesOnly ? 'on' : ''}`} onClick={() => setFilters({ ...filters, favoritesOnly: !filters.favoritesOnly })}>
            ❤️ Favoris
          </button>
        </div>
      </div>

      <div className="row between" style={{ margin: '6px 0 14px' }}>
        <div className="small muted">
          <strong style={{ color: 'var(--ink)' }}>{results.length}</strong> recette{results.length > 1 ? 's' : ''}
          {boolLabel && <span className="tag primary" style={{ marginLeft: 4 }}>{boolLabel}</span>}
          {parsed.recognized.length > 0 && <> · compris : {parsed.recognized.map((w) => <span key={w} className="tag primary" style={{ marginLeft: 4 }}>{w}</span>)}</>}
        </div>
        <select className="select" style={{ width: 'auto', minHeight: 38 }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Trier">
          <option value="pertinence">Pertinence</option>
          <option value="temps">Plus rapides</option>
          <option value="proteines">Plus protéinées</option>
          <option value="calories">Plus caloriques</option>
          <option value="recent">Plus récentes</option>
          <option value="nom">A → Z</option>
        </select>
      </div>

      {!dq && !active && (
        <div className="chips" style={{ marginBottom: 14 }}>
          <span className="small muted">Essayez :</span>
          {EXAMPLES.map((e) => (
            <button key={e} className="chip" onClick={() => setQ(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {results.length === 0 ? (
        <Empty emoji="🔍" title="Aucune recette ne correspond">
          <p>Essayez d’enlever un filtre ou un mot-clé.</p>
          <button className="btn" onClick={() => { setQ(''); setFilters(EMPTY_FILTERS); }}>
            Tout réinitialiser
          </button>
        </Empty>
      ) : (
        <div className="grid-cards">
          {visible.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
      {sentinel}

      {showFilters && (
        <Sheet
          title="Filtres"
          onClose={() => setShowFilters(false)}
          footer={
            <div className="row nowrap">
              <button className="btn" onClick={() => setFilters(EMPTY_FILTERS)}>
                Réinitialiser
              </button>
              <button className="btn primary grow" onClick={() => setShowFilters(false)}>
                Voir {results.length} recette{results.length > 1 ? 's' : ''}
              </button>
            </div>
          }
        >
          <FiltersPanel value={filters} onChange={setFilters} showAvailability />
        </Sheet>
      )}
    </div>
  );
}
