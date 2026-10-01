import type { Filters } from '../domain/search';
import { CATEGORIES, CUISINES, DIFFICULTIES, MEAL_TYPES, PROTEINS, SEASONS, CONTEXT_TAGS } from '../domain/labels';
import type { Cuisine, Difficulty, MealType, ProteinGroup, RecipeCategory, Season } from '../domain/types';

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

const REGIONS: Record<string, string> = {
  mediterranee: '🫒 Méditerranéenne',
  asie: '🥢 Asiatique',
  orient: '🌙 Orient',
  europe: '🏔️ Europe',
  ameriques: '🌎 Amériques',
};

export function FiltersPanel({ value, onChange, showAvailability }: { value: Filters; onChange: (f: Filters) => void; showAvailability?: boolean }) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return (
    <div>
      <Group label="Repas">
        {(Object.keys(MEAL_TYPES) as MealType[]).map((m) => (
          <button key={m} className={`chip ${value.meals.includes(m) ? 'on' : ''}`} onClick={() => set({ meals: toggle(value.meals, m) })}>
            {MEAL_TYPES[m].emoji} {MEAL_TYPES[m].label}
          </button>
        ))}
      </Group>
      <Group label="Temps total">
        {[
          { l: '⚡ < 15 min', v: 15 },
          { l: '⚡ < 30 min', v: 30 },
          { l: '⚡ < 45 min', v: 45 },
          { l: '< 60 min', v: 60 },
        ].map((t) => (
          <button key={t.v} className={`chip ${value.maxTime === t.v ? 'on' : ''}`} onClick={() => set({ maxTime: value.maxTime === t.v ? undefined : t.v, longOnly: false })}>
            {t.l}
          </button>
        ))}
        <button className={`chip ${value.longOnly ? 'on' : ''}`} onClick={() => set({ longOnly: !value.longOnly, maxTime: undefined })}>
          🍲 Long (week-end)
        </button>
      </Group>
      <Group label="Difficulté">
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
          <button key={d} className={`chip ${value.difficulties.includes(d) ? 'on' : ''}`} onClick={() => set({ difficulties: toggle(value.difficulties, d) })}>
            {DIFFICULTIES[d].emoji} {DIFFICULTIES[d].label}
          </button>
        ))}
      </Group>
      <Group label="Protéine">
        {(Object.keys(PROTEINS) as ProteinGroup[]).map((p) => (
          <button key={p} className={`chip ${value.proteins.includes(p) ? 'on' : ''}`} onClick={() => set({ proteins: toggle(value.proteins, p) })}>
            {PROTEINS[p].emoji} {PROTEINS[p].label}
          </button>
        ))}
      </Group>
      <Group label="Cuisine">
        {Object.entries(REGIONS).map(([k, l]) => (
          <button key={k} className={`chip olive ${value.regions.includes(k) ? 'on' : ''}`} onClick={() => set({ regions: toggle(value.regions, k) })}>
            {l}
          </button>
        ))}
        {(Object.keys(CUISINES) as Cuisine[]).map((c) => (
          <button key={c} className={`chip ${value.cuisines.includes(c) ? 'on' : ''}`} onClick={() => set({ cuisines: toggle(value.cuisines, c) })}>
            {CUISINES[c].emoji} {CUISINES[c].label}
          </button>
        ))}
      </Group>
      <Group label="Type de plat">
        {(Object.keys(CATEGORIES) as RecipeCategory[]).map((c) => (
          <button key={c} className={`chip ${value.categories.includes(c) ? 'on' : ''}`} onClick={() => set({ categories: toggle(value.categories, c) })}>
            {CATEGORIES[c].emoji} {CATEGORIES[c].label}
          </button>
        ))}
      </Group>
      <Group label="Calories par portion">
        {[
          { l: '< 500', min: undefined, max: 500 },
          { l: '500 – 750', min: 500, max: 750 },
          { l: '750 – 1000', min: 750, max: 1000 },
          { l: '> 1000', min: 1000, max: undefined },
        ].map((c) => {
          const on = value.kcalMin === c.min && value.kcalMax === c.max;
          return (
            <button key={c.l} className={`chip ${on ? 'on' : ''}`} onClick={() => set(on ? { kcalMin: undefined, kcalMax: undefined } : { kcalMin: c.min, kcalMax: c.max })}>
              🔥 {c.l}
            </button>
          );
        })}
      </Group>
      <Group label="Protéines minimum">
        {[20, 30, 40, 50].map((p) => (
          <button key={p} className={`chip ${value.proteinMin === p ? 'on' : ''}`} onClick={() => set({ proteinMin: value.proteinMin === p ? undefined : p })}>
            🥩 ≥ {p} g
          </button>
        ))}
      </Group>
      <Group label="Saison">
        {(Object.keys(SEASONS) as Season[]).map((s) => (
          <button key={s} className={`chip ${value.seasons.includes(s) ? 'on' : ''}`} onClick={() => set({ seasons: toggle(value.seasons, s) })}>
            {SEASONS[s].emoji} {SEASONS[s].label}
          </button>
        ))}
      </Group>
      <Group label="Contexte">
        {CONTEXT_TAGS.map((t) => (
          <button key={t} className={`chip ${value.tags.includes(t) ? 'on' : ''}`} onClick={() => set({ tags: toggle(value.tags, t) })}>
            {t}
          </button>
        ))}
      </Group>
      {showAvailability && (
        <Group label="Disponibilité (frigo + garde-manger)">
          {[
            { l: '✅ Tout disponible', v: 0 },
            { l: 'Il manque 1 ingrédient', v: 1 },
            { l: 'Il manque 2 ingrédients', v: 2 },
            { l: 'Il manque 3 ingrédients', v: 3 },
          ].map((a) => (
            <button key={a.v} className={`chip ${value.maxMissing === a.v ? 'on' : ''}`} onClick={() => set({ maxMissing: value.maxMissing === a.v ? undefined : a.v })}>
              {a.l}
            </button>
          ))}
        </Group>
      )}
      <Group label="Autres">
        <button className={`chip ${value.favoritesOnly ? 'on' : ''}`} onClick={() => set({ favoritesOnly: !value.favoritesOnly })}>
          ❤️ Favoris uniquement
        </button>
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="filter-group">
      <span className="label">{label}</span>
      <div className="chips">{children}</div>
    </div>
  );
}
