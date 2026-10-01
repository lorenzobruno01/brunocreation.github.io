# Notre Cuisine: our personal cooking library

A web app (designed for phones first) to find, cook, plan and shop for recipes that fit the household's way of eating.

Published by GitHub Pages at **`/cuisine/`** (for example `https://brunocreation.github.io/cuisine/`).

## Features

| Area | Features |
|---|---|
| Library | 353 initial recipes (62 breakfasts, 239 lunches, 222 dinners, 53 snacks, 48 desserts, 82 soups, stews and sides), 20 cuisines, cards, detailed recipe pages |
| Search | Full-text search by name, ingredient, cuisine or tag, with phrases understood (« dîner rapide », « italien », « œufs fromage »), plus 12 combinable filters |
| Ingredients → recipes | « J'ai ces ingrédients »: instant ingredient search, 3 modes (cook now, almost nothing missing, show everything), equivalent substitutes, staples ignored |
| Recipes → shopping | Selected recipes or the week's plan go into one list: quantities scaled to servings, identical ingredients merged, units converted, pantry items removed, list sorted by aisle with checkboxes, anti-waste warnings with suggested recipes |
| Organisation | Favourites, history (used to avoid repeats), weekly planner (tap to place or drag and drop), automatic week generation that balances variety, season and time |
| Cooking | Adjust servings (1–8), cook mode with one step per screen, large buttons, swipe, timers, screen kept awake |
| Adding | Full form with photo, ingredient search, custom ingredients, nutrition calculated automatically, check against the eating philosophy, check for similar recipes |
| AI (Claude) | Generate 10 or 20 recipes, a week, recipes around an ingredient or a cuisine; adapt or substitute a recipe; plan the week. Every generated recipe is checked against the library for duplicates before it is added |
| Statistics | Breakdown by cuisine, protein, meal, difficulty and technique; under-represented categories are flagged |

## Architecture

```
cuisine-app/
  src/domain/       business logic (pure TypeScript, tested)
    types.ts          data model (Recipe, Ingredient, PlanEntry…)
    units.ts          unit conversion g/kg/ml/L/piece/spoons…
    indexing.ts       automatic nutrition + index (proteins, starches, search text)
    search.ts         query parsing + combinable filters
    matching.ts       ingredients → recipes matching engine
    shopping.ts       consolidation, pantry, aisles, anti-waste
    similarity.ts     anti-repetition fingerprint and score
    planner.ts        weekly menu generation
    philosophy.ts     eating philosophy: rules + AI prompt
  src/data/
    ingredients.ts    330 normalised ingredients (aliases, nutrition, aisles, pack sizes)
    recipes/*.json    seed library, one file per slice, loaded on demand
  src/db/db.ts      IndexedDB (Dexie): favourites, history, planner, pantry, shopping, added recipes
  src/ai/           Claude integration (SDK loaded on demand)
  scripts/validate-recipes.ts   library validation (schema, ingredients, philosophy, duplicates, stats)
  tests/            Vitest tests (scenarios A, B and C, planner)
```

- **Structured, normalised data.** Each recipe references `ingredient_id`s. Aliases (« PDT », « pommes de terre ») point to the same ingredient. Nutrition is computed from the quantities.
- **Persistence.** Data lives in the browser (IndexedDB). It can be exported and imported as JSON (Settings) to sync both phones.
- **Scale.** Recipes are indexed in memory and lists load progressively, which is enough for several thousand recipes. To add recipes, drop a JSON file into `src/data/recipes/` and run the validator.
- **AI.** The app calls the Anthropic API directly from the browser with the household's own API key, which is stored only on the device. Responses use structured outputs whose schema only accepts existing ingredient IDs. Each result is then checked against the eating philosophy and for similarity to existing recipes; duplicates are rejected and regenerated, up to 3 passes.

## Development

```bash
cd cuisine-app
npm install
npm run dev        # http://localhost:5173/cuisine/
npm test           # domain tests
npm run validate   # validate the recipe library
npm run build      # validate + typecheck + build into ../cuisine (published by GitHub Pages)
```

To enrich the library by hand or with an agent, follow `docs/RECIPE_BRIEF.md`. The ingredient list is in `docs/INGREDIENTS.txt` (regenerate it with `npx tsx scripts/list-ingredients.ts`).
