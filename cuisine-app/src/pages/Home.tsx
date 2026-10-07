import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary, useUserData } from '../hooks/library';
import { RecipeCard } from '../components/RecipeCard';
import { currentSeason } from '../domain/season';
import { SEASONS } from '../domain/labels';
import type { IndexedRecipe } from '../domain/types';
import { similarity } from '../domain/similarity';
import { HomeToday } from '../components/HomeToday';
import { useStoredProfiles } from '../hooks/library';
import { useActiveProfile } from '../hooks/activeProfile';

/** Graine du jour : les suggestions changent chaque jour mais restent stables dans la journée */
function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate();
}
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function pickVaried(pool: IndexedRecipe[], n: number, score: (r: IndexedRecipe) => number): IndexedRecipe[] {
  const sorted = [...pool].sort((a, b) => score(b) - score(a));
  const out: IndexedRecipe[] = [];
  for (const r of sorted) {
    if (out.length >= n) break;
    if (out.some((o) => o.mainProtein && o.mainProtein === r.mainProtein && out.length < 6)) continue;
    if (out.some((o) => similarity(o, r).score > 0.5)) continue;
    out.push(r);
  }
  return out;
}

export function Home() {
  const { recipes } = useLibrary();
  const { favorites, lastCooked, fridge, pantry } = useUserData();
  const stored = useStoredProfiles();
  const me = useActiveProfile(stored ?? []);
  const firstName = stored?.length && me.name && !/^(moi|personne \d+)$/i.test(me.name) ? ` ${me.name}` : '';
  const season = currentSeason();
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  const sections = useMemo(() => {
    const rand = seeded(dailySeed());
    const noise = new Map(recipes.map((r) => [r.id, rand()]));
    const available = new Set([...fridge, ...pantry]);
    const recentPenalty = (r: IndexedRecipe) => {
      const last = lastCooked.get(r.id);
      if (!last) return 0;
      const days = (Date.now() - new Date(last).getTime()) / 86400000;
      return days < 10 ? 40 : days < 30 ? 12 : 0;
    };
    const seasonScore = (r: IndexedRecipe) => (r.seasons.includes(season) ? 18 : r.seasons.length ? -25 : 0);
    const availScore = (r: IndexedRecipe) =>
      available.size && r.mainIngredientIds.length ? (r.mainIngredientIds.filter((i) => available.has(i)).length / r.mainIngredientIds.length) * 25 : 0;

    const mains = recipes.filter((r) => ['plat', 'mijote', 'salade-composee', 'soupe'].includes(r.category));
    const moment = pickVaried(mains, 8, (r) => noise.get(r.id)! * 40 + seasonScore(r) + availScore(r) + (favorites.has(r.id) ? 12 : 0) - recentPenalty(r));
    const quick = pickVaried(
      mains.filter((r) => r.totalTime <= 30 && r.mealTypes.includes('diner')),
      8,
      (r) => noise.get(r.id)! * 40 + seasonScore(r) * 0.5 - recentPenalty(r),
    );
    const weekend = pickVaried(
      recipes.filter((r) => r.totalTime > 75 || r.tags.includes('week-end')),
      8,
      (r) => noise.get(r.id)! * 40 + seasonScore(r) - recentPenalty(r),
    );
    const breakfast = pickVaried(
      recipes.filter((r) => r.mealTypes.includes('petit-dejeuner')),
      8,
      (r) => noise.get(r.id)! * 40 + seasonScore(r) * 0.4,
    );
 const dense = pickVaried(
      mains.filter((r) => (r.density ?? 0) >= 55),
      8,
      (r) => (r.density ?? 0) + noise.get(r.id)! * 25 + seasonScore(r) * 0.5 - recentPenalty(r),
    );
    const newest = [...recipes].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || (noise.get(b.id)! - noise.get(a.id)!)).slice(0, 8);
    return { moment, quick, weekend, breakfast, newest, dense };
  }, [recipes, favorites, lastCooked, fridge, pantry, season]);

  const s = SEASONS[season];

  return (
    <div className="page">
      <section className="hero compact">
        <span className="deco">🥘</span>
        <h1>
          {greeting}
          {firstName} !
        </h1>
        <p>{stored?.length ? 'Voici votre journée.' : `${recipes.length} recettes nourrissantes, une semaine qui couvre 100 % de vos besoins.`}</p>
        <div className="row nowrap" style={{ gap: 8 }}>
          <Link className="btn" to="/recettes?focus=1">
            🔎 Rechercher
          </Link>
          <Link className="btn" to="/frigo">
            🥕 J’ai ces ingrédients
          </Link>
        </div>
      </section>

      <HomeToday />

      <Row title={`${s.emoji} Idées du moment`} subtitle={`Sélection de ${s.label.toLowerCase()} — renouvelée chaque jour`} items={sections.moment} link="/recettes" />
      <Row title="🌿 Les plus denses en nutriments" subtitle="Vitamines, minéraux, oméga-3 : le meilleur pour la santé" items={sections.dense} link="/recettes?sort=densite" />
      <Row title="⚡ Rapide ce soir" subtitle="Moins de 30 minutes" items={sections.quick} link="/recettes?q=dîner%20rapide" />
      <Row title="🍲 Cuisine du week-end" subtitle="Mijotés, rôtis, plats familiaux" items={sections.weekend} link="/recettes?q=week-end" />
      <Row title="🌅 Pour demain matin" items={sections.breakfast} link="/recettes?q=petit-déjeuner" />
      <Row title="🆕 Nouvelles recettes" subtitle="Dernières ajoutées à la bibliothèque" items={sections.newest} link="/recettes?sort=recent" />

    </div>
  );
}

function Row({ title, subtitle, items, link }: { title: string; subtitle?: string; items: IndexedRecipe[]; link: string }) {
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
        <Link to={link}>Tout voir →</Link>
      </div>
      <div className="hscroll">
        {items.map((r) => (
          <RecipeCard key={r.id} recipe={r} compact />
        ))}
      </div>
    </section>
  );
}
