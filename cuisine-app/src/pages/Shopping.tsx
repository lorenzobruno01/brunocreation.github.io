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
import { quickTip, nutrientGains, SHOPS, UPGRADES } from '../domain/buying';
import { GuideCard, NearbyShops, StoreLine, useNearbyStores } from '../components/BuyingAdvice';
import type { Ingredient, IngredientCategory, ShoppingAisle, ShoppingItem, StandardUnit } from '../domain/types';
import { costOf, purchaseFor } from '../config/formats';
import { guideFor, type ShopKind } from '../domain/buying';
import { saveSettings } from '../db/db';

const SHOP_OF: Partial<Record<IngredientCategory, ShopKind>> = { viande: 'boucherie', abats: 'boucherie', volaille: 'volailler', poisson: 'poissonnerie', 'fruits-de-mer': 'poissonnerie', legume: 'primeur', fruit: 'primeur', herbe: 'primeur' };
/** Commerce conseillé pour un ingrédient */
export function shopOf(ing?: Ingredient): ShopKind {
  if (!ing) return 'supermarche';
  if (ing.category === 'laitier' && /^(comte|parmesan|beaufort|gruyere|pecorino|reblochon|camembert|roquefort|manchego|chevre)/.test(ing.id)) return 'fromagerie';
  return SHOP_OF[ing.category] ?? (guideFor(ing)?.shops.find((s) => s !== 'bio' && s !== 'marche') as ShopKind | undefined) ?? 'supermarche';
}

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
  const [open, setOpen] = useState<string | null>(null);
  const shops = useNearbyStores(settings.shopCp, settings.shopRadius);

  const dates = weekDates(new Date(weekStart + 'T12:00:00'));
  const plan = useLiveQuery(() => db.plan.where('date').between(dates[0], dates[6], true, true).toArray(), [dates[0]]) ?? [];
  const items = useLiveQuery(() => db.shopping.toArray(), []) ?? [];
  const pantryRows = useLiveQuery(() => db.pantry.toArray(), []) ?? [];

  const selections: Selection[] = useMemo(() => {
    if (source === 'selection') {
      return [...basket.entries()].map(([id, servings]) => ({ recipe: byId.get(id)!, servings })).filter((s) => s.recipe);
    }
    // les restes (portions 0) sont déjà comptés dans le plat d'origine
    return plan.filter((p) => p.servings > 0).map((p) => ({ recipe: byId.get(p.recipeId)!, servings: p.servings })).filter((s) => s.recipe);
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

  const group = settings.shopGroup ?? 'rayon';
  const purchases = useMemo(() => {
    const m = new Map<string, { text: string; leftover: number; unit: StandardUnit; cost: number }>();
    for (const it of items) {
      const ing = it.ingredientId ? lookup(it.ingredientId) : undefined;
      if (!ing || it.unit === 'autre' || !it.qty) continue;
      const p = purchaseFor(ing, it.qty);
      m.set(it.key, { text: p.text, leftover: p.leftover, unit: p.unit, cost: costOf(ing, p.bought) });
    }
    return m;
  }, [items, lookup]);
  const totalCost = [...purchases.values()].reduce((s, p) => s + p.cost, 0);
  const leftToBuy = items.filter((i) => !i.checked).reduce((s, i) => s + (purchases.get(i.key)?.cost ?? 0), 0);

  const byAisle = useMemo(() => {
    const m = new Map<string, ShoppingItem[]>();
    for (const it of items) {
      if (hideChecked && it.checked) continue;
      const k = group === 'commerce' ? shopOf(it.ingredientId ? lookup(it.ingredientId) : undefined) : it.aisle;
      (m.get(k) ?? m.set(k, []).get(k)!).push(it);
    }
    for (const list of m.values()) list.sort((a, b) => Number(a.checked) - Number(b.checked) || a.label.localeCompare(b.label, 'fr'));
    const order = (k: string) => (group === 'commerce' ? Object.keys(SHOPS).indexOf(k) : AISLES[k as ShoppingAisle].order);
    return [...m.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [items, hideChecked, group, lookup]);
  const groupTitle = (k: string) => (group === 'commerce' ? `${SHOPS[k as ShopKind].emoji} ${SHOPS[k as ShopKind].label}` : `${AISLES[k as ShoppingAisle].emoji} ${AISLES[k as ShoppingAisle].label}`);

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
                  <div className="segmented" style={{ minWidth: 200 }}>
                    <button className={group === 'rayon' ? 'on' : ''} onClick={() => saveSettings({ shopGroup: 'rayon' })}>
                      Par rayon
                    </button>
                    <button className={group === 'commerce' ? 'on' : ''} onClick={() => saveSettings({ shopGroup: 'commerce' })}>
                      Par commerce
                    </button>
                  </div>
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

              <div className="callout info small stack" style={{ marginBottom: 14, gap: 6 }} aria-label="Budget">
                <div className="row between nowrap">
                  <span>
                    💶 Estimation : <strong>{Math.round(totalCost)} €</strong>
                    {done > 0 ? ` · reste ${Math.round(leftToBuy)} € à acheter` : ''}
                  </span>
                  <label className="row nowrap small" style={{ gap: 4 }}>
                    Budget
                    <input
                      className="input"
                      style={{ width: 80, minHeight: 34, padding: '4px 8px' }}
                      inputMode="numeric"
                      aria-label="Budget de la semaine (€)"
                      defaultValue={settings.weeklyBudget ?? ''}
                      placeholder="€"
                      onBlur={(e) => saveSettings({ weeklyBudget: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })}
                    />
                  </label>
                </div>
                {settings.weeklyBudget && totalCost > settings.weeklyBudget && (
                  <span>
                    ⚠️ Au-dessus du budget de {Math.round(totalCost - settings.weeklyBudget)} €. Pistes : morceaux à mijoter (paleron, joue, jarret), cuisses plutôt que filets, sardines et maquereaux, abats, légumes de saison au marché en fin de matinée. Le générateur tient compte du budget à la prochaine semaine.
                  </span>
                )}
                <span className="muted">Prix moyens en qualité recommandée (fermier, Label Rouge, bio) : un ordre de grandeur, pas un ticket de caisse.</span>
              </div>
              <NearbyShops shops={shops} />
              {byAisle.map(([aisle, list]) => (
                <section key={aisle} className="aisle">
                  <h3>
                    {groupTitle(aisle)} <span className="tag">{list.filter((i) => !i.checked).length}</span>
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
                            {purchases.get(it.key) && (
                              <div className="sr">
                                besoin : {itemQtyLabel(it, ing?.pieceWeight)}
                                {purchases.get(it.key)!.leftover > 0.05 * it.qty && purchases.get(it.key)!.leftover >= (it.unit === 'piece' ? 1 : 30) ? ` · il en restera ${formatStandard(purchases.get(it.key)!.leftover, it.unit as StandardUnit)}` : ''} · ≈ {purchases.get(it.key)!.cost.toFixed(2).replace('.', ',')} €
                              </div>
                            )}
                          </div>
                          <span className="sq">{purchases.get(it.key)?.text ?? itemQtyLabel(it, ing?.pieceWeight)}</span>
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
                          {ing && !it.checked && <Advice ingId={ing.id} category={ing.category} open={open === it.key} onToggle={() => setOpen(open === it.key ? null : it.key)} shops={shops} />}
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

/** Conseils d'achat sous un produit : ce qu'il faut choisir, mieux encore, où l'acheter */
function Advice({ ingId, category, open, onToggle, shops }: { ingId: string; category: Parameters<typeof quickTip>[0]['category']; open: boolean; onToggle: () => void; shops: ReturnType<typeof useNearbyStores> }) {
  const { lookup } = useLibrary();
  const tip = quickTip({ id: ingId, category });
  if (!tip) return null;
  const up = UPGRADES[ingId];
  const gains = up ? nutrientGains(ingId, up.to) : [];
  const store = shops.nearest(tip.guide.shops);
  return (
    <div className="advice" onClick={(e) => e.stopPropagation()}>
      <div>🏷️ {tip.text}</div>
      {up && (
        <div className="advice-up">
          💡 Plus nutritif : <strong>{lookup(up.to)?.name}</strong>
          {gains.length > 0 && <> ({gains.slice(0, 3).map((g) => `${g.label} ×${g.ratio >= 10 ? '10+' : String(g.ratio).replace('.', ',')}`).join(', ')})</>}
        </div>
      )}
      {store ? (
        <StoreLine s={store} />
      ) : (
        <div className="muted">
          {tip.guide.shops
            .slice(0, 3)
            .map((k) => `${SHOPS[k].emoji} ${SHOPS[k].one.toLowerCase()}`)
            .join(' · ')}
        </div>
      )}
      <button className="advice-more" onClick={onToggle}>
        {open ? 'Moins de détails ▲' : 'Labels, à éviter, étiquette ▼'}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <GuideCard g={tip.guide} compact />
        </div>
      )}
    </div>
  );
}
