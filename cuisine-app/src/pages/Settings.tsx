import { useRef, useState } from 'react';
import { exportData, importData, saveSettings, db } from '../db/db';
import { useUserData, useLibrary, useProfiles } from '../hooks/library';
import { HouseholdEditor } from '../components/Household';
import { cloudEnabled, useCloud } from '../cloud/sync';
import { clearIncidents, readIncidents } from '../domGuard';
import { DIET_BY_ID, DIET_PROFILES, type DietProfileId } from '../domain/digestion';
import type { IndexedRecipe } from '../domain/types';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ui';

export function Settings() {
  const { settings } = useUserData();
  const { recipes, allRecipes } = useLibrary();
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const cloud = useCloud();
  const profiles = useProfiles();

  const download = async () => {
    const json = await exportData();
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
      <h1>⚙️ Mon profil & réglages</h1>

      {cloudEnabled && (
        <Link to="/compte" className="card pad row between" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>
            <strong>👤 {cloud.email ? cloud.email : 'Se connecter / créer un compte'}</strong>
            <span className="small muted" style={{ display: 'block' }}>
              {cloud.email ? 'Vos données sont enregistrées dans votre compte et synchronisées sur vos appareils.' : 'Retrouvez votre semaine, vos favoris et votre profil sur tous vos appareils.'}
            </span>
          </span>
          <span>›</span>
        </Link>
      )}

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
        <DietSummary all={allRecipes} diets={settings.diets ?? ['wapf']} />
        <label className="row nowrap small">
          <input type="checkbox" checked={!!settings.showIncompatible} onChange={(e) => saveSettings({ showIncompatible: e.target.checked })} />
          Afficher quand même les recettes hors de mon approche (signalées par un avertissement)
        </label>
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>🧍 Mon profil et mon foyer</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Taille, poids, âge, activité et objectif servent à calculer vos besoins en calories et en protéines, puis les % de vitamines, minéraux et acides aminés affichés partout. Ajoutez les personnes qui partagent vos repas : le planning « Nous deux » vise 100 % pour chacune.
        </p>
        <HouseholdEditor profiles={profiles} />
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>💾 Sauvegarde dans un fichier</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Les données (favoris, historique, planning, garde-manger, liste de courses, recettes ajoutées, profil) sont enregistrées dans ce navigateur{cloud.email ? ' et dans votre compte' : ''}. Vous pouvez aussi en faire une copie dans un fichier et l’importer ailleurs (fusion sans perte).
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

      <Incidents />

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>🧹 Réinitialisation</h2>
        <div className="row">
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Supprimer toutes vos données (favoris, planning, courses, recettes ajoutées…) ? La bibliothèque de base reste.')) return;
              await Promise.all([db.recipes, db.hidden, db.favorites, db.cooking, db.pantry, db.fridge, db.plan, db.basket, db.shopping].map((t) => t.clear()));
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

/** Derniers incidents d'affichage (diagnostic à transmettre en cas de souci) */
function Incidents() {
  const [list, setList] = useState(readIncidents);
  const toast = useToast();
  if (!list.length) return null;
  const text = list.map((i) => `${i.at} ${i.where}\n${i.message}`).join('\n\n');
  return (
    <section className="card pad stack">
      <h2 style={{ margin: 0 }}>🩺 Incidents récents</h2>
      <p className="small muted" style={{ margin: 0 }}>
        L’appli s’est rétablie seule, mais ces erreurs aident à corriger la cause. Copiez-les et envoyez-les si un souci revient.
      </p>
      <pre className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', margin: 0 }}>{text}</pre>
      <div className="row">
        <button
          className="btn sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast('Copié ✅');
            } catch {
              toast('Sélectionnez le texte pour le copier');
            }
          }}
        >
          📋 Copier
        </button>
        <button
          className="btn ghost sm"
          onClick={() => {
            clearIncidents();
            setList([]);
          }}
        >
          Effacer
        </button>
      </div>
    </section>
  );
}

/** Approches qui se contredisent (l'une écarte ce que l'autre recommande) */
const CONFLICTS: Array<[DietProfileId, DietProfileId, string]> = [
  ['peat', 'anti-inflammatoire', 'Ray Peat écarte les poissons gras que l’approche anti-inflammatoire recommande (oméga-3, vitamine D).'],
  ['gaps', 'primal', 'GAPS interdit pommes de terre, patate douce et riz, que Primal garde pour l’énergie et la prise de masse.'],
  ['peat', 'wapf', 'Ray Peat écarte oléagineux et poissons gras, valorisés par Weston A. Price.'],
];

/** Nombre de recettes restantes, approche la plus restrictive et contradictions */
function DietSummary({ all, diets }: { all: IndexedRecipe[]; diets: string[] }) {
  const visible = all.filter((r) => !diets.some((d) => r.incompatible?.[d])).length;
  // ce que chaque approche retire en plus des autres
  const cost = diets
    .map((d) => ({ d, extra: all.filter((r) => r.incompatible?.[d] && !diets.some((o) => o !== d && r.incompatible?.[o])).length }))
    .sort((a, b) => b.extra - a.extra);
  const conflicts = CONFLICTS.filter(([a, b]) => diets.includes(a) && diets.includes(b));
  const color = visible >= 150 ? 'ok' : visible >= 60 ? 'info' : 'danger';
  return (
    <div className={`callout small ${color}`} style={{ margin: 0 }}>
      <strong>
        → {visible} recette{visible > 1 ? 's' : ''} sur {all.length} compatible{visible > 1 ? 's' : ''} avec votre sélection
      </strong>
      {diets.length > 1 && cost[0]?.extra > 0 && (
        <div>
          Le plus restrictif : {DIET_BY_ID[cost[0].d as DietProfileId]?.label} (retire {cost[0].extra} recettes à lui seul)
          {cost[1]?.extra > 0 ? `, puis ${DIET_BY_ID[cost[1].d as DietProfileId]?.label} (${cost[1].extra})` : ''}.
        </div>
      )}
      {conflicts.map(([, , msg]) => (
        <div key={msg}>⚠️ {msg}</div>
      ))}
      {visible < 150 && diets.length > 1 && (
        <div className="muted">
          GAPS et pauvre en FODMAP sont des protocoles temporaires (quelques semaines) ; au quotidien, l’association Weston A. Price + anti-inflammatoire + prudent en phytoestrogènes couvre l’essentiel de l’objectif santé.
        </div>
      )}
    </div>
  );
}
