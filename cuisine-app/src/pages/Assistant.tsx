import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLibrary, useUserData } from '../hooks/library';
import type { GeneratedCandidate } from '../ai/claude';
import { AiError, loadAi } from '../ai/light';
import { CandidatePreview } from '../components/CandidatePreview';
import { db } from '../db/db';
import { CUISINES, CATEGORIES } from '../domain/labels';
import { currentSeason } from '../domain/season';
import { SEASONS } from '../domain/labels';
import type { Cuisine, RecipeCategory } from '../domain/types';
import { useToast } from '../components/ui';

const PRESETS: Array<{ label: string; count: number; request: string; category?: RecipeCategory }> = [
  { label: '✨ 10 nouvelles recettes', count: 10, request: 'Des plats variés pour le déjeuner et le dîner, toutes cuisines confondues, en privilégiant les protéines et cuisines les moins représentées dans la bibliothèque.' },
  { label: '✨ 20 nouvelles recettes', count: 20, request: 'Un mélange équilibré de petits-déjeuners, plats, collations et desserts, en comblant les catégories sous-représentées.' },
  { label: '📅 Une nouvelle semaine', count: 14, request: '14 plats principaux (7 déjeuners + 7 dîners) formant une semaine cohérente : protéines toutes différentes d’un repas à l’autre, plats rapides en semaine, 2 plats mijotés pour le week-end, produits de saison, ingrédients frais partagés pour limiter le gaspillage.', category: 'plat' },
  { label: '⚡ Recettes rapides', count: 10, request: 'Des dîners réalisables en 20 minutes maximum, nourrissants et riches en protéines.' },
  { label: '💪 Riches en calories', count: 10, request: 'Des plats très nourrissants pour la prise de masse (900–1200 kcal/portion, ≥ 45 g de protéines), à base d’aliments entiers.' },
  { label: '🏋️ Après l’entraînement', count: 8, request: 'Des repas de récupération après l’entraînement : protéines faciles à digérer + glucides rapides à assimiler (riz, pommes de terre, fruits), prêts en moins de 30 minutes.' },
  { label: '🌅 Petits-déjeuners', count: 10, request: 'Des petits-déjeuners salés et sucrés, dont des préparables la veille et des très caloriques.', category: 'petit-dejeuner' },
  { label: '🫀 Abats gourmands', count: 6, request: 'Des recettes gourmandes et accessibles à base d’abats (foie, cœur, rognons, moelle, gésiers, langue…), pensées pour des débutants en abats.' },
  { label: '🍮 Desserts maison', count: 8, request: 'Des desserts maison à base de produits laitiers, œufs, fruits de saison et miel, peu sucrés.', category: 'dessert' },
];

export function Assistant() {
  const { recipes, ingredients, lookup } = useLibrary();
  const { settings } = useUserData();
  const [params] = useSearchParams();
  const [request, setRequest] = useState('');
  const [count, setCount] = useState(10);
  const [cuisine, setCuisine] = useState<Cuisine | ''>((params.get('cuisine') as Cuisine) || '');
  const [ingredientFocus, setIngredientFocus] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedCandidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  const toast = useToast();
  const season = SEASONS[currentSeason()].label.toLowerCase();

  const fullRequest = (base: string) =>
    [
      base,
      cuisine ? `Cuisine : ${CUISINES[cuisine].label}.` : '',
      ingredientFocus.trim() ? `Construire les recettes autour de : ${ingredientFocus.trim()}.` : '',
      `Nous sommes en ${season} : privilégier les produits de saison.`,
    ]
      .filter(Boolean)
      .join(' ');

  const run = async (base: string, n: number, category?: RecipeCategory) => {
    if (!settings.apiKey) return;
    setError(null);
    setResults([]);
    abort.current = new AbortController();
    try {
      const { generateRecipes } = await loadAi();
      const res = await generateRecipes({
        apiKey: settings.apiKey,
        model: settings.model ?? 'claude-opus-5-5',
        request: fullRequest(base),
        count: n,
        library: recipes,
        ingredients,
        lookup,
        focus: { cuisine: cuisine || undefined, category },
        signal: abort.current.signal,
        onStatus: setStatus,
      });
      setResults(res);
      setPicked(new Set(res.filter((r) => r.status === 'ok').map((r) => r.recipe.id)));
    } catch (e) {
      setError(e instanceof AiError ? e.message : String(e));
    } finally {
      setStatus(null);
    }
  };

  const addSelected = async () => {
    const list = results.filter((r) => picked.has(r.recipe.id)).map((r) => r.recipe);
    await db.recipes.bulkPut(list);
    toast(`${list.length} recette(s) ajoutée(s) à la bibliothèque 🎉`);
    setResults((rs) => rs.filter((r) => !picked.has(r.recipe.id)));
    setPicked(new Set());
  };

  const okCount = useMemo(() => results.filter((r) => r.status === 'ok').length, [results]);

  return (
    <div className="page narrow stack" style={{ gap: 18 }}>
      <div>
        <h1>✨ Générer de nouvelles recettes</h1>
        <p className="muted" style={{ margin: 0 }}>
          L’assistant écrit des recettes fidèles à votre philosophie alimentaire. Avant de les proposer, chacune est comparée aux {recipes.length} recettes existantes (ingrédients, protéine, féculent, légumes, cuisine, technique, profil) : les doublons et recettes trop proches sont écartés et remplacés.
        </p>
      </div>

      {!settings.apiKey ? (
        <div className="callout">
          Pour utiliser l’assistant, ajoutez votre clé API Anthropic dans <Link to="/reglages">Réglages</Link>. Tout le reste de l’application fonctionne sans.
        </div>
      ) : (
        <>
          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>Demandes rapides</h2>
            <div className="chips">
              {PRESETS.map((p) => (
                <button key={p.label} className="chip" disabled={!!status} onClick={() => run(p.request, p.count, p.category)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Cuisine (facultatif)</label>
                <select className="select" value={cuisine} onChange={(e) => setCuisine(e.target.value as Cuisine | '')}>
                  <option value="">Toutes</option>
                  {Object.entries(CUISINES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.emoji} {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Autour d’ingrédients (facultatif)</label>
                <input className="input" value={ingredientFocus} onChange={(e) => setIngredientFocus(e.target.value)} placeholder="ex. bœuf, courgettes, pommes de terre" />
              </div>
            </div>
          </section>

          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>Demande libre</h2>
            <textarea
              className="textarea"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="ex. « Donne-moi 20 nouvelles recettes que je n’ai jamais vues, inspirées de la cuisine française traditionnelle, riches en protéines, suffisamment caloriques, simples à cuisiner. »"
            />
            <div className="row">
              <label className="label">Nombre :</label>
              {[1, 5, 10, 20].map((n) => (
                <button key={n} className={`chip ${count === n ? 'on' : ''}`} onClick={() => setCount(n)}>
                  {n}
                </button>
              ))}
              <button className="btn primary" style={{ marginLeft: 'auto' }} disabled={!request.trim() || !!status} onClick={() => run(request, count)}>
                Générer
              </button>
            </div>
          </section>
        </>
      )}

      {status && (
        <div className="card pad row">
          <span className="spinner" />
          <span className="grow">{status}</span>
          <button className="btn sm ghost" onClick={() => abort.current?.abort()}>
            Annuler
          </button>
        </div>
      )}
      {error && <div className="callout danger">{error}</div>}

      {results.length > 0 && (
        <section className="stack">
          <div className="row between">
            <h2 style={{ margin: 0 }}>
              {okCount} recette{okCount > 1 ? 's' : ''} nouvelle{okCount > 1 ? 's' : ''}
              {results.length - okCount > 0 && <span className="muted small"> · {results.length - okCount} écartée(s)</span>}
            </h2>
            <button className="btn primary" disabled={!picked.size} onClick={addSelected}>
              ➕ Ajouter {picked.size} à la bibliothèque
            </button>
          </div>
          {results.map((c) => (
            <CandidatePreview
              key={c.recipe.id}
              c={c}
              selected={picked.has(c.recipe.id)}
              onToggle={() => {
                const next = new Set(picked);
                next.has(c.recipe.id) ? next.delete(c.recipe.id) : next.add(c.recipe.id);
                setPicked(next);
              }}
            />
          ))}
        </section>
      )}

      <section className="small muted">
        Catégories disponibles : {Object.values(CATEGORIES).map((c) => c.label).join(', ')}. Les recettes générées sont marquées « ✨ IA » et restent modifiables.
      </section>
    </div>
  );
}
