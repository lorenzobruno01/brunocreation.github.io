import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import { useStoredProfiles } from '../hooks/library';
import { setActiveProfile, useActiveProfile } from '../hooks/activeProfile';
import { applyAdjustment, dailyWeights, reviewWeight, smooth } from '../domain/weight';
import { saveProfiles } from '../components/Household';
import { patchProfile } from '../components/ProfileFields';
import { formatDateFr } from '../components/format';
import { isoDate } from '../domain/season';
import { useToast } from '../components/ui';

const fr = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

function Chart({ points }: { points: Array<{ date: string; kg: number; trend: number }> }) {
  if (points.length < 2) return null;
  const W = 340;
  const H = 160;
  const pad = 26;
  const t0 = new Date(points[0].date).getTime();
  const t1 = new Date(points[points.length - 1].date).getTime();
  const all = points.flatMap((p) => [p.kg, p.trend]);
  const lo = Math.floor(Math.min(...all) - 0.5);
  const hi = Math.ceil(Math.max(...all) + 0.5);
  const x = (d: string) => pad + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad - 8);
  const y = (kg: number) => 8 + ((hi - kg) / Math.max(0.1, hi - lo)) * (H - 30);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Courbe du poids">
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={pad} x2={W - 8} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={2} y={y(v) + 4} fontSize="10" fill="var(--ink-3)">
            {fr(v, 0)}
          </text>
        </g>
      ))}
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={2.5} fill="var(--ink-3)" opacity={0.6} />
      ))}
      <polyline fill="none" stroke="var(--primary)" strokeWidth={2.5} points={points.map((p) => `${x(p.date)},${y(p.trend)}`).join(' ')} />
      <text x={pad} y={H - 4} fontSize="10" fill="var(--ink-3)">
        {formatDateFr(points[0].date, { day: 'numeric', month: 'short' })}
      </text>
      <text x={W - 8} y={H - 4} fontSize="10" fill="var(--ink-3)" textAnchor="end">
        {formatDateFr(points[points.length - 1].date, { day: 'numeric', month: 'short' })}
      </text>
    </svg>
  );
}

/** « Mon poids » : pesées, tendance lissée, bilan à 14 jours (proposition, jamais imposée) */
export function Weight() {
  const stored = useStoredProfiles();
  const profiles = stored ?? [];
  const me = useActiveProfile(profiles);
  const rows = useLiveQuery(() => db.weights.where('profileId').equals(me.id).toArray(), [me.id]);
  const logs = useMemo(() => rows ?? [], [rows]);
  const [kg, setKg] = useState('');
  const [reveal, setReveal] = useState(false);
  const toast = useToast();
  const points = useMemo(() => smooth(dailyWeights(logs)), [logs]);
  const review = useMemo(() => reviewWeight(me, logs), [me, logs]);
  const snoozed = me.reviewSnoozedUntil && me.reviewSnoozedUntil > isoDate(new Date());
  const hide = !!me.hideNumbers && !reveal;

  const save = (np: typeof me) => saveProfiles(profiles.map((p) => (p.id === np.id ? np : p)));
  const add = async () => {
    const v = Number(kg.replace(',', '.'));
    if (!(v > 25 && v < 300)) return toast('Poids invalide');
    const date = isoDate(new Date());
    await db.weights.put({ id: `${me.id}-${date}`, profileId: me.id, date, kg: v });
    // le profil suit la tendance (sert au calcul des besoins)
    const trend = smooth(dailyWeights([...logs.filter((l) => l.date !== date), { id: newId(), profileId: me.id, date, kg: v }]));
    await save(patchProfile(me, { weight: Math.round(trend[trend.length - 1].trend * 10) / 10 }));
    setKg('');
    toast('Pesée enregistrée ⚖️');
  };

  if (!stored || !rows) return null;
  return (
    <div className="page stack">
      <h1 style={{ margin: 0 }}>⚖️ {profiles.length > 1 ? `Poids de ${me.name}` : 'Mon poids'}</h1>
      {profiles.length > 1 && (
        <div className="chips">
          {profiles.map((p) => (
            <button key={p.id} className={`chip ${p.id === me.id ? 'on' : ''}`} onClick={() => setActiveProfile(p.id)}>
              {p.sex === 'homme' ? '👨' : '👩'} {p.name}
            </button>
          ))}
        </div>
      )}
      {hide ? (
        <section className="card pad stack">
          <p style={{ margin: 0 }}>Le suivi du poids est masqué pour ce profil (option « ne pas afficher les chiffres »). L’appli n’en a pas besoin pour fonctionner.</p>
          <div>
            <button className="btn sm" onClick={() => setReveal(true)}>
              Afficher quand même
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="card pad stack">
            <div className="row nowrap" style={{ gap: 8 }}>
              <input className="input" inputMode="decimal" placeholder={`ex. ${fr(me.weight)}`} aria-label="Poids du jour (kg)" value={kg} onChange={(e) => setKg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button className="btn primary" onClick={add}>
                Enregistrer
              </button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Le matin, à jeun, 2 à 3 fois par semaine. Le poids d’un jour varie de ±1 kg avec l’eau et le sel : seule la tendance (trait orange) compte.
            </p>
            <Chart points={points} />
            {points.length > 0 && (
              <p className="small" style={{ margin: 0 }}>
                Tendance actuelle : <strong>{fr(points[points.length - 1].trend)} kg</strong> ({points.length} pesée{points.length > 1 ? 's' : ''})
              </p>
            )}
          </section>

          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>🗓 Bilan sur 14 jours</h2>
            <p style={{ margin: 0 }}>{review.message}</p>
            {review.proposal && !snoozed && (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="btn primary"
                    onClick={async () => {
                      await save(patchProfile(applyAdjustment(me, review), {}));
                      toast(`Objectif passé à ${review.proposal!.toLocaleString('fr-FR')} kcal : les parts du planning suivent ✅`);
                    }}
                  >
                    ✅ Appliquer
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 7);
                      save({ ...me, reviewSnoozedUntil: isoDate(d) });
                    }}
                  >
                    Plus tard
                  </button>
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  C’est une proposition : rien ne change sans votre accord. Vous pouvez aussi ajuster à la main dans <Link to="/besoins">Mes besoins</Link>.
                </p>
              </>
            )}
            {snoozed && review.proposal && <p className="small muted" style={{ margin: 0 }}>Proposition reportée au {formatDateFr(me.reviewSnoozedUntil!, { day: 'numeric', month: 'long' })}.</p>}
            {!!me.adjustments?.length && (
              <div className="small">
                <strong>Ajustements passés :</strong>
                {me.adjustments
                  .slice()
                  .reverse()
                  .map((a) => (
                    <div key={a.date + a.to}>
                      {formatDateFr(a.date, { day: 'numeric', month: 'short' })} : {a.from.toLocaleString('fr-FR')} → {a.to.toLocaleString('fr-FR')} kcal ({a.reason})
                    </div>
                  ))}
              </div>
            )}
          </section>

          {points.length > 0 && (
            <section className="card pad stack">
              <h2 style={{ margin: 0 }}>📋 Pesées</h2>
              {[...logs]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 15)
                .map((l) => (
                  <div key={l.id} className="row between nowrap small">
                    <span>{formatDateFr(l.date)}</span>
                    <span className="row nowrap" style={{ gap: 6 }}>
                      <strong>{fr(l.kg)} kg</strong>
                      <button className="icon-btn" aria-label="Supprimer la pesée" onClick={() => db.weights.delete(l.id)}>
                        🗑
                      </button>
                    </span>
                  </div>
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
