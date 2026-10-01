import { useRef, useState } from 'react';
import { exportData, importData, saveSettings, db } from '../db/db';
import { useUserData, useLibrary } from '../hooks/library';
import { MODELS } from '../ai/light';
import { useToast } from '../components/ui';

export function Settings() {
  const { settings } = useUserData();
  const { recipes } = useLibrary();
  const [key, setKey] = useState(settings.apiKey ?? '');
  const [show, setShow] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();

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
        <h2 style={{ margin: 0 }}>✨ Assistant IA (Claude)</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Pour générer, adapter et planifier, l’application appelle l’API Anthropic directement depuis ce navigateur avec votre clé. La clé reste stockée sur cet appareil uniquement (elle n’est jamais incluse dans les sauvegardes). Créez une clé sur <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> ; l’usage est facturé sur votre compte API.
        </p>
        <div className="field">
          <label htmlFor="apikey">Clé API</label>
          <div className="row nowrap">
            <input id="apikey" className="input" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
            <button className="btn" onClick={() => setShow(!show)}>
              {show ? '🙈' : '👁'}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="model">Modèle</label>
          <select id="model" className="select" value={settings.model} onChange={(e) => saveSettings({ model: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <button
            className="btn primary"
            onClick={async () => {
              await saveSettings({ apiKey: key.trim() || undefined });
              toast(key.trim() ? 'Clé enregistrée' : 'Clé supprimée');
            }}
          >
            Enregistrer
          </button>
          {settings.apiKey && (
            <button
              className="btn danger"
              onClick={async () => {
                setKey('');
                await saveSettings({ apiKey: undefined });
              }}
            >
              Supprimer la clé
            </button>
          )}
        </div>
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
