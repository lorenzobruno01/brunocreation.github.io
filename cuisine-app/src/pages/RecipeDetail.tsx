import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLibrary, useUserData } from '../hooks/library';
import { RecipeVisual } from '../components/RecipeVisual';
import { RecipeCard } from '../components/RecipeCard';
import { Empty, ServingsControl, Sheet, useToast } from '../components/ui';
import { formatDuration, relativeDays } from '../components/format';
import { CATEGORIES, CUISINES, DIFFICULTIES, MEAL_TYPES, SEASONS, TECHNIQUES, PROTEINS } from '../domain/labels';
import { ingredientLine } from '../domain/units';
import { db, deleteRecipe, markCooked, saveRecipe, toggleBasket, toggleFavorite } from '../db/db';
import { findSimilar } from '../domain/similarity';
import { equivalentsOf } from '../domain/matching';
import { checkPhilosophy } from '../domain/philosophy';
import { AddToPlanSheet } from '../components/AddToPlanSheet';
import { AiRecipeActions } from '../components/AiRecipeActions';
import { NutritionPanel } from '../components/NutritionPanel';
import type { IndexedRecipe } from '../domain/types';

export function RecipeDetail() {
  const { id } = useParams();
  const { byId, recipes, lookup, seedIds } = useLibrary();
  const { favorites, basket, pantry, fridge, settings } = useUserData();
  const recipe = id ? byId.get(id) : undefined;
  const [servings, setServings] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [planOpen, setPlanOpen] = useState(false);
  const [subFor, setSubFor] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  const history = useLiveQuery(() => (id ? db.history.where('recipeId').equals(id).reverse().sortBy('date') : []), [id]) ?? [];

  const similar = useMemo(() => (recipe ? findSimilar(recipe, recipes, 6, 0.3) : []), [recipe, recipes]);

  if (!recipe) return <Empty emoji="🤷" title="Recette introuvable"><Link className="btn" to="/recettes">Retour à la bibliothèque</Link></Empty>;

  const n = servings ?? (basket.get(recipe.id) || settings.defaultServings);
  const factor = n / recipe.servings;
  const fav = favorites.has(recipe.id);
  const inBasket = basket.has(recipe.id);
  const cuisine = CUISINES[recipe.cuisine];
  const diff = DIFFICULTIES[recipe.difficulty];
  const available = new Set([...pantry, ...fridge]);
  const issues = recipe.source !== 'seed' ? checkPhilosophy(recipe, lookup) : [];

  const toggleCheck = (i: number) => {
    const next = new Set(checked);
    next.has(i) ? next.delete(i) : next.add(i);
    setChecked(next);
  };

  const duplicate = async () => {
    const copy = { ...stripIndex(recipe), id: `${recipe.id}-variante-${Date.now().toString(36)}`, name: `${recipe.name} (ma version)`, source: 'user' as const, createdAt: new Date().toISOString() };
    await saveRecipe(copy);
    navigate(`/modifier/${copy.id}`);
  };

  return (
    <div className="page">
      <div className="two-cols">
        <div className="sticky-col stack">
          <div className="recipe-hero card" style={{ position: 'relative' }}>
            <RecipeVisual recipe={recipe} />
            <button className="fav-btn" onClick={() => toggleFavorite(recipe.id)} aria-label="Favori">
              {fav ? '❤️' : '🤍'}
            </button>
          </div>
          <div>
            <div className="row small muted" style={{ marginBottom: 4 }}>
              <span>{cuisine.emoji} {cuisine.label}</span>·<span>{CATEGORIES[recipe.category].label}</span>·
              <span>{recipe.mealTypes.map((m) => MEAL_TYPES[m].label).join(', ')}</span>
            </div>
            <h1>{recipe.name}</h1>
            <p style={{ margin: '0 0 12px', color: 'var(--ink-2)' }}>{recipe.description}</p>
          </div>
          <div className="facts">
            <Fact v={formatDuration(recipe.totalTime)} l={`⏱ ${recipe.prepTime} min actif`} />
            <Fact v={`${recipe.servings}`} l="👥 portions (base)" />
            <Fact v={diff.label} l="⭐ difficulté" />
            <Fact v={`${recipe.nutrition.kcal}`} l="🔥 kcal / portion" />
            <Fact v={`${recipe.nutrition.protein} g`} l="🥩 protéines" />
            <Fact v={`${recipe.nutrition.carbs} / ${recipe.nutrition.fat} g`} l="glucides / lipides" />
          </div>
          {recipe.restTime ? <div className="callout info small">⏳ Prévoir {formatDuration(recipe.restTime)} de repos / marinade en plus.</div> : null}

          <Link to={`/recette/${recipe.id}/cuisine?p=${n}`} className="btn primary lg block">
            👨‍🍳 Commencer à cuisiner
          </Link>
          <div className="action-bar">
            <button className={`btn ${inBasket ? 'olive' : ''}`} onClick={() => toggleBasket(recipe.id, n).then(() => toast(inBasket ? 'Retirée de la sélection' : `Ajoutée à la sélection courses (${n} pers.)`))}>
              {inBasket ? '✓ Dans la sélection' : '🛒 Ajouter aux courses'}
            </button>
            <button className="btn" onClick={() => setPlanOpen(true)}>
              📅 Planifier
            </button>
            <button
              className="btn"
              onClick={async () => {
                await markCooked(recipe.id);
                toast('Ajoutée à l’historique 🕒');
              }}
            >
              ✅ J’ai cuisiné ce plat
            </button>
            <button className="btn" onClick={() => toggleFavorite(recipe.id)}>
              {fav ? '💔 Retirer' : '❤️ Favori'}
            </button>
          </div>
          {history.length > 0 && (
            <div className="small muted">🕒 Cuisinée {history.length} fois — dernière fois {relativeDays(history[0].date)}.</div>
          )}
        </div>

        <div className="stack" style={{ gap: 18 }}>
          {issues.length > 0 && (
            <div className="callout">
              <strong>Contrôle « philosophie alimentaire »</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {issues.map((i, k) => (
                  <li key={k} className="small">{i.message}</li>
                ))}
              </ul>
            </div>
          )}
          <section className="card pad">
            <div className="row between" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>Ingrédients</h2>
              <ServingsControl value={n} onChange={setServings} />
            </div>
            <ul className="ing-list">
              {recipe.ingredients.map((ri, i) => {
                const ing = lookup(ri.id);
                if (!ing) return null;
                const has = available.has(ri.id);
                const eq = equivalentsOf(ri.id);
                return (
                  <li key={i} className={checked.has(i) ? 'done' : ''} onClick={() => toggleCheck(i)}>
                    <span className="checkbox">{checked.has(i) ? '✓' : ''}</span>
                    <span className="grow">
                      <span className="it">
                        {ing.emoji} {ingredientLine(ri.qty * factor, ri.unit, ing)}
                      </span>
                      {ri.note && <span className="muted small"> — {ri.note}</span>}
                      {ri.optional && <span className="tag" style={{ marginLeft: 6 }}>facultatif</span>}
                      {has && <span className="tag ok" style={{ marginLeft: 6 }}>chez moi</span>}
                    </span>
                    {(eq.length > 0 || settings.apiKey) && !ing.staple && (
                      <button
                        className="btn ghost sm"
                        title="Remplacer cet ingrédient"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSubFor(ri.id);
                        }}
                      >
                        ⇄
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card pad">
            <h2>Préparation</h2>
            <ol className="steps">
              {recipe.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {recipe.tips && <div className="callout info">💡 {recipe.tips}</div>}
          </section>

          <section className="card pad stack" style={{ gap: 8 }}>
            <div className="chips">
              {recipe.tags.map((t) => (
                <Link key={t} to={`/recettes?q=${encodeURIComponent(t)}`} className="tag" style={{ textDecoration: 'none' }}>
                  #{t}
                </Link>
              ))}
            </div>
            <div className="small muted">
              Technique : {TECHNIQUES[recipe.technique].label}
              {recipe.mainProtein && <> · Protéine : {PROTEINS[recipe.mainProtein].label}</>}
              {' · '}Saison : {recipe.seasons.length ? recipe.seasons.map((s) => SEASONS[s].label).join(', ') : 'toute l’année'}
              {' · '}
              {recipe.source === 'ai' ? '✨ générée par l’IA' : recipe.source === 'user' ? '✍️ ajoutée par vous' : '📚 bibliothèque'}
            </div>
            <div className="row">
              <Link to={`/modifier/${recipe.id}`} className="btn sm">
                ✏️ Modifier
              </Link>
              <button className="btn sm" onClick={duplicate}>
                📄 Créer ma variante
              </button>
              <button
                className="btn sm danger"
                onClick={async () => {
                  if (!confirm(`Supprimer « ${recipe.name} » de la bibliothèque ?`)) return;
                  await deleteRecipe(recipe.id, seedIds.has(recipe.id));
                  toast('Recette supprimée');
                  navigate('/recettes');
                }}
              >
                🗑 Supprimer
              </button>
            </div>
          </section>

          <NutritionPanel recipe={recipe} />

          <AiRecipeActions recipe={recipe} servings={n} />

          {similar.length > 0 && (
            <section>
              <h2>Dans le même esprit</h2>
              <div className="hscroll">
                {similar.map((s) => (
                  <RecipeCard key={s.recipe.id} recipe={s.recipe} compact />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {planOpen && <AddToPlanSheet recipe={recipe} servings={n} onClose={() => setPlanOpen(false)} />}
      {subFor && <SubstituteSheet recipe={recipe} ingredientId={subFor} onClose={() => setSubFor(null)} />}
    </div>
  );
}

function Fact({ v, l }: { v: string; l: string }) {
  return (
    <div className="fact">
      <div className="fv">{v}</div>
      <div className="fl">{l}</div>
    </div>
  );
}

export function stripIndex(r: IndexedRecipe) {
  const { totalTime: _t, nutrition: _n, proteins: _p, mainProtein: _m, starches: _s, vegetables: _v, fruits: _f, mainIngredientIds: _mi, searchText: _st, ...rest } = r;
  return rest;
}

/** Substitution locale (équivalents connus) — l'IA propose des alternatives plus créatives */
function SubstituteSheet({ recipe, ingredientId, onClose }: { recipe: IndexedRecipe; ingredientId: string; onClose: () => void }) {
  const { lookup } = useLibrary();
  const navigate = useNavigate();
  const toast = useToast();
  const ing = lookup(ingredientId)!;
  const eq = equivalentsOf(ingredientId).map(lookup).filter(Boolean);
  const replace = async (newId: string) => {
    const base = stripIndex(recipe);
    const repl = lookup(newId)!;
    const copy = {
      ...base,
      id: `${recipe.id}-${newId}`.slice(0, 80),
      name: `${recipe.name} (${repl.name})`,
      source: 'user' as const,
      createdAt: new Date().toISOString(),
      ingredients: base.ingredients.map((ri) => (ri.id === ingredientId ? { ...ri, id: newId, note: [ri.note, `à la place de : ${ing.name}`].filter(Boolean).join(' — ') } : ri)),
    };
    await saveRecipe(copy);
    toast('Variante enregistrée');
    onClose();
    navigate(`/recette/${copy.id}`);
  };
  return (
    <Sheet title={`Remplacer : ${ing.name}`} onClose={onClose}>
      {eq.length > 0 ? (
        <div className="stack">
          <p className="small muted">Substituts directs (même usage en cuisine). Une variante de la recette sera créée.</p>
          {eq.map((e) => (
            <button key={e!.id} className="btn block" onClick={() => replace(e!.id)}>
              {e!.emoji} {e!.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">Pas de substitut direct connu. Utilisez l’assistant IA ci-dessous (« Je n’ai pas de… ») pour une adaptation complète.</p>
      )}
    </Sheet>
  );
}
