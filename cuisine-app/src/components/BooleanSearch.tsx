import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchIngredients, useLibrary, useUserData } from '../hooks/library';
import { describeQuery, matchBoolean, parseIngredientQuery, type IngGroup, type IngOption, type IngQuery } from '../domain/ingredientQuery';
import { RecipeCard } from './RecipeCard';
import { useDebounced, useProgressive, useToast } from './ui';
import { AiError, loadAi } from '../ai/light';
import { db, saveSettings } from '../db/db';
import { MEAL_TYPES } from '../domain/labels';
import type { IndexedRecipe, MealType } from '../domain/types';
import { indexRecipe } from '../domain/indexing';

const EXAMPLES = ['patates et saumon ou bœuf', 'œufs et fromage sans lardons', 'agneau ou veau et riz', 'poulet et courgette et citron', 'foie et pommes de terre'];

/** Recherche ET / OU / SANS sur les ingrédients, avec création automatique par l'IA si rien ne correspond */
export function BooleanSearch() {
  const { recipes, ingredients, lookup } = useLibrary();
  const { settings } = useUserData();
  const [text, setText] = useState('');
  const [query, setQuery] = useState<IngQuery>({ groups: [], exclude: [] });
  const [unknown, setUnknown] = useState<string[]>([]);
  const [adding, setAdding] = useState<{ group: number | 'new' | 'exclude' } | null>(null);
  const [meal, setMeal] = useState<MealType | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<IndexedRecipe | null>(null);
  const tried = useRef<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const dtext = useDebounced(text, 250);

  // Le texte libre construit la requête
  useEffect(() => {
    if (!dtext.trim()) return;
    const r = parseIngredientQuery(dtext, ingredients);
    setQuery(r.query);
    setUnknown(r.unknown);
  }, [dtext, ingredients]);

  const pool = useMemo(() => (meal ? recipes.filter((r) => r.mealTypes.includes(meal)) : recipes), [recipes, meal]);
  const results = useMemo(() => matchBoolean(pool, query), [pool, query]);
  const { visible, sentinel } = useProgressive(results, 24);
  const key = describeQuery(query) + '|' + (meal ?? '');
  const autoCreate = settings.autoCreate !== false;

  const create = async () => {
    if (!settings.apiKey || !query.groups.length) return;
    setError(null);
    setCreated(null);
    abort.current = new AbortController();
    const groupsText = query.groups
      .map((g) => (g.length > 1 ? `UN SEUL au choix parmi : ${g.map((o) => o.label).join(' / ')}` : g[0].label))
      .join(' ; ');
    const request = `Crée une recette ${meal ? `de type ${MEAL_TYPES[meal].label.toLowerCase()}` : 'de plat principal (déjeuner ou dîner)'} qui utilise OBLIGATOIREMENT, comme ingrédients importants : ${groupsText}.${
      query.exclude.length ? ` N'utilise PAS : ${query.exclude.map((o) => o.label).join(', ')}.` : ''
    } Ingrédients d'un même groupe « au choix » : n'en prendre qu'un. Elle doit être différente des recettes existantes.`;
    try {
      const { generateRecipes } = await loadAi();
      const res = await generateRecipes({
        apiKey: settings.apiKey,
        model: settings.model ?? 'claude-opus-5-5',
        request,
        count: 1,
        library: recipes,
        ingredients,
        lookup,
        signal: abort.current.signal,
        onStatus: setStatus,
      });
      // Garder la première recette valide qui respecte vraiment la requête
      const good = res.find((c) => c.status !== 'invalide' && c.status !== 'doublon' && matchBoolean([c.indexed], query).length > 0);
      if (!good) throw new AiError('L’IA n’a pas produit de recette respectant tous vos critères. Réessayez ou reformulez.');
      await db.recipes.put(good.recipe);
      setCreated(indexRecipe(good.recipe, lookup));
      toast('Nouvelle recette créée et ajoutée à la bibliothèque ✨');
    } catch (e) {
      setError(e instanceof AiError ? e.message : String(e));
    } finally {
      setStatus(null);
    }
  };

  // Aucune recette → création automatique (une fois par requête)
  useEffect(() => {
    if (!autoCreate || !settings.apiKey || status || !query.groups.length || results.length > 0 || unknown.length) return;
    if (tried.current.has(key)) return;
    tried.current.add(key);
    create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, results.length, autoCreate, settings.apiKey]);

  const setGroups = (groups: IngGroup[]) => setQuery({ ...query, groups: groups.filter((g) => g.length) });
  const removeOption = (gi: number, oi: number) => setGroups(query.groups.map((g, i) => (i === gi ? g.filter((_, j) => j !== oi) : g)));
  const addOption = (opt: IngOption) => {
    if (!adding) return;
    if (adding.group === 'new') setGroups([...query.groups, [opt]]);
    else if (adding.group === 'exclude') setQuery({ ...query, exclude: [...query.exclude, opt] });
    else setGroups(query.groups.map((g, i) => (i === adding.group ? [...g, opt] : g)));
    setAdding(null);
  };

  return (
    <div className="stack">
      <div className="card pad stack">
        <label className="label" htmlFor="bq">
          Écrivez votre recherche avec ET / OU / SANS
        </label>
        <input id="bq" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="ex. patates et saumon ou bœuf" autoComplete="off" />
        <div className="chips scroll">
          {EXAMPLES.map((e) => (
            <button key={e} className="chip" onClick={() => setText(e)}>
              {e}
            </button>
          ))}
        </div>
        {unknown.length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>Ingrédient non reconnu : {unknown.join(', ')}</div>}

        {/* Construction visuelle */}
        <div className="stack" style={{ gap: 8 }}>
          {query.groups.map((g, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="bool-op">ET</div>}
              <div className="bool-group">
                {g.map((o, oi) => (
                  <span key={oi} className="row nowrap" style={{ gap: 6 }}>
                    {oi > 0 && <span className="bool-or">OU</span>}
                    <button className="chip olive on" onClick={() => removeOption(gi, oi)} title={o.ids.map((id) => lookup(id)?.name).join(', ')}>
                      {o.label} <span className="x">✕</span>
                    </button>
                  </span>
                ))}
                <button className="chip" onClick={() => setAdding({ group: gi })}>
                  + ou…
                </button>
              </div>
            </div>
          ))}
          <div className="row">
            <button className="btn sm" onClick={() => setAdding({ group: 'new' })}>
              {query.groups.length ? '+ ET un autre ingrédient' : '+ Ajouter un ingrédient'}
            </button>
            <button className="btn sm" onClick={() => setAdding({ group: 'exclude' })}>
              🚫 SANS…
            </button>
            {(query.groups.length > 0 || query.exclude.length > 0) && (
              <button className="btn sm ghost" onClick={() => { setQuery({ groups: [], exclude: [] }); setText(''); }}>
                Effacer
              </button>
            )}
          </div>
          {query.exclude.length > 0 && (
            <div className="chips">
              <span className="bool-op">SANS</span>
              {query.exclude.map((o, i) => (
                <button key={i} className="chip on" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setQuery({ ...query, exclude: query.exclude.filter((_, j) => j !== i) })}>
                  {o.label} <span className="x">✕</span>
                </button>
              ))}
            </div>
          )}
          {adding && <OptionAdder onPick={addOption} onCancel={() => setAdding(null)} />}
        </div>
      </div>

      <div className="chips scroll">
        <button className={`chip ${meal == null ? 'on' : ''}`} onClick={() => setMeal(null)}>
          Tous les repas
        </button>
        {(Object.keys(MEAL_TYPES) as MealType[]).map((m) => (
          <button key={m} className={`chip ${meal === m ? 'on' : ''}`} onClick={() => setMeal(meal === m ? null : m)}>
            {MEAL_TYPES[m].emoji} {MEAL_TYPES[m].label}
          </button>
        ))}
      </div>

      {query.groups.length > 0 && (
        <div className="row between">
          <div className="small">
            <strong>{results.length}</strong> recette{results.length > 1 ? 's' : ''} pour <span className="tag primary">{describeQuery(query)}</span>
          </div>
          {settings.apiKey && results.length > 0 && !status && (
            <button className="btn sm" onClick={create}>
              ✨ Créer une nouvelle recette avec ça
            </button>
          )}
        </div>
      )}

      {status && (
        <div className="card pad row">
          <span className="spinner" />
          <span className="grow">Aucune recette existante : l’IA en crée une… {status}</span>
          <button className="btn sm ghost" onClick={() => abort.current?.abort()}>
            Annuler
          </button>
        </div>
      )}
      {error && <div className="callout danger small">{error}</div>}
      {created && (
        <div className="callout ok stack">
          <strong>✨ Nouvelle recette ajoutée définitivement à votre bibliothèque :</strong>
          <div style={{ maxWidth: 340 }}>
            <RecipeCard recipe={created} />
          </div>
          <button className="btn sm" onClick={() => navigate(`/recette/${created.id}`)}>
            Voir la recette
          </button>
        </div>
      )}

      {query.groups.length > 0 && results.length === 0 && !status && !created && (
        <div className="callout">
          Aucune recette de la bibliothèque ne contient « {describeQuery(query)} ».{' '}
          {!settings.apiKey ? (
            <>
              Ajoutez une clé API dans <Link to="/reglages">Réglages</Link> pour que l’assistant crée automatiquement une recette.
            </>
          ) : (
            <button className="btn sm primary" onClick={create}>
              ✨ Créer une recette
            </button>
          )}
        </div>
      )}

      <div className="grid-cards">
        {visible.map((m) => (
          <RecipeCard key={m.recipe.id} recipe={m.recipe} badge={{ text: `✓ ${[...new Set(m.matched)].join(' + ')}`, level: 'full' }} />
        ))}
      </div>
      {sentinel}

      {settings.apiKey && (
        <label className="row nowrap small muted">
          <input type="checkbox" checked={autoCreate} onChange={(e) => saveSettings({ autoCreate: e.target.checked })} />
          Créer automatiquement une recette avec l’IA quand la recherche ne trouve rien
        </label>
      )}
    </div>
  );
}

function OptionAdder({ onPick, onCancel }: { onPick: (o: IngOption) => void; onCancel: () => void }) {
  const { ingredients } = useLibrary();
  const [q, setQ] = useState('');
  const list = useMemo(() => (q.trim() ? searchIngredients(q, ingredients, 10) : []), [q, ingredients]);
  return (
    <div className="card pad stack" style={{ background: 'var(--surface-2)' }}>
      <div className="row nowrap">
        <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ingrédient ou famille (bœuf, poisson, fromage…)" />
        <button className="btn ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
      <div className="chips">
        {q.trim() &&
          (() => {
            const fam = parseIngredientQuery(q, ingredients).query.groups[0]?.[0];
            return fam && fam.ids.length > 1 ? (
              <button className="chip on" onClick={() => onPick(fam)}>
                Tout « {fam.label} » ({fam.ids.length})
              </button>
            ) : null;
          })()}
        {list.map((i) => (
          <button key={i.id} className="chip" onClick={() => onPick({ label: i.name, ids: [i.id] })}>
            {i.emoji} {i.name}
          </button>
        ))}
      </div>
    </div>
  );
}
