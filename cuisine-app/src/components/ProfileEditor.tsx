import type { NutritionProfile } from '../domain/micronutrients';
import { ACTIVITIES, bmi, computeTargets, GOALS, withTargets, type Activity, type Goal } from '../domain/profile';

/** Fiche d'une personne : données personnelles → besoins calculés */
export function ProfileEditor({ value, onChange, onRemove }: { value: NutritionProfile; onChange: (p: NutritionProfile) => void; onRemove?: () => void }) {
  const p = value;
  const set = (patch: Partial<NutritionProfile>) => onChange(withTargets({ ...p, ...patch }));
  const t = computeTargets(p);
  const imc = bmi(p);
  const num = (v: string, fallback: number) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return (
    <div className="card pad stack" style={{ boxShadow: 'none' }}>
      <div className="form-grid">
        <div className="field">
          <label>Prénom</label>
          <input className="input" value={p.name} placeholder="Votre prénom" onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Sexe</label>
          <div className="segmented">
            <button className={p.sex === 'homme' ? 'on' : ''} onClick={() => set({ sex: 'homme' })}>
              👨 Homme
            </button>
            <button className={p.sex === 'femme' ? 'on' : ''} onClick={() => set({ sex: 'femme' })}>
              👩 Femme
            </button>
          </div>
        </div>
        <div className="field">
          <label>Âge</label>
          <input className="input" type="number" inputMode="numeric" min={14} max={100} value={p.age ?? ''} onChange={(e) => set({ age: num(e.target.value, p.age ?? 30) })} />
        </div>
        <div className="field">
          <label>Taille (cm)</label>
          <input className="input" type="number" inputMode="numeric" min={120} max={230} value={p.height ?? ''} onChange={(e) => set({ height: num(e.target.value, p.height ?? 175) })} />
        </div>
        <div className="field">
          <label>Poids (kg)</label>
          <input className="input" type="number" inputMode="decimal" min={30} max={250} step="0.5" value={p.weight} onChange={(e) => set({ weight: num(e.target.value, p.weight) })} />
        </div>
      </div>

      <div className="field">
        <label>Activité physique</label>
        <select className="select" value={p.activity ?? 'modere'} onChange={(e) => set({ activity: e.target.value as Activity })}>
          {(Object.keys(ACTIVITIES) as Activity[]).map((a) => (
            <option key={a} value={a}>
              {ACTIVITIES[a].label} — {ACTIVITIES[a].hint}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Objectif</label>
        <div className="chips">
          {(Object.keys(GOALS) as Goal[]).map((g) => (
            <button key={g} className={`chip ${p.goal === g ? 'on' : ''}`} onClick={() => set({ goal: g })}>
              {GOALS[g].emoji} {GOALS[g].label}
            </button>
          ))}
        </div>
        {p.goal && <span className="small muted">{GOALS[p.goal].hint}</span>}
      </div>

      <div className="callout info small" style={{ margin: 0 }}>
        {t ? (
          <>
            🎯 <strong>{p.kcal} kcal</strong> et <strong>{Math.round(p.weight * p.proteinPerKg)} g de protéines</strong> par jour
            {p.manualTargets ? ' (saisis à la main)' : ''}.
            <span className="muted">
              {' '}
              Métabolisme de base {t.bmr} kcal, dépense estimée {t.tdee} kcal{imc ? `, IMC ${String(imc).replace('.', ',')}` : ''}.
            </span>
          </>
        ) : (
          'Complétez âge, taille, poids, activité et objectif pour calculer vos besoins.'
        )}
      </div>

      <label className="row nowrap small">
        <input type="checkbox" checked={!!p.manualTargets} onChange={(e) => set({ manualTargets: e.target.checked })} />
        Ajuster moi-même les calories et les protéines (conseil d’un·e diététicien·ne, suivi du poids…)
      </label>
      {p.manualTargets && (
        <div className="form-grid">
          <div className="field">
            <label>Calories / jour</label>
            <input className="input" type="number" inputMode="numeric" value={p.kcal} onChange={(e) => set({ kcal: num(e.target.value, p.kcal) })} />
          </div>
          <div className="field">
            <label>Protéines (g / kg)</label>
            <input className="input" type="number" inputMode="decimal" step="0.1" value={p.proteinPerKg} onChange={(e) => set({ proteinPerKg: num(e.target.value, p.proteinPerKg) })} />
          </div>
        </div>
      )}
      {onRemove && (
        <div>
          <button className="btn ghost sm danger" onClick={onRemove}>
            Retirer cette personne
          </button>
        </div>
      )}
    </div>
  );
}
