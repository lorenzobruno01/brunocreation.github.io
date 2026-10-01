import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useLibrary, useUserData } from '../hooks/library';
import { DAY_NAMES, isoDate, mondayOf, weekDates } from '../domain/season';
import { generateWeek } from '../domain/planner';
import { RecipePicker } from '../components/RecipePicker';
import { Sheet, ServingsControl, useToast } from '../components/ui';
import { SLOT_LABELS } from '../components/AddToPlanSheet';
import { formatDateFr, formatDuration } from '../components/format';
import { PROTEINS } from '../domain/labels';
import { AiError, loadAi } from '../ai/light';
import type { PlanEntry, Slot } from '../domain/types';
import { isMainMeal, passesConstraints, type PlannerConstraints } from '../domain/planner';
import { ConstraintsEditor, loadConstraints } from '../components/ConstraintsEditor';
import { currentSeason } from '../domain/season';

function loadBool(key: string, def: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? def : v === '1';
  } catch {
    return def;
  }
}
function saveBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* indisponible */
  }
}

export function Planner() {
  const { byId, recipes, lookup } = useLibrary();
  const { favorites, lastCooked, fridge, pantry, settings } = useUserData();
  const [offset, setOffset] = useState(0);
  const [withBreakfast, setWithBreakfast] = useState(() => loadBool('cuisine.breakfast', false));
  const [picker, setPicker] = useState<{ date: string; slot: Slot } | null>(null);
  const [menu, setMenu] = useState<PlanEntry | null>(null);
  const [moving, setMoving] = useState<PlanEntry | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offset * 7);
  const dates = weekDates(monday);
  const today = isoDate(new Date());
  const slots: Slot[] = withBreakfast ? ['matin', 'midi', 'soir'] : ['midi', 'soir'];
  const plan = useLiveQuery(() => db.plan.where('date').between(dates[0], dates[6], true, true).toArray(), [dates[0]]) ?? [];
  const byKey = new Map(plan.map((p) => [p.key, p]));

  const stats = useMemo(() => {
    const entries = plan.map((p) => ({ p, r: byId.get(p.recipeId) })).filter((x) => x.r);
    const proteins = new Map<string, number>();
    for (const { r } of entries) if (r!.mainProtein) proteins.set(r!.mainProtein, (proteins.get(r!.mainProtein) ?? 0) + 1);
    const daysWithMeals = new Set(entries.map((e) => e.p.date)).size || 1;
    const kcal = entries.reduce((s, e) => s + e.r!.nutrition.kcal, 0) / daysWithMeals;
    const prot = entries.reduce((s, e) => s + e.r!.nutrition.protein, 0) / daysWithMeals;
    return { count: entries.length, proteins: [...proteins.entries()].sort((a, b) => b[1] - a[1]), kcal: Math.round(kcal), prot: Math.round(prot) };
  }, [plan, byId]);

  const place = async (date: string, slot: Slot, recipeId: string, servings = settings.defaultServings) => {
    await db.plan.put({ key: `${date}|${slot}`, date, slot, recipeId, servings });
  };

  const move = async (from: PlanEntry, toKey: string) => {
    if (from.key === toKey) return;
    const [date, slot] = toKey.split('|') as [string, Slot];
    const target = byKey.get(toKey);
    await db.transaction('rw', db.plan, async () => {
      await db.plan.delete(from.key);
      if (target) await db.plan.put({ ...target, key: from.key, date: from.date, slot: from.slot });
      await db.plan.put({ ...from, key: toKey, date, slot });
    });
  };

  const generate = async (opts: { replaceAll: boolean; share: boolean; constraints: PlannerConstraints }) => {
    const locked = opts.replaceAll ? [] : plan;
    const entries = generateWeek(
      {
        recipes,
        favorites,
        lastCooked,
        available: new Set([...fridge, ...pantry]),
        locked,
        dates,
        slots,
        servings: settings.defaultServings,
        shareIngredients: opts.share,
        constraints: opts.constraints,
      },
      (id) => lookup(id)?.category,
    );
    await db.transaction('rw', db.plan, async () => {
      if (opts.replaceAll) await db.plan.bulkDelete(plan.map((p) => p.key));
      await db.plan.bulkPut(entries);
    });
    toast('Menu de la semaine généré ✨');
    setGenOpen(false);
  };

  const slotMeals = (s: Slot) => (s === 'matin' ? (['petit-dejeuner'] as const) : (['dejeuner', 'diner'] as const));

  return (
    <div className="page">
      <div className="row between">
        <h1 style={{ margin: 0 }}>📅 Ma semaine</h1>
        <div className="row">
          <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Semaine précédente">
            ◀
          </button>
          <button className="btn sm" onClick={() => setOffset(0)} disabled={offset === 0}>
            Cette semaine
          </button>
          <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Semaine suivante">
            ▶
          </button>
        </div>
      </div>
      <p className="muted" style={{ margin: '4px 0 12px' }}>
        Du {formatDateFr(dates[0], { day: 'numeric', month: 'long' })} au {formatDateFr(dates[6], { day: 'numeric', month: 'long' })} — touchez un créneau pour ajouter un plat, glissez-déposez pour réorganiser.
      </p>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => setGenOpen(true)}>
          ✨ Générer ma semaine
        </button>
        <button
          className="btn olive"
          disabled={!plan.length}
          onClick={() => navigate(`/courses?source=semaine&du=${dates[0]}`)}
        >
          🛒 Générer ma liste de courses
        </button>
        <button
          className={`chip ${withBreakfast ? 'on' : ''}`}
          onClick={() => {
            setWithBreakfast(!withBreakfast);
            saveBool('cuisine.breakfast', !withBreakfast);
          }}
        >
          🌅 Petits-déjeuners
        </button>
        {plan.length > 0 && (
          <button
            className="btn ghost sm danger"
            onClick={async () => {
              if (confirm('Vider le planning de cette semaine ?')) await db.plan.bulkDelete(plan.map((p) => p.key));
            }}
          >
            Vider
          </button>
        )}
      </div>

      {moving && (
        <div className="callout" style={{ marginBottom: 12 }}>
          ↔ Touchez le créneau de destination pour « {byId.get(moving.recipeId)?.name} ».{' '}
          <button className="btn sm ghost" onClick={() => setMoving(null)}>
            Annuler
          </button>
        </div>
      )}

      <div className="week">
        {dates.map((d, i) => (
          <div key={d} className={`card day ${d === today ? 'today' : ''}`}>
            <div className="day-head">
              <strong>{DAY_NAMES[i]}</strong>
              <span className="small muted">{formatDateFr(d, { day: 'numeric', month: 'short' })}</span>
            </div>
            <div className={`slots ${slots.length === 3 ? 'three' : ''}`}>
              {slots.map((s) => {
                const key = `${d}|${s}`;
                const e = byKey.get(key);
                const r = e ? byId.get(e.recipeId) : undefined;
                return (
                  <div
                    key={s}
                    className={`slot ${r ? 'filled' : ''} ${dragOver === key ? 'drop' : ''} ${moving?.key === key ? 'moving' : ''}`}
                    role="button"
                    tabIndex={0}
                    draggable={!!r}
                    onDragStart={(ev) => e && ev.dataTransfer.setData('text/plain', e.key)}
                    onDragOver={(ev) => {
                      ev.preventDefault();
                      setDragOver(key);
                    }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      setDragOver(null);
                      const fromKey = ev.dataTransfer.getData('text/plain');
                      const from = plan.find((p) => p.key === fromKey);
                      if (from) move(from, key);
                    }}
                    onClick={() => {
                      if (moving) {
                        move(moving, key);
                        setMoving(null);
                      } else if (e && r) setMenu(e);
                      else setPicker({ date: d, slot: s });
                    }}
                  >
                    <span className="slot-label">{SLOT_LABELS[s]}</span>
                    {r ? (
                      <>
                        <span className="slot-name">
                          {r.emoji} {r.name}
                        </span>
                        <span className="small muted">
                          ⏱ {formatDuration(r.totalTime)} · 👥 {e!.servings}
                        </span>
                      </>
                    ) : (
                      <span className="muted" style={{ fontSize: '1.4rem', margin: 'auto' }}>
                        +
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {stats.count > 0 && (
        <section className="card pad section">
          <h3>Équilibre de la semaine</h3>
          <div className="small">
            {stats.count} repas planifiés · moyenne ≈ <strong>{stats.kcal} kcal</strong> et <strong>{stats.prot} g de protéines</strong> par jour (repas planifiés, par personne).
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {stats.proteins.map(([p, n]) => (
              <span key={p} className={`tag ${n >= 4 ? 'warn' : ''}`}>
                {PROTEINS[p as keyof typeof PROTEINS]?.emoji} {PROTEINS[p as keyof typeof PROTEINS]?.label} × {n}
              </span>
            ))}
          </div>
        </section>
      )}

      {picker && (
        <RecipePicker
          title={`${DAY_NAMES[dates.indexOf(picker.date)]} — ${SLOT_LABELS[picker.slot]}`}
          meals={[...slotMeals(picker.slot)]}
          onClose={() => setPicker(null)}
          onPick={async (r) => {
            await place(picker.date, picker.slot, r.id);
            setPicker(null);
          }}
        />
      )}

      {menu && (
        <SlotMenu
          entry={menu}
          onClose={() => setMenu(null)}
          onChange={() => {
            setPicker({ date: menu.date, slot: menu.slot });
            setMenu(null);
          }}
          onMove={() => {
            setMoving(menu);
            setMenu(null);
          }}
        />
      )}

      {genOpen && (
        <GenerateSheet
          onClose={() => setGenOpen(false)}
          onLocal={generate}
          hasPlan={plan.length > 0}
          aiEnabled={!!settings.apiKey}
          onAi={async (instructionIn, setStatus) => {
            let instruction = instructionIn;
            const cons = loadConstraints();
            const candidates = recipes.filter((r) => slots.some((s) => isMainMeal(r, s)) && passesConstraints(r, { ...cons, maxTimeWeek: Math.max(cons.maxTimeWeek ?? 0, cons.maxTimeWeekend ?? 0) || undefined }, true, favorites, currentSeason()));
            const extra = [
              cons.maxTimeWeek ? `en semaine, plats de ${cons.maxTimeWeek} min maximum` : '',
              cons.maxTimeWeekend ? `le week-end, ${cons.maxTimeWeekend} min maximum` : '',
              cons.minFish ? `au moins ${cons.minFish} repas de poisson` : '',
              cons.coldLunch ? 'midis de semaine en repas froids / lunch box' : '',
            ].filter(Boolean).join(' ; ');
            instruction = [instruction, extra].filter(Boolean).join('. ');
            try {
              setStatus('L’IA compose votre semaine…');
              const { planWeekAI } = await loadAi();
              const res = await planWeekAI({
                apiKey: settings.apiKey!,
                model: settings.model ?? 'claude-opus-5-5',
                candidates,
                dates,
                slots,
                instruction,
                favorites,
                recent: [...lastCooked.entries()].filter(([, d]) => Date.now() - new Date(d).getTime() < 14 * 86400000).map(([id]) => byId.get(id)?.name ?? id),
                available: [...fridge, ...pantry].map((id) => lookup(id)?.name ?? id),
                lookup,
                servings: settings.defaultServings,
              });
              await db.transaction('rw', db.plan, async () => {
                await db.plan.bulkDelete(plan.map((p) => p.key));
                await db.plan.bulkPut(res.plan);
              });
              setStatus(null);
              toast('Semaine composée par l’IA ✨');
              return res.explanation;
            } catch (e) {
              setStatus(null);
              throw e instanceof AiError ? e : new AiError(String(e));
            }
          }}
        />
      )}
      <p className="small muted center" style={{ marginTop: 24 }}>
        Astuce : les plats du planning alimentent la liste de courses. <Link to="/courses">Voir la liste</Link>
      </p>
    </div>
  );
}

function SlotMenu({ entry, onClose, onChange, onMove }: { entry: PlanEntry; onClose: () => void; onChange: () => void; onMove: () => void }) {
  const { byId } = useLibrary();
  const r = byId.get(entry.recipeId);
  if (!r) return null;
  return (
    <Sheet title={`${r.emoji} ${r.name}`} onClose={onClose}>
      <div className="stack">
        <div className="row between">
          <span className="label">Portions</span>
          <ServingsControl value={entry.servings} onChange={(n) => db.plan.put({ ...entry, servings: n })} />
        </div>
        <div className="menu-list">
          <Link to={`/recette/${r.id}`}>
            <span className="mi">📖</span>Voir la recette
          </Link>
          <Link to={`/recette/${r.id}/cuisine?p=${entry.servings}`}>
            <span className="mi">👨‍🍳</span>Commencer à cuisiner
          </Link>
          <button onClick={onChange}>
            <span className="mi">🔁</span>Changer de plat
          </button>
          <button onClick={onMove}>
            <span className="mi">↔️</span>Déplacer vers un autre créneau
          </button>
          <button
            onClick={async () => {
              await db.plan.delete(entry.key);
              onClose();
            }}
          >
            <span className="mi">🗑</span>Retirer du planning
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function GenerateSheet({
  onClose,
  onLocal,
  onAi,
  hasPlan,
  aiEnabled,
}: {
  onClose: () => void;
  onLocal: (o: { replaceAll: boolean; share: boolean; constraints: PlannerConstraints }) => void;
  onAi: (instruction: string, setStatus: (s: string | null) => void) => Promise<string>;
  hasPlan: boolean;
  aiEnabled: boolean;
}) {
  const [replaceAll, setReplaceAll] = useState(!hasPlan);
  const [share, setShare] = useState(true);
  const [constraints, setConstraints] = useState<PlannerConstraints>(loadConstraints);
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  return (
    <Sheet title="✨ Générer ma semaine" onClose={onClose}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Le générateur tient compte de vos favoris, de la saison, des plats cuisinés récemment, de vos ingrédients disponibles et de la variété (jamais deux fois la même protéine de suite, plats rapides en semaine, mijotés le week-end).
        </p>
        <label className="row nowrap">
          <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} /> Tout regénérer (sinon : compléter les créneaux vides)
        </label>
        <label className="row nowrap">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> ♻️ Anti-gaspillage : réutiliser les mêmes produits frais
        </label>
        <ConstraintsEditor value={constraints} onChange={setConstraints} />
        <button className="btn primary lg" onClick={() => onLocal({ replaceAll, share, constraints })}>
          Générer instantanément
        </button>
        <hr className="sep" />
        <h3 style={{ margin: 0 }}>Avec l’assistant IA</h3>
        {aiEnabled ? (
          <>
            <textarea
              className="textarea"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="ex. « Organise-moi 7 jours de repas, beaucoup de poisson, utilise autant que possible les mêmes ingrédients pour éviter le gaspillage »"
            />
            <button
              className="btn"
              disabled={!!status}
              onClick={async () => {
                setError(null);
                try {
                  setExplanation(await onAi(instruction, setStatus));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {status ? <><span className="spinner" /> {status}</> : '✨ Composer avec l’IA (remplace la semaine)'}
            </button>
            {error && <div className="callout danger small">{error}</div>}
            {explanation && <div className="callout ok small">{explanation}</div>}
          </>
        ) : (
          <p className="small muted">
            Ajoutez une clé API dans <Link to="/reglages">Réglages</Link> pour composer la semaine en langage naturel.
          </p>
        )}
      </div>
    </Sheet>
  );
}
