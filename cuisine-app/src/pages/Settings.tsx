import { useRef } from 'react';
import { exportData, importData, saveSettings, db } from '../db/db';
import { useUserData, useLibrary } from '../hooks/library';
import { DEFAULT_PROFILES, type NutritionProfile } from '../domain/micronutrients';
import { DIET_PROFILES } from '../domain/digestion';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ui';

export function Settings() {
  const { settings } = useUserData();
  const { recipes } = useLibrary();
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const profiles = settings.profiles?.length ? settings.profiles : DEFAULT_PROFILES;
  const setProfile = (i: number, patch: Partial<NutritionProfile>) => saveSettings({ profiles: profiles.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

  const download = async () => {
    const json = await exportData(false);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notre-cuisine-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImport = async (f: File, mode: 'merge' | 'replace') => {
    try {
      await importData(await f.text(), mode);
      toast('Sauvegarde importée ✅');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const setTheme = (t: 'auto' | 'light' | 'dark') => {
    try {
      if (t === 'auto') localStorage.removeItem('cuisine.theme');
      else localStorage.setItem('cuisine.theme', t);
    } catch {
      /* indisponible */
    }
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };

  return (
    <div className="page narrow stack" style={{ gap: 18 }}>
      <h1>⚙️ Réglages</h1>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>🏡 Foyer</h2>
        <div className="field">
          <label>Nombre de personnes par défaut</label>
          <div className="chips">
            {[1, 2, 3, 4, 6, 8].map((n) => (
              <button key={n} className={`chip ${settings.defaultServings === n ? 'on' : ''}`} onClick={() => saveSettings({ defaultServings: n })}>
                👥 {n}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Apparence</label>
          <div className="chips">
            <button className="chip" onClick={() => setTheme('auto')}>
              🌓 Auto
            </button>
            <button className="chip" onClick={() => setTheme('light')}>
              ☀️ Clair
            </button>
            <button className="chip" onClick={() => setTheme('dark')}>
              🌙 Sombre
            </button>
          </div>
        </div>
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>🧭 Mon approche alimentaire</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Les recettes incompatibles avec les approches cochées sont masquées partout (bibliothèque, frigo, planning). Plusieurs approches peuvent être combinées : leurs exclusions s’additionnent. <Link to="/sources">Sources et méthode</Link>
        </p>
        {DIET_PROFILES.map((p) => {
          const on = (settings.diets ?? ['wapf']).includes(p.id);
          return (
            <label key={p.id} className="card pad row nowrap" style={{ alignItems: 'flex-start', cursor: 'pointer', boxShadow: 'none', borderColor: on ? 'var(--olive)' : undefined }}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => {
                  const cur = settings.diets ?? ['wapf'];
                  saveSettings({ diets: on ? cur.filter((x) => x !== p.id) : [...cur, p.id] });
                }}
                style={{ marginTop: 4 }}
              />
              <span>
                <strong>
                  {p.emoji} {p.label}
                </strong>
                <span className="small muted" style={{ display: 'block' }}>
                  {p.description}
                </span>
                {p.warning && <span className="small" style={{ display: 'block', color: 'var(--warn)' }}>⚠️ {p.warning}</span>}
              </span>
            </label>
          );
        })}
        <label className="row nowrap small">
          <input type="checkbox" checked={!!settings.showIncompatible} onChange={(e) => saveSettings({ showIncompatible: e.target.checked })} />
          Afficher quand même les recettes hors de mon approche (signalées par un avertissement)
        </label>
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>🔬 Profils nutritionnels</h2>
        <p className="small muted" style={{ margin: 0 }}>Utilisés pour calculer les % des besoins journaliers (vitamines, minéraux, acides aminés…) sur chaque recette.</p>
        {profiles.map((p, i) => (
          <div key={p.id} className="form-grid" style={{ alignItems: 'end' }}>
            <div className="field">
              <label>Prénom</label>
              <input className="input" value={p.name} onChange={(e) => setProfile(i, { name: e.target.value })} />
            </div>
            <div className="field">
              <label>Sexe</label>
              <select className="select" value={p.sex} onChange={(e) => setProfile(i, { sex: e.target.value as 'homme' | 'femme' })}>
                <option value="homme">Homme</option>
                <option value="femme">Femme</option>
              </select>
            </div>
            <div className="field">
              <label>Poids (kg)</label>
              <input className="input" type="number" inputMode="numeric" value={p.weight} onChange={(e) => setProfile(i, { weight: Number(e.target.value) || p.weight })} />
            </div>
            <div className="field">
              <label>Objectif kcal / jour</label>
              <input className="input" type="number" inputMode="numeric" value={p.kcal} onChange={(e) => setProfile(i, { kcal: Number(e.target.value) || p.kcal })} />
            </div>
            <div className="field">
              <label>Protéines (g / kg)</label>
              <input className="input" type="number" inputMode="decimal" step="0.1" value={p.proteinPerKg} onChange={(e) => setProfile(i, { proteinPerKg: Number(e.target.value) || p.proteinPerKg })} />
            </div>
          </div>
        ))}
        <p className="small muted" style={{ margin: 0 }}>Repères prise de masse : environ 35–45 kcal/kg et 1,6–2 g de protéines/kg par jour.</p>
      </section>


      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>💾 Sauvegarde & partage entre nos téléphones</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Les données (favoris, historique, planning, garde-manger, liste de courses, recettes ajoutées) sont enregistrées dans ce navigateur. Pour les retrouver sur un autre appareil, exportez un fichier puis importez-le de l’autre côté (fusion sans perte).
        </p>
        <div className="row">
          <button className="btn" onClick={download}>
            ⬇️ Exporter mes données
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            ⬆️ Importer (fusionner)
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f, 'merge');
              e.target.value = '';
            }}
          />
        </div>
        <div className="small muted">{recipes.length} recettes dans la bibliothèque.</div>
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>🧹 Réinitialisation</h2>
        <div className="row">
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Supprimer toutes vos données (favoris, planning, courses, recettes ajoutées…) ? La bibliothèque de base reste.')) return;
              await Promise.all([db.recipes, db.hidden, db.favorites, db.history, db.pantry, db.fridge, db.plan, db.basket, db.shopping].map((t) => t.clear()));
              toast('Données réinitialisées');
            }}
          >
            Tout réinitialiser
          </button>
        </div>
      </section>
    </div>
  );
}
