// Champs d'un profil, groupés par thème. Utilisés par l'accueil (une
// étape par groupe) et par la fiche complète dans Réglages.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NutritionProfile } from '../domain/micronutrients';
import { bmi, needs, objectiveOf, withTargets } from '../domain/profile';
import { DAILY_ACTIVITY, OBJECTIVES, SPORTS, type DailyActivity, type Objective, type SportType } from '../config/targets';
import { ALLERGENS, INTOLERANCES, SPICE_LEVELS, TEXTURES } from '../domain/allergens';
import { searchIngredients, useLibrary } from '../hooks/library';

export type FieldsProps = { p: NutritionProfile; set: (patch: Partial<NutritionProfile>) => void };

/** Applique une modification et recalcule les besoins */
export const patchProfile = (p: NutritionProfile, patch: Partial<NutritionProfile>) => withTargets({ ...p, ...patch });

const num = (v: string, fallback: number) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DURATIONS: Record<number, string> = { 30: '30 min', 45: '45 min', 60: '1 h', 90: '1 h 30', 120: '2 h' };
const DAY_FULL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function Choice({ on, onClick, emoji, label, hint }: { on: boolean; onClick: () => void; emoji: string; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" className={`choice ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="ce">{emoji}</span>
      <span>
        <strong>{label}</strong>
        {hint && <span className="ch">{hint}</span>}
      </span>
    </button>
  );
}

export function IdentityFields({ p, set }: FieldsProps) {
  return (
    <div className="form-grid">
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>Prénom</label>
        <input className="input" value={p.name} placeholder="Votre prénom" autoComplete="given-name" onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>Sexe</label>
        <div className="segmented">
          <button type="button" className={p.sex === 'homme' ? 'on' : ''} onClick={() => set({ sex: 'homme' })}>
            👨 Homme
          </button>
          <button type="button" className={p.sex === 'femme' ? 'on' : ''} onClick={() => set({ sex: 'femme' })}>
            👩 Femme
          </button>
        </div>
      </div>
      <div className="field">
        <label>Âge</label>
        <input className="input" type="number" inputMode="numeric" min={14} max={100} aria-label="Âge" value={p.age ?? ''} onChange={(e) => set({ age: num(e.target.value, p.age ?? 30) })} />
      </div>
      <div className="field">
        <label>Taille (cm)</label>
        <input className="input" type="number" inputMode="numeric" min={120} max={230} aria-label="Taille" value={p.height ?? ''} onChange={(e) => set({ height: num(e.target.value, p.height ?? 175) })} />
      </div>
      <div className="field">
        <label>Poids (kg)</label>
        <input className="input" type="number" inputMode="decimal" min={30} max={250} step="0.5" aria-label="Poids" value={p.weight} onChange={(e) => set({ weight: num(e.target.value, p.weight) })} />
      </div>
    </div>
  );
}

export function ActivityFields({ p, set }: FieldsProps) {
  const sport = p.sport ?? { sessions: 0, type: 'musculation' as SportType, minutes: 60 };
  const setSport = (patch: Partial<typeof sport>) => {
    const next = { ...sport, ...patch };
    // les jours cochés ne peuvent pas dépasser le nombre de séances
    const days = (p.trainingDays ?? []).slice(0, next.sessions);
    set({ sport: next, trainingDays: days });
  };
  const daily = p.daily ?? 'leger';
  return (
    <div className="stack">
      <div className="field">
        <label>En dehors du sport, votre journée type</label>
        <div className="choice-list">
          {(Object.keys(DAILY_ACTIVITY) as DailyActivity[]).map((d) => (
            <Choice key={d} on={daily === d && !!p.daily} onClick={() => set({ daily: d, activity: undefined })} emoji={DAILY_ACTIVITY[d].emoji} label={DAILY_ACTIVITY[d].label} hint={DAILY_ACTIVITY[d].hint} />
          ))}
        </div>
      </div>
      <div className="field">
        <label>Séances de sport par semaine</label>
        <div className="segmented">
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <button type="button" key={n} className={sport.sessions === n ? 'on' : ''} onClick={() => setSport({ sessions: n })} aria-label={`${n} séance${n > 1 ? 's' : ''}`}>
              {n === 6 ? '6+' : n}
            </button>
          ))}
        </div>
      </div>
      {sport.sessions > 0 && (
        <>
          <div className="field">
            <label>Type de sport</label>
            <div className="chips">
              {(Object.keys(SPORTS) as SportType[]).map((t) => (
                <button type="button" key={t} className={`chip ${sport.type === t ? 'on' : ''}`} onClick={() => setSport({ type: t })}>
                  {SPORTS[t].emoji} {SPORTS[t].label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Durée d’une séance</label>
            <div className="segmented">
              {[30, 45, 60, 90, 120].map((m) => (
                <button type="button" key={m} className={sport.minutes === m ? 'on' : ''} onClick={() => setSport({ minutes: m })}>
                  {DURATIONS[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Jours d’entraînement habituels (facultatif)</label>
            <div className="segmented">
              {DAY_LETTERS.map((l, d) => {
                const on = p.trainingDays?.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    aria-label={DAY_FULL[d]}
                    className={on ? 'on' : ''}
                    onClick={() => {
                      const cur = p.trainingDays ?? [];
                      const next = on ? cur.filter((x) => x !== d) : [...cur, d].sort();
                      set({ trainingDays: next, sport: { ...sport, sessions: Math.max(sport.sessions, next.length) } });
                    }}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <span className="small muted">Ces jours-là, l’appli prévoit un peu plus d’énergie et de glucides.</span>
          </div>
        </>
      )}
    </div>
  );
}

export function ObjectiveFields({ p, set }: FieldsProps) {
  const obj = objectiveOf(p);
  return (
    <div className="stack">
      <div className="choice-list">
        {(Object.keys(OBJECTIVES) as Objective[]).map((o) => (
          <Choice key={o} on={obj === o} onClick={() => set({ objective: o, goal: undefined })} emoji={OBJECTIVES[o].emoji} label={OBJECTIVES[o].label} hint={OBJECTIVES[o].hint} />
        ))}
      </div>
      {obj && OBJECTIVES[obj].usesPace && (
        <div className="field">
          <label>Rythme</label>
          <div className="segmented">
            <button type="button" className={p.pace === 'prudent' ? 'on' : ''} onClick={() => set({ pace: 'prudent' })}>
              🐢 Prudent
              <span className="cnt">{obj === 'perte-de-poids' ? '−10 %' : '+5 %'}</span>
            </button>
            <button type="button" className={(p.pace ?? 'standard') === 'standard' ? 'on' : ''} onClick={() => set({ pace: 'standard' })}>
              🚶 Standard
              <span className="cnt">{obj === 'perte-de-poids' ? '−20 %' : '+10 %'}</span>
            </button>
          </div>
        </div>
      )}
      <label className="row nowrap small">
        <input type="checkbox" checked={!!p.hideNumbers} onChange={(e) => set({ hideNumbers: e.target.checked })} />
        Ne pas m’afficher les calories ni le poids (l’appli continue de calculer en coulisses)
      </label>
    </div>
  );
}

function IngredientChips({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const { ingredients, lookup } = useLibrary();
  const [q, setQ] = useState('');
  const results = useMemo(() => (q.trim().length > 1 ? searchIngredients(q, ingredients, 8).filter((i) => !value.includes(i.id)) : []), [q, ingredients, value]);
  return (
    <div className="stack" style={{ gap: 6 }}>
      {value.length > 0 && (
        <div className="chips">
          {value.map((id) => (
            <button type="button" key={id} className="chip on" onClick={() => onChange(value.filter((x) => x !== id))}>
              {lookup(id)?.name ?? id} <span className="x">✕</span>
            </button>
          ))}
        </div>
      )}
      <input className="input" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <div className="chips">
          {results.map((i) => (
            <button
              type="button"
              key={i.id}
              className="chip"
              onClick={() => {
                onChange([...value, i.id]);
                setQ('');
              }}
            >
              {i.emoji} {i.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function toggle(list: string[] | undefined, k: string) {
  const cur = list ?? [];
  return cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
}

export function TasteFields({ p, set }: FieldsProps) {
  return (
    <div className="stack">
      <div className="field">
        <label>Allergies</label>
        <div className="chips">
          {Object.entries(ALLERGENS).map(([k, a]) => (
            <button type="button" key={k} className={`chip ${p.allergies?.includes(k) ? 'on' : ''}`} onClick={() => set({ allergies: toggle(p.allergies, k) })}>
              {a.emoji} {a.label.replace(/ \(.*\)/, '')}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Intolérances, digestion</label>
        <div className="chips">
          {Object.entries(INTOLERANCES).map(([k, a]) => (
            <button type="button" key={k} className={`chip ${p.intolerances?.includes(k) ? 'on' : ''}`} title={a.hint} onClick={() => set({ intolerances: toggle(p.intolerances, k) })}>
              {a.emoji} {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Je n’aime pas</label>
        <IngredientChips value={p.dislikes ?? []} onChange={(dislikes) => set({ dislikes })} placeholder="ex. foie, chou-fleur, coriandre…" />
      </div>
      <div className="field">
        <label>J’adore</label>
        <IngredientChips value={p.likes ?? []} onChange={(likes) => set({ likes })} placeholder="ex. agneau, patate douce, comté…" />
      </div>
      <div className="field">
        <label>Piquant</label>
        <div className="segmented">
          {SPICE_LEVELS.map((l, i) => (
            <button type="button" key={l} className={(p.spice ?? 1) === i ? 'on' : ''} onClick={() => set({ spice: i })}>
              {'🌶️'.repeat(i) || '🚫'}
              <span className="cnt">{l}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Textures préférées</label>
        <div className="chips">
          {Object.entries(TEXTURES).map(([k, l]) => (
            <button type="button" key={k} className={`chip ${p.textures?.includes(k) ? 'on' : ''}`} onClick={() => set({ textures: toggle(p.textures, k) })}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Résumé des besoins (respecte « masquer les chiffres ») */
export function NeedsSummary({ p, link = true }: { p: NutritionProfile; link?: boolean }) {
  const n = needs(p);
  if (!n) return <div className="callout info small">Complétez âge, taille et poids pour calculer vos besoins.</div>;
  const imc = bmi(p);
  return (
    <div className="callout info small stack" style={{ margin: 0, gap: 4 }}>
      {p.hideNumbers ? (
        <span>
          🎯 Vos besoins sont calculés : l’appli s’en sert pour doser les parts et choisir les recettes{n.protein ? ', avec une attention particulière aux protéines' : ''}.
        </span>
      ) : (
        <span>
          🎯 <strong>{n.kcal.toLocaleString('fr-FR')} kcal</strong> · 🥩 <strong>{n.protein} g</strong> de protéines · 🧈 {n.fat} g de lipides · 🍚 {n.carbs} g de glucides par jour
          {Object.values(n.manual).some(Boolean) ? ' (en partie saisis à la main)' : ''}.
          <span className="muted">
            {' '}
            Dépense estimée {n.tdee.toLocaleString('fr-FR')} kcal{imc ? `, IMC ${String(imc).replace('.', ',')}` : ''}.
          </span>
        </span>
      )}
      {link && (
        <Link to={`/besoins/${p.id}`} className="small">
          Comprendre et ajuster ›
        </Link>
      )}
    </div>
  );
}
