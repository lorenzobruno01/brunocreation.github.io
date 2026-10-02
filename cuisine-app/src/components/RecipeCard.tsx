import { Link } from 'react-router-dom';
import type { IndexedRecipe } from '../domain/types';
import { DIFFICULTIES } from '../domain/labels';
import { RecipeVisual } from './RecipeVisual';
import { toggleBasket, toggleFavorite } from '../db/db';
import { useUserData } from '../hooks/library';
import { formatDuration } from './format';

export function RecipeCard({
  recipe,
  badge,
  compact,
}: {
  recipe: IndexedRecipe;
  badge?: { text: string; level: 'full' | 'partial' | 'low' };
  compact?: boolean;
}) {
  const { favorites, basket, settings } = useUserData();
  const favorite = favorites.has(recipe.id);
  const inBasket = basket.has(recipe.id);
  const d = DIFFICULTIES[recipe.difficulty];
  return (
    <div className="card rcard">
      <button
        className="fav-btn"
        aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        onClick={(e) => {
          e.preventDefault();
          toggleFavorite(recipe.id);
        }}
      >
        {favorite ? '❤️' : '🤍'}
      </button>
      {!compact && (
        <button
          className={`basket-btn ${inBasket ? 'on' : ''}`}
          title="Ajouter à la sélection pour les courses"
          onClick={(e) => {
            e.preventDefault();
            toggleBasket(recipe.id, settings.defaultServings);
          }}
        >
          {inBasket ? '✓ Sélection' : '+ 🛒'}
        </button>
      )}
      <Link to={`/recette/${recipe.id}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <RecipeVisual recipe={recipe}>
          {badge && <span className={`match-badge ${badge.level === 'full' ? '' : badge.level}`}>{badge.text}</span>}
        </RecipeVisual>
        <div className="rcard-body">
          <div className="rcard-title">{recipe.name}</div>
          <div className="rcard-meta">
            <span>⏱ {formatDuration(recipe.totalTime)}</span>
            <span>
              {d.emoji} {d.label}
            </span>
          </div>
          <div className="rcard-meta">
            <span>🔥 {recipe.nutrition.kcal} kcal</span>
            <span>🥩 {recipe.nutrition.protein} g prot.</span>
            {recipe.density != null && <span title="Indice de densité nutritionnelle (0–100)">🌿 {recipe.density}</span>}
          </div>
          {!compact && (
            <div className="rcard-tags">
              {recipe.tags.slice(0, 3).map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
