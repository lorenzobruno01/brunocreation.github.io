import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStoredProfiles } from '../hooks/library';
import { DEFAULT_PROFILES } from '../domain/micronutrients';
import { setActiveProfile, useActiveProfile } from '../hooks/activeProfile';
import { saveProfiles } from '../components/Household';
import { patchProfile, DAY_LETTERS } from '../components/ProfileFields';
import { dayKcal, needs } from '../domain/profile';
import { dailyRef, formatAmount, GROUP_LABELS, NUTRIENTS, type NutritionProfile } from '../domain/micronutrients';
import { EXPLAIN, OBJECTIVES } from '../config/targets';

type Key = 'kcal' | 'protein' | 'fat' | 'carbs';
const LABELS: Record<Key, { label: string; emoji: string; unit: string }> = {
  kcal: { label: 'Énergie', emoji: '🔥', unit: 'kcal' },
  protein: { label: 'Protéines', emoji: '🥩', unit: 'g' },
  fat: { label: 'Lipides', emoji: '🧈', unit: 'g' },
  carbs: { label: 'Glucides', emoji: '🍚', unit: 'g' },
};

/** « Mes besoins » : ce que l'appli vise pour chaque personne, et pourquoi */
export function Needs() {
  const { id } = useParams();
  const stored = useStoredProfiles();
  const profiles = stored?.length ? stored : DEFAULT_PROFILES;
  const active = useActiveProfile(profiles);
  const navigate = useNavigate();
  const p = profiles.find((x) => x.id === id) ?? active;
  const [reveal, setReveal] = useState(false);
  const n = needs(p);
  const hide = !!p.hideNumbers && !reveal;

  const save = (np: NutritionProfile) => saveProfiles(profiles.map((x) => (x.id === np.id ? np : x)));
  const setOverride = (k: Key, v: number | undefined) => {
    const ov = { ...(p.overrides ?? {}) };
    if (v == null) delete ov[k];
    else ov[k] = v;
    save(patchProfile(p, { overrides: Object.keys(ov).length ? ov : undefined }));
  };

  if (stored === undefined) return null;
  return (
    <div className="page stack">
      <div className="row between">
        <h1 style={{ margin: 0 }}>🎯 {profiles.length > 1 ? `Besoins de ${p.name}` : 'Mes besoins'}</h1>
      </div>
      {profiles.length > 1 && (
        <div className="chips">
          {profiles.map((x) => (
            <button
              key={x.id}
              className={`chip ${x.id === p.id ? 'on' : ''}`}
              onClick={() => {
                setActiveProfile(x.id);
                navigate(`/besoins/${x.id}`, { replace: true });
              }}
            >
              {x.sex === 'homme' ? '👨' : '👩'} {x.name}
            </button>
          ))}
        </div>
      )}

      {!n ? (
        <div className="callout info">
          Complétez l’âge, la taille et le poids dans <Link to="/reglages">le profil</Link> pour calculer les besoins.
        </div>
      ) : (
        <>
          <section className="card pad stack">
            <p className="small muted" style={{ margin: 0 }}>
              {OBJECTIVES[n.objective].emoji} Objectif : <strong>{OBJECTIVES[n.objective].label.toLowerCase()}</strong>
              {OBJECTIVES[n.objective].usesPace ? ` (rythme ${n.pace})` : ''}. <Link to="/reglages">Modifier le profil</Link>
            </p>
            {hide ? (
              <div className="stack">
                <p style={{ margin: 0 }}>
                  Les chiffres sont masqués pour ce profil. L’appli s’en sert en coulisses pour doser les parts de chacun et choisir des recettes qui couvrent toutes les vitamines et tous les minéraux.
                </p>
                <div>
                  <button className="btn sm" onClick={() => setReveal(true)}>
                    Afficher les chiffres pour cette fois
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="needs-grid">
                  {(Object.keys(LABELS) as Key[]).map((k) => {
                    const calc = k === 'kcal' ? n.kcalCalc : k === 'protein' ? n.proteinCalc : k === 'fat' ? n.fatCalc : n.carbsCalc;
                    return (
                      <div key={k} className="need">
                        <div className="nl">
                          {LABELS[k].emoji} {LABELS[k].label}
                        </div>
                        <div className="nv">
                          {n[k].toLocaleString('fr-FR')} {LABELS[k].unit}
                        </div>
                        <div className="nl">{n.manual[k] ? `saisi à la main (calcul : ${calc.toLocaleString('fr-FR')})` : k === 'protein' ? `${(n.protein / p.weight).toFixed(1).replace('.', ',')} g/kg` : 'calculé'}</div>
                        <details>
                          <summary className="small">Ajuster</summary>
                          <input
                            className="input"
                            type="number"
                            inputMode="numeric"
                            aria-label={`${LABELS[k].label} à la main`}
                            defaultValue={p.overrides?.[k] ?? ''}
                            placeholder={String(calc)}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              setOverride(k, e.target.value && v > 0 ? v : undefined);
                            }}
                          />
                          {n.manual[k] && (
                            <button className="btn ghost sm" onClick={() => setOverride(k, undefined)}>
                              Revenir au calcul
                            </button>
                          )}
                        </details>
                      </div>
                    );
                  })}
                </div>
                {!!p.trainingDays?.length && !!p.daily && (
                  <div className="small">
                    <strong>Selon le jour :</strong>{' '}
                    {DAY_LETTERS.map((l, d) => (
                      <span key={d} className={`tag ${p.trainingDays!.includes(d) ? 'primary' : ''}`} style={{ marginRight: 4 }}>
                        {l} {dayKcal(p, d).toLocaleString('fr-FR')}
                      </span>
                    ))}
                  </div>
                )}
                {n.warnings.map((w) => (
                  <div key={w} className="callout small" style={{ margin: 0 }}>
                    ⚠️ {w}
                  </div>
                ))}
              </>
            )}
          </section>

          {!hide && (
            <section className="card pad stack">
              <h2 style={{ margin: 0 }}>🧮 Comment c’est calculé</h2>
              <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
                {n.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p className="small muted" style={{ margin: 0 }}>
                Toutes les valeurs de référence sont rassemblées et sourcées dans un seul fichier (<code>src/config/targets.ts</code>). Le suivi du poids sur deux semaines permet ensuite d’ajuster ces chiffres à la réalité.
              </p>
            </section>
          )}

          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>💊 Vitamines et minéraux visés chaque jour</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Références EFSA / ANSES pour {p.sex === 'homme' ? 'un homme' : 'une femme'} adulte. Le planning vise 100 % de chacune en moyenne sur la semaine (le sodium est une limite à ne pas dépasser).
            </p>
            {(['vitamines', 'mineraux', 'electrolytes', 'lipides', 'autres'] as const).map((g) => (
              <div key={g}>
                <strong className="small">{GROUP_LABELS[g]}</strong>
                <div className="chips" style={{ marginTop: 4 }}>
                  {NUTRIENTS.filter((d) => d.group === g).map((d) => (
                    <span key={d.key} className="tag" title={d.role}>
                      {d.label.replace(/ \(.*\)/, '')} {d.limit ? '< ' : ''}
                      {formatAmount(dailyRef(d, p), d.unit)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      <p className="small muted">⚕️ {EXPLAIN.disclaimer}</p>
    </div>
  );
}
