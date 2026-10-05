import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSettings } from '../db/db';
import { useLibrary, useUserData } from '../hooks/library';
import { DAY_NAMES, isoDate, mondayOf, weekDates } from '../domain/season';
import { generateWeek, type PlannerConstraints } from '../domain/planner';
import { generateNutriWeek, dayReport, bestSourcesOf, householdEaters, soloEater, type DayReport, type Eater } from '../domain/nutriPlanner';
import { DEFAULT_PROFILES, GROUP_LABELS, NUTRIENTS } from '../domain/micronutrients';
import { RecipePicker } from '../components/RecipePicker';
import { Sheet, ServingsControl, useToast } from '../components/ui';
import { SLOT_LABELS } from '../components/AddToPlanSheet';
import { formatDateFr, formatDuration } from '../components/format';
import { ConstraintsEditor, loadConstraints } from '../components/ConstraintsEditor';
import type { IndexedRecipe, MealType, PlanEntry, Slot } from '../domain/types';

const ALL_SLOTS: Slot[] = ['matin', 'midi', 'collation', 'soir'];
const SLOTS_KEY = 'cuisine.planSlots';

function loadSlots(): Slot[] {
  try {
    const v = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? 'null');
    if (Array.isArray(v) && v.length) return ALL_SLOTS.filter((s) => v.includes(s));
  } catch {
    /* indisponible */
  }
  return ALL_SLOTS; // par défaut : journée complète (indispensable pour viser 100 %)
}

const SLOT_MEALS: Record<Slot, MealType[]> = { matin: ['petit-dejeuner'], midi: ['dejeuner', 'diner'], collation: ['collation'], soir: ['diner', 'dejeuner'] };

export function covColor(p: number): string {
  if (p >= 95) return 'var(--ok)';
  if (p >= 80) return 'var(--olive)';
  if (p >= 60) return 'var(--saffron)';
  return 'var(--danger)';
}

export function Planner() {
  const { byId, recipes, lookup } = useLibrary();
  const { favorites, lastCooked, fridge, pantry, settings } = useUserData();
  const [offset, setOffset] = useState(0);
  const [slots, setSlotsState] = useState<Slot[]>(loadSlots);
  const [picker, setPicker] = useState<{ date: string; slot: Slot } | null>(null);
  const [menu, setMenu] = useState<PlanEntry | null>(null);
  const [moving, setMoving] = useState<PlanEntry | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const profiles = settings.profiles?.length ? settings.profiles : DEFAULT_PROFILES;
  // Par défaut, le planning est fait pour toute la tablée : mêmes plats, part adaptée à chacun
  const planFor = settings.planFor ?? (profiles.length > 1 ? 'nous' : profiles[0].id);
  const together = planFor === 'nous' && profiles.length > 1;
  const eaters: Eater[] = together ? householdEaters(profiles) : [soloEater(profiles.find((p) => p.id === planFor) ?? profiles[0])];
  const forName = together ? (profiles.length === 2 ? 'vous deux' : 'tout le foyer') : eaters[0].profile.name;

  const setSlots = (s: Slot[]) => {
    const v = ALL_SLOTS.filter((x) => s.includes(x));
    setSlotsState(v);
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(v));
    } catch {
      /* indisponible */
    }
  };

  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offset * 7);
  const dates = weekDates(monday);
  const today = isoDate(new Date());
  const plan = useLiveQuery(() => db.plan.where('date').between(dates[0], dates[6], true, true).toArray(), [dates[0]]) ?? [];
  const byKey = new Map(plan.map((p) => [p.key, p]));

  /** un rapport par personne, jour par jour */
  const reports = useMemo(
    () =>
      eaters.map((e) =>
        dates.map((d) => {
          const rs = plan.filter((p) => p.date === d).map((p) => byId.get(p.recipeId)).filter(Boolean) as IndexedRecipe[];
          return rs.length ? dayReport(d, rs, e.profile, () => e.portions) : null;
        }),
      ),
    [plan, byId, JSON.stringify(eaters), dates[0]], // eslint-disable-line react-hooks/exhaustive-deps
  );

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

  const generate = async (opts: { replaceAll: boolean; share: boolean; constraints: PlannerConstraints; mode: 'nutri' | 'variete' }) => {
    setBusy(true);
    setGenOpen(false);
    await new Promise((r) => setTimeout(r, 30)); // laisser l'écran afficher « calcul en cours »
    const locked = opts.replaceAll ? [] : plan.filter((p) => slots.includes(p.slot));
    const ctx = {
      recipes,
      favorites,
      lastCooked,
      available: new Set([...fridge, ...pantry]),
      locked,
      dates,
      slots,
      servings: together ? Math.max(settings.defaultServings, profiles.length) : settings.defaultServings,
      shareIngredients: opts.share,
      constraints: opts.constraints,
      eaters,
    };
    const entries = opts.mode === 'nutri' ? generateNutriWeek(ctx, (id) => lookup(id)?.category) : generateWeek(ctx, (id) => lookup(id)?.category);
    await db.transaction('rw', db.plan, async () => {
      if (opts.replaceAll) await db.plan.bulkDelete(plan.map((p) => p.key));
      await db.plan.bulkPut(entries);
    });
    setBusy(false);
    toast(opts.mode === 'nutri' ? `Semaine optimisée pour ${forName} 🎯` : 'Menu de la semaine généré ✨');
  };

  const weekCoverage = reports.map((rs) => {
    const filled = rs.filter(Boolean) as DayReport[];
    return filled.length ? Math.round(filled.reduce((s, r) => s + r.coverage, 0) / filled.length) : 0;
  });
  const hasDays = reports[0].some(Boolean);
  const icon = (e: Eater) => (e.profile.sex === 'homme' ? '👨' : '👩');

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
        Du {formatDateFr(dates[0], { day: 'numeric', month: 'long' })} au {formatDateFr(dates[6], { day: 'numeric', month: 'long' })}. Objectif : couvrir chaque jour 100 % des besoins en vitamines, minéraux, électrolytes et acides aminés.
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        <span className="label">Repas pour :</span>
        {profiles.length > 1 && (
          <button className={`chip ${together ? 'on' : ''}`} onClick={() => saveSettings({ planFor: 'nous' })}>
            👫 {profiles.length === 2 ? 'Nous deux' : `Tout le foyer (${profiles.length})`}
          </button>
        )}
        {profiles.map((p) => (
          <button key={p.id} className={`chip ${!together && p.id === eaters[0].profile.id ? 'on' : ''}`} onClick={() => saveSettings({ planFor: p.id })}>
            {p.sex === 'homme' ? '👨' : '👩'} {profiles.length > 1 ? `${p.name} seul${p.sex === 'femme' ? 'e' : ''}` : p.name}
          </button>
        ))}
      </div>
      {together && (
        <p className="small muted" style={{ margin: '0 0 10px' }}>
          Mêmes plats pour {profiles.length === 2 ? 'vous deux' : 'tout le foyer'}, cuisinés pour {Math.max(settings.defaultServings, profiles.length)}. Chacun prend une part adaptée à son objectif :{' '}
          {eaters.map((e, i) => (
            <span key={e.profile.id}>
              {i > 0 && ' · '}
              {icon(e)} <strong>{e.profile.name}</strong> {e.portions.toFixed(2).replace('.', ',')} portion ({e.profile.kcal} kcal/jour)
            </span>
          ))}
          . Le planning vise 100 % des besoins de chacun.
        </p>
      )}
      {!together && (
        <p className="small muted" style={{ margin: '0 0 10px' }}>
          Objectif de {eaters[0].profile.name} : {eaters[0].profile.kcal} kcal/jour, soit environ {eaters[0].portions.toFixed(2).replace('.', ',')} portion de chaque plat. <Link to="/reglages">Modifier mon profil</Link>
        </p>
      )}

      <div className="row" style={{ marginBottom: 10 }}>
        <span className="label">Repas :</span>
        {ALL_SLOTS.map((s) => (
          <button key={s} className={`chip ${slots.includes(s) ? 'on' : ''}`} onClick={() => setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s])} disabled={slots.length === 1 && slots.includes(s)}>
            {SLOT_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => setGenOpen(true)} disabled={busy}>
          {busy ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Optimisation en cours…</> : '🎯 Générer ma semaine'}
        </button>
        <button className="btn olive" disabled={!plan.length} onClick={() => navigate(`/courses?source=semaine&du=${dates[0]}`)}>
          🛒 Générer ma liste de courses
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

      {hasDays && (
        <div className="card pad row between" style={{ marginBottom: 14 }}>
          <div>
            <div className="label">🎯 Couverture moyenne des besoins</div>
            <div className="small muted">vitamines, minéraux, électrolytes, acides aminés, oméga-3, fibres</div>
          </div>
          <div className="row nowrap" style={{ gap: 14 }}>
            {eaters.map((e, i) => (
              <div key={e.profile.id} className="center">
                {together && <div className="small muted">{icon(e)} {e.profile.name}</div>}
                <strong style={{ fontSize: '1.8rem', fontFamily: 'var(--font-title)', color: covColor(weekCoverage[i]) }}>{weekCoverage[i]} %</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {moving && (
        <div className="callout" style={{ marginBottom: 12 }}>
          ↔ Touchez le créneau de destination pour « {byId.get(moving.recipeId)?.name} ».{' '}
          <button className="btn sm ghost" onClick={() => setMoving(null)}>
            Annuler
          </button>
        </div>
      )}

      <div className="week">
        {dates.map((d, i) => {
          return (
            <div key={d} className={`card day ${d === today ? 'today' : ''}`}>
              <div className="day-head">
                <span>
                  <strong>{DAY_NAMES[i]}</strong> <span className="small muted">{formatDateFr(d, { day: 'numeric', month: 'short' })}</span>
                </span>
                <span className="row nowrap" style={{ gap: 6 }}>
                  {eaters.map((e, k) => {
                    const rep = reports[k][i];
                    return (
                      rep && (
                        <span key={e.profile.id} className="tag" style={{ background: covColor(rep.coverage), color: '#fff' }} title={`Couverture des besoins de ${e.profile.name}`}>
                          {together ? icon(e) : '🎯'} {Math.round(rep.coverage)} %
                        </span>
                      )
                    );
                  })}
                </span>
              </div>
              <div className={`slots n${slots.length}`}>
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
                        const from = plan.find((p) => p.key === ev.dataTransfer.getData('text/plain'));
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
                            ⏱ {formatDuration(r.totalTime)} · 🔥 {r.nutrition.kcal}
                          </span>
                          {(r.restTime ?? 0) >= 360 && <span className="small" style={{ color: 'var(--primary-2)', fontWeight: 800 }}>🌙 À préparer la veille</span>}
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
          );
        })}
      </div>

      {hasDays && <CoveragePanel dates={dates} reports={reports} eaters={eaters} recipes={recipes} />}

      {picker && (
        <RecipePicker
          title={`${DAY_NAMES[dates.indexOf(picker.date)]} — ${SLOT_LABELS[picker.slot]}`}
          meals={SLOT_MEALS[picker.slot]}
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

      {genOpen && <GenerateSheet onClose={() => setGenOpen(false)} onGenerate={generate} hasPlan={plan.length > 0} eaters={eaters} slots={slots} />}
      <p className="small muted center" style={{ marginTop: 24 }}>
        Les plats du planning alimentent la liste de courses. <Link to="/courses">Voir la liste</Link>
      </p>
    </div>
  );
}

/** Tableau de couverture : nutriments × jours, lacunes et recettes pour les combler */
function CoveragePanel({ dates, reports: all, eaters, recipes }: { dates: string[]; reports: Array<Array<DayReport | null>>; eaters: Eater[]; recipes: IndexedRecipe[] }) {
  const [day, setDay] = useState<number | null>(null);
  const [who, setWho] = useState(0);
  const w = Math.min(who, eaters.length - 1);
  const profile = eaters[w].profile;
  const portions = eaters[w].portions;
  const reports = all[w];
  const rows = [
    { key: 'kcal', label: '🔥 Énergie', group: 'macros' },
    { key: 'protein', label: '🥩 Protéines', group: 'macros' },
    ...NUTRIENTS.filter((n) => n.key !== 'cl').map((n) => ({ key: n.key, label: n.label.replace(/ \(.*\)/, ''), group: n.group as string })),
  ];
  const groups = ['macros', ...Object.keys(GROUP_LABELS)];
  // lacunes de la semaine : nutriments sous 80 % au moins un jour
  const gapCount = new Map<string, number>();
  for (const r of reports) if (r) for (const g of r.gaps) gapCount.set(g, (gapCount.get(g) ?? 0) + 1);
  const gaps = [...gapCount.entries()].sort((a, b) => b[1] - a[1]);
  const label = (k: string) => NUTRIENTS.find((n) => n.key === k)?.label ?? k;

  return (
    <section className="card pad section stack">
      <h2 style={{ margin: 0 }}>🔬 Couverture des besoins jour par jour</h2>
      {eaters.length > 1 && (
        <div className="chips">
          {eaters.map((e, i) => (
            <button key={e.profile.id} className={`chip ${i === w ? 'on' : ''}`} onClick={() => setWho(i)}>
              {e.profile.sex === 'homme' ? '👨' : '👩'} {e.profile.name}
            </button>
          ))}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        % du besoin journalier de {profile.name} ({portions === 1 ? '1 portion' : `${portions.toFixed(2).replace('.', ',')} portion`} de chaque plat). Vert ≥ 95 %, olive ≥ 80 %, jaune ≥ 60 %, rouge en dessous. Sodium : % de la limite (sel « au goût » non compté).
      </p>

      {gaps.length > 0 ? (
        <div className="callout">
          <strong>À renforcer cette semaine :</strong>
          <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {gaps.slice(0, 6).map(([k, n]) => (
              <li key={k} style={{ marginBottom: 4 }}>
                <strong>{label(k)}</strong> sous 80 % sur {n} jour{n > 1 ? 's' : ''} — bonnes sources :{' '}
                {bestSourcesOf(k, recipes).map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ', '}
                    <Link to={`/recette/${r.id}`}>{r.name}</Link>
                  </span>
                ))}
                {k === 'vD' && <> (la vitamine D vient aussi du soleil : 15–20 min bras découverts aux beaux jours)</>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="callout ok small">✅ Tous les nutriments suivis atteignent au moins 80 % chaque jour planifié.</div>
      )}

      <div className="cov-table-wrap">
        <table className="cov-table">
          <thead>
            <tr>
              <th />
              {dates.map((d, i) => (
                <th key={d}>
                  <button className={`chip ${day === i ? 'on' : ''}`} style={{ minHeight: 30, padding: '2px 8px' }} onClick={() => setDay(day === i ? null : i)}>
                    {DAY_NAMES[i].slice(0, 3)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FragmentRows key={g} title={g === 'macros' ? '⚖️ Énergie & macros' : GROUP_LABELS[g as keyof typeof GROUP_LABELS]} rows={rows.filter((r) => r.group === g)} reports={reports} />
            ))}
            <tr>
              <td className="cov-name">🧂 Sodium (limite)</td>
              {reports.map((r, i) => (
                <td key={i} className="cov-cell" style={{ background: r ? (r.pct.na > 115 ? 'var(--warn-soft)' : 'var(--olive-soft)') : undefined }}>
                  {r ? Math.round(r.pct.na) : '–'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {day != null && reports[day] && (
        <div className="small muted">
          {DAY_NAMES[day]} : {Math.round(reports[day]!.kcal)} kcal, {Math.round(reports[day]!.protein)} g de protéines, couverture {Math.round(reports[day]!.coverage)} %.
        </div>
      )}
    </section>
  );
}

function FragmentRows({ title, rows, reports }: { title: string; rows: Array<{ key: string; label: string }>; reports: Array<DayReport | null> }) {
  return (
    <>
      <tr>
        <td colSpan={8} className="cov-group">
          {title}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.key}>
          <td className="cov-name">{row.label}</td>
          {reports.map((r, i) => {
            const p = r ? r.pct[row.key] ?? 0 : null;
            return (
              <td key={i} className="cov-cell" style={p == null ? undefined : { background: covColor(p), color: '#fff' }}>
                {p == null ? '–' : p >= 999 ? '999+' : Math.round(p)}
              </td>
            );
          })}
        </tr>
      ))}
    </>
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
  onGenerate,
  hasPlan,
  eaters,
  slots,
}: {
  onClose: () => void;
  onGenerate: (o: { replaceAll: boolean; share: boolean; constraints: PlannerConstraints; mode: 'nutri' | 'variete' }) => void;
  hasPlan: boolean;
  eaters: Eater[];
  slots: Slot[];
}) {
  const [replaceAll, setReplaceAll] = useState(!hasPlan);
  const [share, setShare] = useState(true);
  const [mode, setMode] = useState<'nutri' | 'variete'>('nutri');
  const [constraints, setConstraints] = useState<PlannerConstraints>(loadConstraints);
  const fullDay = slots.length === 4;
  return (
    <Sheet title="🎯 Générer ma semaine" onClose={onClose}>
      <div className="stack">
        <div className="segmented">
          <button className={mode === 'nutri' ? 'on' : ''} onClick={() => setMode('nutri')}>
            🎯 Densité nutritionnelle
            <span className="cnt">viser 100 % des besoins</span>
          </button>
          <button className={mode === 'variete' ? 'on' : ''} onClick={() => setMode('variete')}>
            🎲 Variété simple
            <span className="cnt">rapide, sans calcul</span>
          </button>
        </div>
        {mode === 'nutri' && (
          <p className="small muted" style={{ margin: 0 }}>
            Chaque créneau est choisi pour que la journée couvre au mieux les besoins de{' '}
            {eaters.map((e, i) => (
              <span key={e.profile.id}>
                {i > 0 && ' et de '}
                <strong>{e.profile.name}</strong> ({e.profile.kcal} kcal)
              </span>
            ))}{' '}
            en 13 vitamines, 8 minéraux, électrolytes, oméga-3, fibres et acides aminés, tout en gardant de la variété (protéines différentes, jamais deux fois le même plat) et vos critères ci-dessous.
            {!fullDay && <strong> Astuce : activez les 4 repas (petit-déjeuner, midi, collation, soir) pour atteindre plus facilement 100 %.</strong>}
          </p>
        )}
        <ConstraintsEditor value={constraints} onChange={setConstraints} />
        <label className="row nowrap">
          <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} /> Tout regénérer (sinon : garder les plats déjà placés)
        </label>
        <label className="row nowrap">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> ♻️ Anti-gaspillage : réutiliser les mêmes produits frais
        </label>
        <button className="btn primary lg" onClick={() => onGenerate({ replaceAll, share, constraints, mode })}>
          {mode === 'nutri' ? '🎯 Optimiser ma semaine' : '🎲 Générer'}
        </button>
      </div>
    </Sheet>
  );
}

