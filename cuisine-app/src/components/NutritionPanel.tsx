import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IndexedRecipe } from '../domain/types';
import { useLibrary, useUserData } from '../hooks/library';
import { computeDetailed, dailyRef, DEFAULT_PROFILES, densityLabel, densityScore, formatAmount, GROUP_LABELS, NUTRIENTS, type NutrientDef } from '../domain/micronutrients';
import { saveSettings } from '../db/db';

/** Apports d'une portion : macros + vitamines, minéraux, électrolytes, acides aminés, en % des besoins du jour */
export function NutritionPanel({ recipe, portions = 1 }: { recipe: IndexedRecipe; portions?: number }) {
  const { lookup } = useLibrary();
  const { settings } = useUserData();
  const profiles = settings.profiles?.length ? settings.profiles : DEFAULT_PROFILES;
  const profile = profiles.find((p) => p.id === settings.activeProfile) ?? profiles[0];
  const [open, setOpen] = useState(false);
  const detail = useMemo(() => computeDetailed(recipe, lookup), [recipe, lookup]);
  const n = recipe.nutrition;
  const proteinTarget = profile.weight * profile.proteinPerKg;
  const pct = (v: number, ref: number) => (ref ? Math.round(((v * portions) / ref) * 100) : 0);

  const rows = NUTRIENTS.map((d) => ({ d, v: detail[d.key] ?? 0, ref: dailyRef(d, profile) }));
  const strengths = rows.filter((r) => !r.d.limit && r.d.group !== 'acides-amines' && pct(r.v, r.ref) >= 30).sort((a, b) => pct(b.v, b.ref) - pct(a.v, a.ref));
  const groups = [...new Set(NUTRIENTS.map((d) => d.group))];

  return (
    <section className="card pad stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>🔬 Apports nutritionnels</h2>
        <div className="chips">
          {profiles.map((p) => (
            <button key={p.id} className={`chip ${p.id === profile.id ? 'on' : ''}`} onClick={() => saveSettings({ activeProfile: p.id })}>
              {p.sex === 'homme' ? '👨' : '👩'} {p.name}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Pour {portions === 1 ? '1 portion' : `${portions} portions`}, en % des besoins journaliers de {profile.name} ({profile.weight} kg, objectif {profile.kcal} kcal et {Math.round(proteinTarget)} g de protéines/jour). <Link to="/reglages">Modifier les profils</Link>
      </p>

      {(() => {
        const sc = densityScore(detail, n.kcal);
        const dl = densityLabel(sc);
        return (
          <div className="row between card pad" style={{ background: 'var(--olive-soft)', boxShadow: 'none' }}>
            <div>
              <div className="label">🌿 Indice de densité nutritionnelle</div>
              <div className="small muted">part des besoins d’une journée couverte par 1 000 kcal de ce plat (22 nutriments)</div>
            </div>
            <strong style={{ fontSize: '1.5rem' }}>
              {dl.emoji} {sc}
              <span className="small muted"> / 100 · {dl.label}</span>
            </strong>
          </div>
        );
      })()}

      <div className="stack" style={{ gap: 4 }}>
        <Bar label="🔥 Énergie" value={`${n.kcal * portions} kcal`} pct={pct(n.kcal, profile.kcal)} />
        <Bar label="🥩 Protéines" value={`${n.protein * portions} g`} pct={pct(n.protein, proteinTarget)} />
        <Bar label="🍚 Glucides" value={`${n.carbs * portions} g`} pct={pct(n.carbs * 4, profile.kcal * 0.45)} hint="référence : 45 % de l’énergie" />
        <Bar label="🧈 Lipides" value={`${n.fat * portions} g`} pct={pct(n.fat * 9, profile.kcal * 0.35)} hint="référence : 35 % de l’énergie" />
      </div>

      {strengths.length > 0 && (
        <div>
          <span className="label">⭐ Points forts de ce plat (≥ 30 % du besoin du jour)</span>
          <div className="chips" style={{ marginTop: 6 }}>
            {strengths.slice(0, 10).map((r) => (
              <span key={r.d.key} className="tag ok">
                {r.d.label} {pct(r.v, r.ref)} %
              </span>
            ))}
          </div>
        </div>
      )}

      <button className="btn sm" onClick={() => setOpen(!open)}>
        {open ? '▲ Masquer le détail' : '▼ Vitamines, minéraux, électrolytes, acides aminés…'}
      </button>
      {open &&
        groups.map((g) => (
          <div key={g}>
            <h3 style={{ margin: '8px 0 4px' }}>{GROUP_LABELS[g]}</h3>
            {rows
              .filter((r) => r.d.group === g)
              .map((r) => (
                <Bar key={r.d.key} label={r.d.label} value={formatAmount(r.v * portions, r.d.unit)} pct={pct(r.v, r.ref)} hint={r.d.role} limit={r.d.limit} def={r.d} />
              ))}
          </div>
        ))}
      {open && (
        <p className="small muted" style={{ margin: 0 }}>
          Estimations à partir des tables Ciqual / USDA (aliments crus, valeurs moyennes) ; la cuisson réduit surtout la vitamine C et certaines vitamines B. Acides aminés : besoins OMS (mg/kg/jour). Le sel ajouté « au goût » n’est pas compté. Références : EFSA.
        </p>
      )}
    </section>
  );
}

function Bar({ label, value, pct, hint, limit }: { label: string; value: string; pct: number; hint?: string; limit?: boolean; def?: NutrientDef }) {
  const color = limit ? (pct > 50 ? 'var(--warn)' : 'var(--olive)') : pct >= 30 ? 'var(--ok)' : pct >= 10 ? 'var(--saffron)' : 'var(--ink-3)';
  return (
    <div className="nbar" title={hint}>
      <div className="row between nowrap small">
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span>
          <strong>{value}</strong> <span className="muted">· {pct} %{limit ? ' de la limite' : ''}</span>
        </span>
      </div>
      <div className="bar" style={{ height: 8 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}
