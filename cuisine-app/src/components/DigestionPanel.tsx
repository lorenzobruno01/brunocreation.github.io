import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { IndexedRecipe } from '../domain/types';
import { useLibrary } from '../hooks/library';
import { analyzeDigestion, DIET_PROFILES } from '../domain/digestion';

const OX_LABEL: Record<string, { label: string; cls: string }> = {
  faible: { label: 'faibles', cls: 'ok' },
  moyen: { label: 'modérés', cls: 'ok' },
  eleve: { label: 'élevés', cls: 'warn' },
  'tres-eleve': { label: 'très élevés', cls: 'warn' },
};

const TOPIC: Record<string, string> = {
  phytates: '🌾 Phytates / préparation',
  oxalates: '💎 Oxalates',
  pufa: '🫗 Huiles de graines (PUFA)',
  phyto: '⚖️ Phytoestrogènes',
  securite: '🛡️ Sécurité sanitaire',
  fodmap: '🌿 FODMAP',
  'vitamine-a': '🫀 Vitamine A',
};

/** Digestibilité, antinutriments et compatibilité avec les profils alimentaires */
export function DigestionPanel({ recipe }: { recipe: IndexedRecipe }) {
  const { lookup, diets } = useLibrary();
  const d = useMemo(() => analyzeDigestion(recipe, lookup), [recipe, lookup]);
  const ox = OX_LABEL[d.oxalateLevel];
  return (
    <details className="card pad stack fold">
      <summary>
        <h2 style={{ margin: 0, display: 'inline' }}>🌾 Digestion et compatibilité</h2>
        <span className="small muted"> · {recipe.incompatible && diets.some((x) => recipe.incompatible![x]) ? '⚠️ hors de votre approche' : '✅ compatible avec votre approche'}</span>
      </summary>
      <div className="chips">
        <span className={`tag ${ox.cls}`}>💎 Oxalates {ox.label} (≈ {d.oxalateMg} mg/portion)</span>
        {d.fermented && <span className="tag ok">🫙 Contient un fermenté</span>}
        {d.broth && <span className="tag ok">🍲 Bouillon / collagène</span>}
        {d.organs && <span className="tag ok">🫀 Abats</span>}
        {d.prepared.map((p) => (
          <span key={p} className="tag ok">
            ✅ {p}
          </span>
        ))}
      </div>
      {d.issues.length > 0 && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {d.issues.map((i, k) => (
            <li key={k} style={{ color: i.level === 'error' ? 'var(--danger)' : i.level === 'warning' ? 'var(--warn)' : 'var(--ink-2)', marginBottom: 4 }}>
              <strong>{TOPIC[i.topic]}</strong> — {i.message}
            </li>
          ))}
        </ul>
      )}
      <div>
        <span className="label">Compatibilité avec vos approches</span>
        <div className="stack" style={{ gap: 4, marginTop: 6 }}>
          {DIET_PROFILES.filter((p) => diets.includes(p.id)).map((p) => {
            const why = recipe.incompatible?.[p.id];
            const active = diets.includes(p.id);
            return (
              <div key={p.id} className="small row nowrap" style={{ alignItems: 'flex-start', fontWeight: active ? 800 : 600 }}>
                <span>{why ? '❌' : '✅'}</span>
                <span>
                  {p.emoji} {p.label}
                  {active && <span className="tag primary" style={{ marginLeft: 6 }}>actif</span>}
                  {why && <span className="muted"> — {why.slice(0, 4).join(', ')}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Règles fondées sur des sources documentées (WAPF, Monash FODMAP, listes d’oxalates Harvard/OHF, EFSA, études sur le trempage et le levain). <Link to="/sources">Voir les sources et la méthode</Link> · <Link to="/reglages">Choisir mon approche</Link>
      </p>
    </details>
  );
}
