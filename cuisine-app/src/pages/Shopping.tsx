import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, toggleBasket } from '../db/db';
import { useLibrary, useUserData } from '../hooks/library';
import { buildShopping, itemQtyLabel, shoppingToText, toShoppingItems, type Selection } from '../domain/shopping';
import { AISLES } from '../domain/labels';
import { formatStandard } from '../domain/units';
import { mondayOf, weekDates, isoDate } from '../domain/season';
import { formatDateFr } from '../components/format';
import { Empty, ServingsControl, useToast } from '../components/ui';
import { RecipePicker } from '../components/RecipePicker';
import type { ShoppingAisle, ShoppingItem, StandardUnit } from '../domain/types';

interface Meta {
  generatedAt: string;
  source: string;
  inPantry: Array<{ label: string; qty: string }>;
  leftovers: Array<{ label: string; leftover: number; unit: StandardUnit; packageSize: number; suggestions: Array<{ id: string; name: string }> }>;
}
const META_KEY = 'cuisine.shoppingMeta';
function loadMeta(): Meta | null {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function saveMeta(m: Meta | null) {
  try {
    if (m) localStorage.setItem(META_KEY, JSON.stringify(m));
    else localStorage.removeItem(META_KEY);
  } catch {
    /* indisponible */
  }
}

export function Shopping() {
  const { byId, recipes, lookup } = useLibrary();
  const { basket, settings } = useUserData();
  const [params] = useSearchParams();
  const initialWeek = params.get('du') ?? isoDate(mondayOf(new Date()));
  const [source, setSource] = useState<'semaine' | 'selection'>(params.get('source') === 'semaine' ? 'semaine' : basket.size ? 'selection' : 'semaine');
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [meta, setMeta] = useState<Meta | null>(loadMeta);
  const [hideChecked, setHideChecked] = useState(false);
  const [custom, setCustom] = useState('');
  const [picker, setPicker] = useState(false);
  const [view, setView] = useState<'liste' | 'preparer'>(params.get('source') ? 'preparer' : 'liste');
  const toast = useToast();

  const dates = weekDates(new Date(weekStart + 'T12:00:00'));
  const plan = useLiveQuery(() => db.plan.where('date').between(dates[0], dates[6], true, true).toArray(), [dates[0]]) ?? [];
  const items = useLiveQuery(() => db.shopping.toArray(), []) ?? [];
  const pantryRows = useLiveQuery(() => db.pantry.toArray(), []) ?? [];

  const selections: Selection[] = useMemo(() => {
    if (source === 'selection') {
      return [...basket.entries()].map(([id, servings]) => ({ recipe: byId.get(id)!, servings })).filter((s) => s.recipe);
    }
    return plan.map((p) => ({ recipe: byId.get(p.recipeId)!, servings: p.servings })).filter((s) => s.recipe);
  }, [source, basket, plan, byId]);

  const generate = async () => {
    const pantry = new Map(pantryRows.map((p) => [p.ingredientId, p.qty]));
    const res = buildShopping(selections, pantry, lookup, recipes);
    const customItems = items.filter((i) => i.key.startsWith('custom:'));
    const next = toShoppingItems(res.toBuy, items);
    await db.transaction('rw', db.shopping, async () => {
      await db.shopping.clear();
      await db.shopping.bulkPut([...next, ...customItems]);
    });
    const m: Meta = {
      generatedAt: new Date().toISOString(),
      source: source === 'semaine' ? `Planning du ${formatDateFr(dates[0], { day: 'numeric', month: 'long' })}` : `${selections.length} recette(s) sélectionnée(s)`,
      inPantry: res.inPantry.map((l) => ({ label: l.label, qty: l.toTaste ? 'au goût' : formatStandard(l.qty, l.unit) })),
      leftovers: res.leftovers.map((l) => ({ label: l.label, leftover: l.leftover, unit: l.unit, packageSize: l.packageSize, suggestions: l.suggestions.map((s) => ({ id: s.id, name: s.name })) })),
    };
    setMeta(m);
    saveMeta(m);
    setView('liste');
    toast(`Liste générée : ${next.length} articles`);
  };

  const toggleItem = (it: ShoppingItem) => db.shopping.put({ ...it, checked: !it.checked });
  const done = items.filter((i) => i.checked).length;

  const byAisle = useMemo(() => {
    const m = new Map<ShoppingAisle, ShoppingItem[]>();
    for (const it of items) {
      if (hideChecked && it.checked) continue;
      (m.get(it.aisle) ?? m.set(it.aisle, []).get(it.aisle)!).push(it);
    }
    for (const list of m.values()) list.sort((a, b) => Number(a.checked) - Number(b.checked) || a.label.localeCompare(b.label, 'fr'));
    return [...m.entries()].sort((a, b) => AISLES[a[0]].order - AISLES[b[0]].order);
  }, [items, hideChecked]);

  const share = async () => {
    const text = shoppingToText(items, lookup);
    try {
      if (navigator.share) await navigator.share({ title: 'Liste de courses', text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Liste copiée dans le presse-papiers');
      }
    } catch {
      /* partage annulé */
    }
  };

  const addCustom = async () => {
    const label = custom.trim();
    if (!label) return;
    await db.shopping.put({ key: `custom:${Date.now()}`, label, qty: 0, unit: 'autre', aisle: 'epicerie', checked: false, recipes: [] });
    setCustom('');
  };

  return (
    <div className="page narrow">
      <h1>🛒 Ma liste de courses</h1>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={view === 'liste' ? 'on' : ''} onClick={() => setView('liste')}>
          📝 Liste
          <span className="cnt">{items.length ? `${done}/${items.length} achetés` : 'vide'}</span>
        </button>
        <button className={view === 'preparer' ? 'on' : ''} onClick={() => setView('preparer')}>
          🍽️ Recettes à acheter
          <span className="cnt">{selections.length} recette{selections.length > 1 ? 's' : ''}</span>
        </button>
      </div>

      {view === 'preparer' && (
        <section className="stack">
          <div className="segmented">
            <button className={source === 'semaine' ? 'on' : ''} onClick={() => setSource('semaine')}>
              📅 Planning de la semaine
            </button>
            <button className={source === 'selection' ? 'on' : ''} onClick={() => setSource('selection')}>
              🧺 Ma sélection ({basket.size})
            </button>
          </div>

          {source === 'semaine' && (
            <div className="row between">
              <button className="icon-btn" onClick={() => setWeekStart(shift(weekStart, -7))} aria-label="Semaine précédente">
                ◀
              </button>
              <strong>Semaine du {formatDateFr(dates[0], { day: 'numeric', month: 'long' })}</strong>
              <button className="icon-btn" onClick={() => setWeekStart(shift(weekStart, 7))} aria-label="Semaine suivante">
                ▶
              </button>
            </div>
          )}

          <div className="card">
            {selections.length === 0 ? (
              <Empty emoji="🧺" title={source === 'semaine' ? 'Aucun repas planifié cette semaine' : 'Aucune recette sélectionnée'}>
                {source === 'semaine' ? (
                  <Link to="/semaine" className="btn">
                    📅 Planifier ma semaine
                  </Link>
                ) : (
                  <p>Ajoutez des recettes avec le bouton « + 🛒 » des cartes, ou ci-dessous.</p>
                )}
              </Empty>
            ) : (
              <div>
                {selections.map((s, i) => (
                  <div key={`${s.recipe.id}-${i}`} className="shop-item" style={{ cursor: 'default' }}>
                    <span style={{ fontSize: '1.5rem' }}>{s.recipe.emoji}</span>
                    <div className="grow">
                      <Link to={`/recette/${s.recipe.id}`} className="sn" style={{ textDecoration: 'none' }}>
                        {s.recipe.name}
                      </Link>
                      {source === 'semaine' && <div className="sr">{formatDateFr(plan[i].date, { weekday: 'long' })} · {plan[i].slot}</div>}
                    </div>
                    {source === 'selection' ? (
                      <>
                        <ServingsControl value={s.servings} onChange={(n) => db.basket.update(s.recipe.id, { servings: n })} />
                        <button className="icon-btn" onClick={() => toggleBasket(s.recipe.id, s.servings)} aria-label="Retirer">
                          ✕
                        </button>
                      </>
                    ) : (
                      <ServingsControl value={s.servings} onChange={(n) => db.plan.update(plan[i].key, { servings: n })} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {source === 'selection' && (
            <button className="btn" onClick={() => setPicker(true)}>
              + Ajouter une recette
            </button>
          )}
          <button className="btn primary lg block" disabled={!selections.length} onClick={generate}>
            🛒 Générer ma liste de courses
          </button>
          <p className="small muted center" style={{ margin: 0 }}>
            Quantités adaptées aux portions, ingrédients identiques fusionnés, garde-manger retiré ({pantryRows.length} article{pantryRows.length > 1 ? 's' : ''} — <Link to="/garde-manger">modifier</Link>).
          </p>
        </section>
      )}

      {view === 'liste' && (
        <>
          {items.length === 0 ? (
            <Empty emoji="📝" title="Votre liste est vide">
              <p>Choisissez des recettes ou planifiez votre semaine, puis générez la liste.</p>
              <button className="btn primary" onClick={() => setView('preparer')}>
                Préparer ma liste
              </button>
            </Empty>
          ) : (
            <>
              <div className="stack" style={{ gap: 8, marginBottom: 14 }}>
                <div className="progress">
                  <div style={{ width: `${(done / items.length) * 100}%` }} />
                </div>
                <div className="row between small">
                  <span className="muted">
                    {meta ? `${meta.source} · ` : ''}
                    {done}/{items.length} dans le panier
                  </span>
                  <div className="row">
                    <button className={`chip ${hideChecked ? 'on' : ''}`} onClick={() => setHideChecked(!hideChecked)}>
                      Masquer cochés
                    </button>
                    <button className="chip" onClick={share}>
                      📤 Partager
                    </button>
                  </div>
                </div>
              </div>

              {meta && meta.leftovers.length > 0 && (
                <details className="callout" style={{ marginBottom: 14 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 800 }}>♻️ Anti-gaspillage : {meta.leftovers.length} conditionnement(s) entamé(s)</summary>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }} className="small">
                    {meta.leftovers.map((l) => (
                      <li key={l.label} style={{ marginBottom: 6 }}>
                        <strong>{l.label}</strong> : vendu par {formatStandard(l.packageSize, l.unit)} → il vous restera environ <strong>{formatStandard(l.leftover, l.unit)}</strong>.
                        {l.suggestions.length > 0 && (
                          <>
                            {' '}
                            Idée :{' '}
                            {l.suggestions.map((s, i) => (
                              <span key={s.id}>
                                {i > 0 && ', '}
                                <Link to={`/recette/${s.id}`}>{s.name}</Link>
                              </span>
                            ))}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {byAisle.map(([aisle, list]) => (
                <section key={aisle} className="aisle">
                  <h3>
                    {AISLES[aisle].emoji} {AISLES[aisle].label} <span className="tag">{list.filter((i) => !i.checked).length}</span>
                  </h3>
                  <div className="card">
                    {list.map((it) => {
                      const ing = it.ingredientId ? lookup(it.ingredientId) : undefined;
                      return (
                        <div key={it.key} className={`shop-item ${it.checked ? 'done' : ''}`} onClick={() => toggleItem(it)} role="checkbox" aria-checked={it.checked}>
                          <span className={`checkbox ${it.checked ? 'on' : ''}`}>{it.checked ? '✓' : ''}</span>
                          <div className="grow">
                            <div className="sn">
                              {ing?.emoji ?? '•'} {cap(it.label)}
                            </div>
                            {it.recipes.length > 0 && <div className="sr">pour : {it.recipes.join(', ')}</div>}
                          </div>
                          <span className="sq">{itemQtyLabel(it, ing?.pieceWeight)}</span>
                          {it.key.startsWith('custom:') && (
                            <button
                              className="icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                db.shopping.delete(it.key);
                              }}
                              aria-label="Supprimer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div className="row nowrap" style={{ marginTop: 8 }}>
                <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} placeholder="Ajouter un article (ex. papier cuisson)" />
                <button className="btn" onClick={addCustom}>
                  Ajouter
                </button>
              </div>

              {meta && meta.inPantry.length > 0 && (
                <details className="card pad" style={{ marginTop: 16 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 800 }}>🏠 Déjà chez vous — retirés de la liste ({meta.inPantry.length})</summary>
                  <div className="chips" style={{ marginTop: 10 }}>
                    {meta.inPantry.map((p) => (
                      <span key={p.label} className="tag">
                        {p.label} · {p.qty}
                      </span>
                    ))}
                  </div>
                </details>
              )}

              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn sm" onClick={() => db.shopping.bulkDelete(items.filter((i) => i.checked).map((i) => i.key))} disabled={!done}>
                  Retirer les articles achetés
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (!confirm('Effacer toute la liste ?')) return;
                    await db.shopping.clear();
                    setMeta(null);
                    saveMeta(null);
                  }}
                >
                  Effacer la liste
                </button>
              </div>
            </>
          )}
        </>
      )}

      {picker && (
        <RecipePicker
          title="Ajouter à la sélection"
          onClose={() => setPicker(false)}
          onPick={async (r) => {
            if (!basket.has(r.id)) await toggleBasket(r.id, settings.defaultServings);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}

function shift(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
