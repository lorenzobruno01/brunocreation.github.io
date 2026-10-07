import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../hooks/library';
import { useActiveProfile } from '../hooks/activeProfile';
import { usePlanAnalysis } from '../hooks/plan';
import { isoDate } from '../domain/season';
import { mainPortion, cookServings } from '../domain/shares';
import { dailyRef, NUTRIENTS } from '../domain/micronutrients';
import { SLOT_LABELS } from '../components/AddToPlanSheet';
import { formatDateFr, deName } from '../components/format';
import { Empty } from '../components/ui';
import { RecipeVisual } from '../components/RecipeVisual';
import type { Slot } from '../domain/types';
import { usePendingFeedback } from '../hooks/feedback';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { reviewWeight } from '../domain/weight';

const ORDER: Slot[] = ['matin', 'midi', 'collation', 'soir'];
const fr = (v: number, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

/** « Ma journée » : ce que je mange aujourd'hui, ma part, ce qu'il manque */
export function MyDay() {
  const [offset, setOffset] = useState(0);
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const date = isoDate(d);
  // la semaine entière sert à dire si un creux du jour est compensé
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return isoDate(x);
  });
  const { byId, lookup } = useLibrary();
  const active = useActiveProfile();
  const { weeks, eaters, loaded } = usePlanAnalysis(dates);
  const wi = Math.max(0, eaters.findIndex((p) => p.id === active.id));
  const week = weeks[wi];
  const me = week?.profile ?? active;
  const day = week?.days.find((x) => x.date === date);
  const hide = !!me.hideNumbers;
  const pending = usePendingFeedback(me.id);
  const logs = useLiveQuery(() => db.weights.where('profileId').equals(me.id).toArray(), [me.id]);
  const review = logs && !hide ? reviewWeight(me, logs) : null;
  const showReview = review?.proposal && !(me.reviewSnoozedUntil && me.reviewSnoozedUntil > isoDate(new Date()));
  const others = weeks.filter((_, i) => i !== wi).map((w) => w.days.find((x) => x.date === date)).filter(Boolean);

  const lows = day
    ? NUTRIENTS.filter((n) => !n.limit && n.group !== 'acides-amines' && n.key !== 'cl')
        .map((n) => ({ n, pct: ((day.intake[n.key] ?? 0) / dailyRef(n, me)) * 100 }))
        .filter((x) => x.pct < 80)
        .sort((a, b) => a.pct - b.pct)
    : [];

  return (
    <div className="page stack">
      <div className="row between nowrap">
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Jour précédent">
          ‹
        </button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0 }}>{offset === 0 ? 'Ma journée' : formatDateFr(date, { weekday: 'long' })}</h1>
          <div className="small muted">
            {formatDateFr(date)}
            {eaters.length > 1 ? ` · ${me.name}` : ''}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Jour suivant">
          ›
        </button>
      </div>
      {pending.length > 0 && (
        <Link to="/appris" className="callout info small row between nowrap" style={{ textDecoration: 'none', color: 'inherit', margin: 0 }}>
          <span>
            💬 {pending.length} repas attend{pending.length > 1 ? 'ent' : ''} votre avis
          </span>
          <span>›</span>
        </Link>
      )}
      {showReview && (
        <Link to="/poids" className="callout small row between nowrap" style={{ textDecoration: 'none', color: 'inherit', margin: 0 }}>
          <span>⚖️ Bilan du poids : une proposition d’ajustement vous attend</span>
          <span>›</span>
        </Link>
      )}
      {!active.id || !loaded ? null : !eaters.some((p) => p.id === active.id) ? (
        <div className="callout small">Le planning est fait pour {eaters.map((p) => p.name).join(', ')}. Choisissez ce profil (en haut) ou planifiez pour tout le foyer.</div>
      ) : !day ? (
        <Empty emoji="📅" title="Rien de prévu ce jour-là">
          <Link to="/semaine" className="btn primary">
            Planifier la semaine
          </Link>
        </Empty>
      ) : (
        <>
          <section className="card pad stack">
            {ORDER.map((slot) => {
              const e = day.entries.find((x) => x.slot === slot);
              const r = e && byId.get(e.recipeId);
              if (!r) return null;
              const main = mainPortion(r, lookup);
              const total = cookServings([day.share, ...others.map((o) => o!.share)]);
              return (
                <Link key={slot} to={`/recette/${r.id}`} className="row nowrap" style={{ textDecoration: 'none', color: 'inherit', gap: 12 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flex: 'none' }}>
                    <RecipeVisual recipe={r} showFlag={false} />
                  </div>
                  <div className="grow">
                    <div className="small muted">{SLOT_LABELS[slot]}</div>
                    <strong>{r.name}</strong>
                    <div className="small">
                      Ma part : <strong>{fr(day.share.portion, 2)} portion</strong>
                      {main ? ` ≈ ${fr(Math.round((main.grams * day.share.portion) / 5) * 5)} g ${deName(main.ing.name)} (cru)` : ''}
                      {hide ? '' : ` · ${fr(r.nutrition.kcal * day.share.portion)} kcal`} · {fr(r.nutrition.protein * day.share.portion)} g de protéines
                    </div>
                    {others.length > 0 && <div className="small muted">À cuisiner pour {fr(total, 1)} portions</div>}
                  </div>
                </Link>
              );
            })}
          </section>

          {day.share.complements.length > 0 && (
            <section className="card pad stack" style={{ background: 'var(--olive-soft)' }}>
              <h2 style={{ margin: 0 }}>➕ Pour atteindre vos besoins aujourd’hui</h2>
              <p className="small muted" style={{ margin: 0 }}>
                La part des plats ne suffit pas à couvrir {me.hideNumbers ? 'vos besoins' : 'votre énergie et vos protéines'} : ajoutez à un repas ou en collation…
              </p>
              {day.share.complements.map((c) => (
                <div key={c.def.id} className="row nowrap">
                  <span style={{ fontSize: '1.4rem' }}>{c.def.emoji}</span>
                  <span>
                    {c.def.label}
                    <span className="small muted">
                      {' '}
                      ({hide ? '' : `+${c.kcal} kcal, `}+{c.protein} g de protéines)
                    </span>
                  </span>
                </div>
              ))}
            </section>
          )}

          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>📊 Mon bilan du jour</h2>
            <div className="needs-grid">
              {!hide && (
                <div className="need">
                  <div className="nl">🔥 Énergie</div>
                  <div className="nv">{fr(day.kcal)}</div>
                  <div className="nl">sur {fr(day.share.target.kcal)} kcal visées</div>
                </div>
              )}
              <div className="need">
                <div className="nl">🥩 Protéines</div>
                <div className="nv">{fr(day.protein)} g</div>
                <div className="nl">sur {fr(day.share.target.protein)} g visés</div>
              </div>
              <div className="need">
                <div className="nl">🌿 Vitamines et minéraux</div>
                <div className="nv">{fr(NUTRIENTS.filter((n) => !n.limit && n.group !== 'acides-amines' && n.key !== 'cl').filter((n) => ((day.intake[n.key] ?? 0) / dailyRef(n, me)) * 100 >= 99.5).length)}</div>
                <div className="nl">sur {NUTRIENTS.filter((n) => !n.limit && n.group !== 'acides-amines' && n.key !== 'cl').length} couverts à 100 % aujourd’hui</div>
              </div>
            </div>
            {lows.length > 0 && (
              <div className="small">
                <strong>Un peu justes aujourd’hui :</strong>{' '}
                {lows.map(({ n, pct }) => {
                  const ok = (week?.pct[n.key] ?? 0) >= 99.5;
                  return (
                    <span key={n.key} className={`tag ${ok ? 'ok' : 'warn'}`} style={{ marginRight: 4, marginBottom: 4 }}>
                      {n.label.replace(/ \(.*\)/, '')} {Math.round(pct)} %{ok ? ' · compensé dans la semaine' : ''}
                    </span>
                  );
                })}
              </div>
            )}
            <Link to="/ma-semaine" className="btn">
              📊 Voir mon bilan de la semaine
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
