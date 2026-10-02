import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary, useUserData } from '../hooks/library';
import { CATEGORIES, CUISINES, DIFFICULTIES, MEAL_TYPES, PROTEINS, TECHNIQUES } from '../domain/labels';

/** Cibles de diversité à terme (§47) — sert à repérer les catégories sous-représentées */
const TARGETS: Record<string, number> = {
  francaise: 100,
  italienne: 100,
  grecque: 75,
  espagnole: 75,
  levantine: 75,
  rustique: 100,
  japonaise: 40,
  indienne: 40,
};

export function Stats() {
  const { recipes } = useLibrary();
  const { favorites } = useUserData();

  const s = useMemo(() => {
    const by = (f: (r: (typeof recipes)[number]) => string | string[] | undefined) => {
      const m = new Map<string, number>();
      for (const r of recipes) {
        const v = f(r);
        for (const k of Array.isArray(v) ? v : v ? [v] : []) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      cuisine: by((r) => r.cuisine),
      protein: by((r) => r.mainProtein ?? 'aucune'),
      meal: by((r) => r.mealTypes),
      category: by((r) => r.category),
      difficulty: by((r) => r.difficulty),
      technique: by((r) => r.technique),
      quick15: recipes.filter((r) => r.totalTime <= 15).length,
      quick30: recipes.filter((r) => r.totalTime <= 30).length,
      quick45: recipes.filter((r) => r.totalTime <= 45).length,
      long: recipes.filter((r) => r.totalTime > 60).length,
      user: recipes.filter((r) => r.source === 'user').length,
      recent: [...recipes].filter((r) => r.source !== 'seed').sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 8),
      avgKcal: Math.round(recipes.reduce((a, r) => a + r.nutrition.kcal, 0) / Math.max(1, recipes.length)),
      avgProt: Math.round(recipes.reduce((a, r) => a + r.nutrition.protein, 0) / Math.max(1, recipes.length)),
    };
  }, [recipes]);

  const label = (dim: string, k: string) => {
    switch (dim) {
      case 'cuisine':
        return `${CUISINES[k as keyof typeof CUISINES]?.emoji ?? ''} ${CUISINES[k as keyof typeof CUISINES]?.label ?? k}`;
      case 'protein':
        return PROTEINS[k as keyof typeof PROTEINS] ? `${PROTEINS[k as keyof typeof PROTEINS].emoji} ${PROTEINS[k as keyof typeof PROTEINS].label}` : 'Sans protéine dominante';
      case 'meal':
        return MEAL_TYPES[k as keyof typeof MEAL_TYPES]?.label ?? k;
      case 'category':
        return CATEGORIES[k as keyof typeof CATEGORIES]?.label ?? k;
      case 'difficulty':
        return DIFFICULTIES[k as keyof typeof DIFFICULTIES]?.label ?? k;
      case 'technique':
        return TECHNIQUES[k as keyof typeof TECHNIQUES]?.label ?? k;
    }
    return k;
  };

  const Bars = ({ dim, data }: { dim: string; data: Array<[string, number]> }) => {
    const max = Math.max(...data.map((d) => d[1]), 1);
    return (
      <div>
        {data.map(([k, v]) => {
          const target = dim === 'cuisine' ? TARGETS[k] : undefined;
          return (
            <div key={k} className="bar-row">
              <span>{label(dim, k)}</span>
              <div className={`bar ${target && v < target / 3 ? 'low' : ''}`} title={target ? `objectif : ${target}` : undefined}>
                <div style={{ width: `${(v / max) * 100}%` }} />
              </div>
              <strong style={{ textAlign: 'right' }}>{v}</strong>
            </div>
          );
        })}
      </div>
    );
  };

  const under = s.cuisine.filter(([k, v]) => TARGETS[k] && v < TARGETS[k] / 3).map(([k]) => k);
  const lowProteins = s.protein.filter(([, v]) => v < 12).map(([k]) => k);

  return (
    <div className="page">
      <h1>📊 Statistiques de la bibliothèque</h1>
      <div className="stat-grid">
        <Stat v={recipes.length} l="recettes au total" />
        <Stat v={favorites.size} l="favoris" />
        <Stat v={s.quick15} l="⚡ ≤ 15 min" />
        <Stat v={s.quick30} l="⚡ ≤ 30 min" />
        <Stat v={s.quick45} l="⚡ ≤ 45 min" />
        <Stat v={s.long} l="🍲 longues (> 1 h)" />
        <Stat v={s.user} l="✍️ ajoutées par vous" />
        <Stat v={`${s.avgKcal}`} l="kcal moy. / portion" />
        <Stat v={`${s.avgProt} g`} l="protéines moy. / portion" />
      </div>

      {(under.length > 0 || lowProteins.length > 0) && (
        <div className="callout section">
          <strong>Catégories sous-représentées</strong>
          <p className="small" style={{ margin: '4px 0 8px' }}>
            {under.length > 0 && <>Cuisines : {under.map((k) => CUISINES[k as keyof typeof CUISINES].label).join(', ')}. </>}
            {lowProteins.length > 0 && <>Protéines : {lowProteins.map((k) => label('protein', k)).join(', ')}.</>}
          </p>
          <Link to="/ajouter" className="btn sm primary">
            ➕ Ajouter une recette
          </Link>
        </div>
      )}

      <div className="section" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <section className="card pad">
          <h2>Par cuisine</h2>
          <Bars dim="cuisine" data={s.cuisine} />
        </section>
        <section className="card pad">
          <h2>Par protéine principale</h2>
          <Bars dim="protein" data={s.protein} />
        </section>
        <section className="card pad">
          <h2>Par repas</h2>
          <Bars dim="meal" data={s.meal} />
          <h2 style={{ marginTop: 18 }}>Par type de plat</h2>
          <Bars dim="category" data={s.category} />
        </section>
        <section className="card pad">
          <h2>Par difficulté</h2>
          <Bars dim="difficulty" data={s.difficulty} />
          <h2 style={{ marginTop: 18 }}>Par technique</h2>
          <Bars dim="technique" data={s.technique} />
        </section>
      </div>

      {s.recent.length > 0 && (
        <section className="section">
          <h2>Ajoutées récemment</h2>
          <ul>
            {s.recent.map((r) => (
              <li key={r.id}>
                <Link to={`/recette/${r.id}`}>{r.name}</Link> <span className="small muted">(vous)</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ v, l }: { v: number | string; l: string }) {
  return (
    <div className="card stat">
      <div className="sv">{v}</div>
      <div className="small muted">{l}</div>
    </div>
  );
}
