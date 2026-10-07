import { useState } from 'react';
import type { IndexedRecipe, Recipe } from '../domain/types';
import { CUISINES } from '../domain/labels';

// Palettes chaudes par catégorie — chaque recette sans photo reçoit une
// illustration unique (dégradé + motif + emoji) dérivée de son id.
const PALETTES: Record<string, [string, string]> = {
  'petit-dejeuner': ['#f6d38a', '#f0a868'],
  plat: ['#e58f65', '#b8532f'],
  'salade-composee': ['#b9d48b', '#6f9a45'],
  soupe: ['#f2b56b', '#c9772f'],
  mijote: ['#c9704a', '#7d3b22'],
  accompagnement: ['#e9c77b', '#b58b3a'],
  collation: ['#f4c39b', '#d98a5b'],
  dessert: ['#f3b6b0', '#d4767a'],
  sauce: ['#d8d69a', '#9c9a4d'],
  boisson: ['#e8d7b5', '#b99d6b'],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function RecipeVisual({
  recipe,
  showFlag = true,
  children,
}: {
  recipe: Recipe | IndexedRecipe;
  showFlag?: boolean;
  children?: React.ReactNode;
}) {
  const cuisine = CUISINES[recipe.cuisine];
  // photo indisponible (hors ligne, fichier retiré) : on revient à l'illustration
  const [broken, setBroken] = useState(false);
  if (recipe.photo && !broken) {
    return (
      <div className="rvisual">
        <img src={recipe.photo} alt={recipe.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        {showFlag && cuisine && <span className="flag">{cuisine.emoji} {cuisine.label}</span>}
        {children}
      </div>
    );
  }
  const [a, b] = PALETTES[recipe.category] ?? PALETTES.plat;
  const h = hash(recipe.id);
  const angle = h % 360;
  const pattern = h % 3;
  const id = `p${h.toString(36)}`;
  return (
    <div className="rvisual" style={{ background: `linear-gradient(${angle}deg, ${a}, ${b})` }} aria-hidden="true">
      <svg className="pattern" width="100%" height="100%">
        <defs>
          <pattern id={id} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform={`rotate(${h % 45})`}>
            {pattern === 0 && <circle cx="6" cy="6" r="2.4" fill="#fff" />}
            {pattern === 1 && <path d="M0 14h28" stroke="#fff" strokeWidth="2" />}
            {pattern === 2 && <path d="M4 4l6 6M18 18l6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      <span className="emoji">{recipe.emoji ?? '🍽️'}</span>
      {showFlag && cuisine && <span className="flag">{cuisine.emoji} {cuisine.label}</span>}
      {children}
    </div>
  );
}
