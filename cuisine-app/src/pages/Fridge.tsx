import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary, useUserData } from '../hooks/library';
import { IngredientPicker } from '../components/IngredientPicker';
import { RecipeCard } from '../components/RecipeCard';
import { Empty, useProgressive } from '../components/ui';
import { filterByMode, matchRecipes, availableCount, type MatchMode, type MatchResult } from '../domain/matching';
import { setFridge } from '../db/db';
import { LeftoversCard } from '../components/Leftovers';
import { MEAL_TYPES } from '../domain/labels';
import type { MealType } from '../domain/types';

export function Fridge() {
  const { recipes, lookup } = useLibrary();
  const { fridge, pantry } = useUserData();
  const [mode, setMode] = useState<MatchMode>('tout');
  const [usePantry, setUsePantry] = useState(true);
  const [meal, setMeal] = useState<MealType | null>(null);
  const [tab, setTab] = useState<'choix' | 'resultats'>(fridge.size ? 'resultats' : 'choix');
  const [combo, setCombo] = useState<'tous' | 'un' | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recipes) for (const id of r.mainIngredientIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [recipes]);

  const toggle = (id: string) => {
    const next = new Set(fridge);
    next.has(id) ? next.delete(id) : next.add(id);
    setFridge([...next]);
  };

  const all = useMemo(() => {
    if (!fridge.size) return [];
    const pool = meal ? recipes.filter((r) => r.mealTypes.includes(meal)) : recipes;
    return matchRecipes(pool, fridge, usePantry ? pantry : new Set(), lookup);
  }, [recipes, fridge, pantry, usePantry, lookup, meal]);

  // « tous mes ingrédients » par défaut dès 2 ingrédients cochés
  const together = (combo ?? (fridge.size >= 2 ? 'tous' : 'un')) === 'tous';
  const withAll = useMemo(() => all.filter((m) => m.covered >= fridge.size), [all, fridge.size]);
  const base = together ? withAll : all;
  const counts = useMemo(
    () => ({ maintenant: filterByMode(base, 'maintenant').length, presque: filterByMode(base, 'presque').length, tout: base.length }),
    [base],
  );
  const results = useMemo(() => filterByMode(base, mode), [base, mode]);
  const names = [...fridge].map((id) => lookup(id)?.name).filter(Boolean) as string[];
  const { visible, sentinel } = useProgressive(results, 24);

  return (
    <div className="page">
      <h1>🥕 J’ai ces ingrédients</h1>
      <p className="muted" style={{ marginTop: -4 }}>
        Sélectionnez ce que vous avez sous la main : les recettes réalisables apparaissent, classées par compatibilité.
      </p>

      <div className="sticky-bar">
        <div className="row between">
          <div className="segmented grow" style={{ maxWidth: 560 }}>
            <button className={tab === 'choix' ? 'on' : ''} onClick={() => setTab('choix')}>
              🧺 Mes ingrédients
              <span className="cnt">{fridge.size} sélectionné{fridge.size > 1 ? 's' : ''}</span>
            </button>
            <button className={tab === 'resultats' ? 'on' : ''} onClick={() => setTab('resultats')} disabled={!fridge.size}>
              🍽️ Recettes
              <span className="cnt">{counts.tout} correspondance{counts.tout > 1 ? 's' : ''}</span>
            </button>

          </div>
          {fridge.size > 0 && (
            <button className="btn sm ghost" onClick={() => setFridge([])}>
              Tout effacer
            </button>
          )}
        </div>
      </div>

      {fridge.size > 0 && (
        <div className="chips" style={{ margin: '4px 0 12px' }}>
          {[...fridge].map((id) => {
            const i = lookup(id);
            return i ? (
              <button key={id} className="chip olive on" onClick={() => toggle(id)}>
                {i.emoji} {i.name} <span className="x">✕</span>
              </button>
            ) : null;
          })}
        </div>
      )}

      <LeftoversCard fridge={fridge} />

      {tab === 'choix' ? (
        <>
          <IngredientPicker selected={fridge} onToggle={toggle} marked={pantry} markedLabel="placard" usage={usage} />
          {fridge.size > 0 && (
            <div style={{ position: 'sticky', bottom: 'calc(var(--tabbar-h) + 12px)', marginTop: 16 }}>
              <button className="btn primary lg block" onClick={() => setTab('resultats')} style={{ boxShadow: 'var(--shadow-lg)' }}>
                {fridge.size >= 2 ? `Voir les ${withAll.length} recettes avec tous ces ingrédients →` : `Voir les ${all.length} recettes →`}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {fridge.size >= 2 && (
            <div className="segmented" style={{ marginBottom: 10 }} role="group" aria-label="Ingrédients à utiliser">
              <button className={together ? 'on' : ''} onClick={() => setCombo('tous')}>
                🧺 Avec tous mes ingrédients<span className="cnt">{withAll.length} recette{withAll.length > 1 ? 's' : ''}</span>
              </button>
              <button className={!together ? 'on' : ''} onClick={() => setCombo('un')}>
                🔀 Avec au moins un<span className="cnt">{all.length} recette{all.length > 1 ? 's' : ''}</span>
              </button>
            </div>
          )}
          <div className="chips scroll" style={{ marginBottom: 10 }}>
            <button className={`chip ${mode === 'tout' ? 'on' : ''}`} onClick={() => setMode('tout')}>
              👀 Toutes ({counts.tout})
            </button>
            <button className={`chip ${mode === 'maintenant' ? 'on' : ''}`} onClick={() => setMode('maintenant')}>
              ✅ Sans rien acheter ({counts.maintenant})
            </button>
            <button className={`chip ${mode === 'presque' ? 'on' : ''}`} onClick={() => setMode('presque')}>
              🛒 Il manque 1 ou 2 choses ({counts.presque})
            </button>
          </div>
          <div className="chips scroll" style={{ marginBottom: 12 }}>
            <button className={`chip ${usePantry ? 'olive on' : ''}`} onClick={() => setUsePantry(!usePantry)}>
              🏠 Inclure le garde-manger ({pantry.size})
            </button>
            <button className={`chip ${meal == null ? 'on' : ''}`} onClick={() => setMeal(null)}>
              Tous les repas
            </button>
            {(Object.keys(MEAL_TYPES) as MealType[]).map((m) => (
              <button key={m} className={`chip ${meal === m ? 'on' : ''}`} onClick={() => setMeal(meal === m ? null : m)}>
                {MEAL_TYPES[m].emoji} {MEAL_TYPES[m].label}
              </button>
            ))}
          </div>
          {pantry.size === 0 && (
            <div className="callout info small" style={{ marginBottom: 12 }}>
              💡 Renseignez votre <Link to="/garde-manger">garde-manger</Link> (huile, beurre, riz, farine, épices…) : ces ingrédients seront comptés comme disponibles.
            </div>
          )}
          {results.length === 0 ? (
            <Empty emoji="🧐" title={together && !withAll.length ? `Aucune recette avec à la fois ${names.join(', ')}` : mode === 'maintenant' ? 'Rien de réalisable sans courses pour l’instant' : 'Aucune recette'}>
              {together && !withAll.length && all.length > 0 && (
                <button className="btn primary" onClick={() => setCombo('un')}>
                  Voir les {all.length} recettes avec au moins un de ces ingrédients
                </button>
              )}
              {mode !== 'tout' && counts.tout > 0 && (
                <button className="btn" onClick={() => setMode('tout')}>
                  Voir les {counts.tout} recettes, même s’il manque des ingrédients
                </button>
              )}
            </Empty>
          ) : (
            <div className="grid-cards">
              {visible.map((m) => (
                <MatchCard key={m.recipe.id} m={m} />
              ))}
            </div>
          )}
          {sentinel}
        </>
      )}
    </div>
  );
}

function MatchCard({ m }: { m: MatchResult }) {
  const { lookup } = useLibrary();
  const avail = availableCount(m);
  const full = m.missing.length + m.missingMinor.length === 0;
  const level = full ? 'full' : avail / m.total >= 0.6 ? 'partial' : 'low';
  const text = full ? '🟢 100 % disponible' : `${level === 'partial' ? '🟡' : '⚪'} ${avail}/${m.total} ingrédients`;
  const missing = [...m.missing, ...m.missingMinor].map((id) => lookup(id)?.name).filter(Boolean);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <RecipeCard recipe={m.recipe} badge={{ text, level }} />
      {(missing.length > 0 || m.substitutes.length > 0) && (
        <div className="small" style={{ padding: '0 6px' }}>
          {missing.length > 0 && (
            <div>
              <strong>Manque :</strong> {missing.join(', ')}
            </div>
          )}
          {m.substitutes.map((s) => (
            <div key={s.need} className="muted">
              ⇄ {lookup(s.have)?.name} au lieu de {lookup(s.need)?.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
