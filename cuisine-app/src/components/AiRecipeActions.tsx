import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { GeneratedCandidate } from '../ai/claude';
import { AiError, loadAi } from '../ai/light';
import { useLibrary, useUserData } from '../hooks/library';
import { saveRecipe } from '../db/db';
import type { IndexedRecipe } from '../domain/types';
import { CandidatePreview } from './CandidatePreview';
import { useToast } from './ui';
import { stripIndex } from '../pages/RecipeDetail';

export function AiRecipeActions({ recipe, servings }: { recipe: IndexedRecipe; servings: number }) {
  const { settings } = useUserData();
  const { ingredients, lookup, recipes } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedCandidate | null>(null);
  const [free, setFree] = useState('');
  const [missing, setMissing] = useState('');
  const abort = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const run = async (instruction: string) => {
    if (!settings.apiKey) return;
    setBusy(true);
    setError(null);
    setResult(null);
    abort.current = new AbortController();
    try {
      const { adaptRecipe } = await loadAi();
      const c = await adaptRecipe({
        apiKey: settings.apiKey,
        model: settings.model ?? 'claude-opus-5-5',
        recipe: stripIndex(recipe),
        instruction,
        ingredients,
        lookup,
        library: recipes,
        signal: abort.current.signal,
      });
      setResult(c);
    } catch (e) {
      setError(e instanceof AiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const keep = async (mode: 'new' | 'replace') => {
    if (!result) return;
    const r = mode === 'replace' ? { ...result.recipe, id: recipe.id, photo: recipe.photo } : result.recipe;
    await saveRecipe(r);
    toast(mode === 'replace' ? 'Recette mise à jour' : 'Nouvelle variante ajoutée à la bibliothèque');
    setResult(null);
    navigate(`/recette/${r.id}`);
  };

  return (
    <section className="card pad stack">
      <h2 style={{ margin: 0 }}>✨ Adapter avec l’IA</h2>
      {!settings.apiKey ? (
        <p className="small muted" style={{ margin: 0 }}>
          Ajoutez votre clé API Anthropic dans <Link to="/reglages">Réglages</Link> pour remplacer un ingrédient, rendre la recette plus calorique, plus rapide…
        </p>
      ) : (
        <>
          <div className="row nowrap">
            <select className="select" value={missing} onChange={(e) => setMissing(e.target.value)} aria-label="Ingrédient manquant">
              <option value="">Je n’ai pas de…</option>
              {recipe.ingredients
                .map((ri) => lookup(ri.id))
                .filter((i) => i && !i.staple)
                .map((i) => (
                  <option key={i!.id} value={i!.name}>
                    {i!.name}
                  </option>
                ))}
            </select>
            <button className="btn" disabled={!missing || busy} onClick={() => run(`Je n'ai pas de ${missing}. Remplace-le intelligemment.`)}>
              Remplacer
            </button>
          </div>
          <div className="chips">
            <button className="chip" disabled={busy} onClick={() => run('Version plus calorique et plus riche en protéines, pour la prise de masse, sans ultra-transformés.')}>
              💪 Plus calorique
            </button>
            <button className="chip" disabled={busy} onClick={() => run('Version réalisable en moins de 25 minutes au total.')}>
              ⚡ Plus rapide
            </button>
            <button className="chip" disabled={busy} onClick={() => run(`Adapte précisément pour ${servings} personnes (quantités, ustensiles, temps).`)}>
              👥 Pour {servings} personnes
            </button>
            <button className="chip" disabled={busy} onClick={() => run('Version de saison avec les légumes et fruits du moment.')}>
              🍂 De saison
            </button>
            <button className="chip" disabled={busy} onClick={() => run('Version plus digeste (moins de FODMAP et de crucifères crus, cuissons douces), sans perdre le plaisir.')}>
              🌿 Plus digeste
            </button>
          </div>
          <div className="row nowrap">
            <input className="input" value={free} onChange={(e) => setFree(e.target.value)} placeholder="Autre demande… ex. « sans four »" />
            <button className="btn" disabled={!free.trim() || busy} onClick={() => run(free)}>
              OK
            </button>
          </div>
        </>
      )}
      {busy && (
        <div className="row">
          <span className="spinner" /> L’IA adapte la recette…
          <button className="btn sm ghost" onClick={() => abort.current?.abort()}>
            Annuler
          </button>
        </div>
      )}
      {error && <div className="callout danger small">{error}</div>}
      {result && (
        <div className="stack">
          <CandidatePreview c={result} />
          <div className="row">
            <button className="btn primary" onClick={() => keep('new')}>
              ➕ Garder comme nouvelle recette
            </button>
            <button className="btn" onClick={() => keep('replace')}>
              ↺ Remplacer l’originale
            </button>
            <button className="btn ghost" onClick={() => setResult(null)}>
              Ignorer
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
