import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../hooks/library';
import { setActiveProfile, useActiveProfile } from '../hooks/activeProfile';
import { usePlanAnalysis } from '../hooks/plan';
import { mondayOf, weekDates, DAY_NAMES } from '../domain/season';
import { formatAmount, GROUP_LABELS } from '../domain/micronutrients';
import { commonIngredients, foodSourcesFor, WEEK_NUTRIENTS } from '../domain/week';
import { bestSourcesOf } from '../domain/nutriPlanner';
import { formatDateFr, deName } from '../components/format';
import { Empty } from '../components/ui';
import { covColor } from './Planner';

const fr = (v: number, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

/** Conseils pour les excès, par nutriment */
const EXCESS_TIPS: Record<string, string> = {
  vA: 'Souvent dû au foie : une portion par semaine suffit largement. La limite concerne la vitamine A « toute faite » (foie, huile de foie de morue), pas celle des carottes.',
  na: 'Le sel des recettes, du fromage et de la charcuterie s’additionne : salez moins à table cette semaine.',
  se: 'Les noix du Brésil et certains poissons en sont très riches : espacez-les.',
  zn: 'Les huîtres en apportent énormément : une douzaine par semaine suffit.',
  i: 'Les algues (nori, kombu) sont très riches en iode : à petites doses.',
  cu: 'Le foie de veau et le cacao en apportent beaucoup : espacez-les.',
  vD: 'Surtout dû à l’huile de foie de morue ou aux compléments : vérifiez les doses.',
};

/** « Ma semaine » : la couverture se juge sur la semaine, pas jour par jour */
export function MyWeek() {
  const [offset, setOffset] = useState(0);
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offset * 7);
  const dates = weekDates(monday);
  const { recipes, ingredients } = useLibrary();
  const common = useMemo(() => commonIngredients(recipes), [recipes]);
  const active = useActiveProfile();
  const { weeks, eaters, loaded } = usePlanAnalysis(dates);
  const w = weeks.find((x) => x.profile.id === active.id) ?? weeks[0];
  const hide = !!w?.profile.hideNumbers;

  return (
    <div className="page stack">
      <div className="row between nowrap">
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Semaine précédente">
          ‹
        </button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0 }}>{offset === 0 ? 'Mon bilan de la semaine' : 'Bilan de la semaine'}</h1>
          <div className="small muted">
            du {formatDateFr(dates[0], { day: 'numeric', month: 'long' })} au {formatDateFr(dates[6], { day: 'numeric', month: 'long' })}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Semaine suivante">
          ›
        </button>
      </div>
      {eaters.length > 1 && (
        <div className="chips">
          {eaters.map((p) => (
            <button key={p.id} className={`chip ${w?.profile.id === p.id ? 'on' : ''}`} onClick={() => setActiveProfile(p.id)}>
              {p.sex === 'homme' ? '👨' : '👩'} {p.name}
            </button>
          ))}
        </div>
      )}
      {!loaded ? null : !w || !w.days.length ? (
        <Empty emoji="📅" title="Rien de prévu cette semaine">
          <Link to="/semaine" className="btn primary">
            Planifier la semaine
          </Link>
        </Empty>
      ) : (
        <>
          <section className="card pad stack">
            <div className="needs-grid">
              <div className="need">
                <div className="nl">🌿 Vitamines et minéraux</div>
                <div className="nv" style={{ color: covColor(w.coverage) }}>{Math.round(w.coverage)} %</div>
                <div className="nl">couverture moyenne sur {w.days.length} jour{w.days.length > 1 ? 's' : ''} planifié{w.days.length > 1 ? 's' : ''}</div>
              </div>
              <div className="need">
                <div className="nl">🥩 Protéines</div>
                <div className="nv">{fr(w.proteinAvg)} g</div>
                <div className="nl">par jour en moyenne</div>
              </div>
              {!hide && (
                <div className="need">
                  <div className="nl">🔥 Énergie</div>
                  <div className="nv">{fr(w.kcalAvg)}</div>
                  <div className="nl">kcal par jour en moyenne</div>
                </div>
              )}
              <div className="need">
                <div className="nl">✅ À 100 %</div>
                <div className="nv">{WEEK_NUTRIENTS.filter((n) => !n.limit && w.pct[n.key] >= 99.5).length}</div>
                <div className="nl">nutriments sur {WEEK_NUTRIENTS.filter((n) => !n.limit).length}</div>
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Le corps fait des réserves (fer, vitamines A, D et B12, oméga-3…) : on regarde la moyenne de la semaine. Un jour plus faible n’est pas un problème si les autres compensent. Les compléments proposés dans « Ma journée » sont comptés.
            </p>
          </section>

          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>{w.gaps.length ? '🎯 Ce qui manque sur la semaine' : '🎉 Tout est couvert cette semaine'}</h2>
            {w.gaps.map((def) => {
              const foods = foodSourcesFor(def, w.profile, ingredients, 3, common);
              const recs = bestSourcesOf(def.key, recipes, (r) => r.mealTypes.includes('dejeuner') || r.mealTypes.includes('diner'), 2);
              return (
                <div key={def.key} className="stack" style={{ gap: 4, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <div className="row between nowrap">
                    <strong>{def.label}</strong>
                    <span className="tag warn">{Math.round(w.pct[def.key])} %</span>
                  </div>
                  <div className="small muted">{def.role}</div>
                  <div className="small">
                    Pour compléter :{' '}
                    {foods.map((f, i) => (
                      <span key={f.ing.id}>
                        {i > 0 && ' · '}
                        {f.ing.emoji} {f.grams} g {deName(f.ing.name)} ({Math.round(f.pct)} % du besoin d’un jour)
                      </span>
                    ))}
                  </div>
                  {recs.length > 0 && (
                    <div className="small">
                      Ou une recette :{' '}
                      {recs.map((r, i) => (
                        <span key={r.id}>
                          {i > 0 && ' · '}
                          <Link to={`/recette/${r.id}`}>{r.name}</Link>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {w.dips.length > 0 && (
            <section className="card pad stack">
              <h2 style={{ margin: 0 }}>🔄 Creux compensés</h2>
              <p className="small muted" style={{ margin: 0 }}>
                Sous 80 % certains jours, mais à 100 % sur la semaine : rien à faire.
              </p>
              <div className="chips">
                {w.dips.map((d) => (
                  <span key={d.def.key} className="tag ok">
                    {d.def.label.replace(/ \(.*\)/, '')} : {d.days.map((x) => DAY_NAMES[(new Date(x + 'T12:00:00').getDay() + 6) % 7].slice(0, 3).toLowerCase()).join(', ')}
                  </span>
                ))}
              </div>
            </section>
          )}

          {w.excess.length > 0 && (
            <section className="card pad stack">
              <h2 style={{ margin: 0 }}>⚠️ À surveiller</h2>
              {w.excess.map((e) => (
                <div key={e.def.key} className="callout small" style={{ margin: 0 }}>
                  <strong>{e.def.label}</strong> : {formatAmount(e.avg, e.def.unit)} par jour en moyenne, {e.def.limit ? 'au-dessus du repère' : 'au-dessus de la limite de sécurité'} ({formatAmount(e.limit, e.def.unit)}).{' '}
                  {EXCESS_TIPS[e.def.key] ?? ''}
                </div>
              ))}
            </section>
          )}

          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>📋 Le détail</h2>
            {(['vitamines', 'mineraux', 'electrolytes', 'lipides', 'autres', 'acides-amines'] as const).map((g) => (
              <div key={g} className="stack" style={{ gap: 4 }}>
                <strong className="small">{GROUP_LABELS[g]}</strong>
                {WEEK_NUTRIENTS.filter((n) => n.group === g).map((n) => {
                  const p = Math.round(w.pct[n.key]);
                  return (
                    <div key={n.key} className="nbar">
                      <div className="row between nowrap small">
                        <span>{n.label.replace(/ \(.*\)/, '')}</span>
                        <span className="muted">
                          {p} %{n.limit ? ' de la limite' : ''}
                        </span>
                      </div>
                      <div className="bar" style={{ height: 6 }}>
                        <div style={{ width: `${Math.min(100, p)}%`, background: n.limit ? (p > 100 ? 'var(--danger)' : 'var(--olive)') : covColor(p) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/ma-journee" className="btn">
              ☀️ Ma journée
            </Link>
            <Link to="/semaine" className="btn">
              📅 Modifier le planning
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
