import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useHistory, useLibrary, useUserData } from '../hooks/library';
import { RecipeCard } from '../components/RecipeCard';
import { Empty } from '../components/ui';
import { relativeDays } from '../components/format';
import { db } from '../db/db';

export function Favorites() {
  const { byId } = useLibrary();
  const { favorites } = useUserData();
  const history = useHistory();
  const favs = useMemo(() => [...favorites].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name, 'fr')), [favorites, byId]);
  const mostCooked = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of history) m.set(h.recipeId, (m.get(h.recipeId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [history]);

  return (
    <div className="page">
      <h1>❤️ Mes recettes</h1>
      {favs.length === 0 ? (
        <Empty emoji="🤍" title="Pas encore de favoris">
          <p>Touchez le cœur d’une recette pour la retrouver ici.</p>
          <Link className="btn" to="/recettes">
            Parcourir les recettes
          </Link>
        </Empty>
      ) : (
        <div className="grid-cards">
          {favs.map((r) => (
            <RecipeCard key={r!.id} recipe={r!} />
          ))}
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2>🕒 Dernières recettes cuisinées</h2>
          {history.length > 0 && (
            <button
              className="btn sm ghost"
              onClick={async () => {
                if (confirm('Effacer tout l’historique ?')) await db.history.clear();
              }}
            >
              Effacer
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="muted">
            Rien pour l’instant. Utilisez « ✅ J’ai cuisiné ce plat » sur une recette : l’historique sert aussi à éviter de vous proposer toujours les mêmes plats.
          </p>
        ) : (
          <div className="card">
            {history.slice(0, 30).map((h) => {
              const r = byId.get(h.recipeId);
              if (!r) return null;
              return (
                <Link key={h.id} to={`/recette/${r.id}`} className="shop-item" style={{ textDecoration: 'none' }}>
                  <span style={{ fontSize: '1.5rem' }}>{r.emoji}</span>
                  <span className="grow sn">{r.name}</span>
                  <span className="small muted">{relativeDays(h.date)}</span>
                  <button
                    className="icon-btn"
                    aria-label="Retirer de l’historique"
                    onClick={(e) => {
                      e.preventDefault();
                      if (h.id != null) db.history.delete(h.id);
                    }}
                  >
                    ✕
                  </button>
                </Link>
              );
            })}
          </div>
        )}
        {mostCooked.length > 0 && (
          <p className="small muted" style={{ marginTop: 12 }}>
            Vos classiques : {mostCooked.map(([id, n]) => `${byId.get(id)?.name ?? id} (×${n})`).join(' · ')}
          </p>
        )}
      </section>
    </div>
  );
}
