# Notre Cuisine: our personal cooking library

A web app (designed for phones first) to find, cook, plan and shop for recipes that fit the household's way of eating.

Published by GitHub Pages at **`/cuisine/`** (for example `https://brunocreation.github.io/cuisine/`).

## Features

| Area | Features |
|---|---|
| Library | 593 recipes (about 78 % French and European classics), 20 cuisines, cards, detailed recipe pages with vitamins, minerals, electrolytes and amino acids as % of daily needs |
| Search | Full-text search by name, ingredient, cuisine or tag, with phrases understood (« dîner rapide », « italien », « œufs fromage »), plus 12 combinable filters |
| Ingredients → recipes | « J'ai ces ingrédients »: instant ingredient search, 3 modes (cook now, almost nothing missing, show everything), equivalent substitutes, staples ignored |
| Recipes → shopping | Selected recipes or the week's plan go into one list: quantities scaled to servings, identical ingredients merged, units converted, pantry items removed, list sorted by aisle with checkboxes, anti-waste warnings with suggested recipes |
| Organisation | Favourites, history (used to avoid repeats), weekly planner (tap to place or drag and drop), automatic week generation that balances variety, season and time |
| Cooking | Adjust servings (1–8), cook mode with one step per screen, large buttons, swipe, timers, screen kept awake |
| Adding | Full form with photo, ingredient search, custom ingredients, nutrition calculated automatically, check against the eating philosophy, check for similar recipes |
| Nutrition | Every recipe gets a nutrient density index (0–100) and a detailed breakdown: 13 vitamins, 8 minerals, electrolytes, omega-3, fibre and the 9 essential amino acids, as % of each household profile's daily needs. The weekly planner optimises the four meals of each day to get as close as possible to 100 % of those needs |
| Recipe creator | When an AND / OR ingredient search finds nothing, a built-in composer writes a complete recipe from those ingredients (free, no AI or API key) |
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
    philosophy.ts     eating philosophy rules
    micronutrients.ts vitamins, minerals, amino acids, density index, daily references (EFSA)
    nutriPlanner.ts   weekly menu optimised for daily nutrient coverage
    composer.ts       built-in recipe creator
    ingredientQuery.ts AND / OR / WITHOUT ingredient search
  src/data/
    ingredients.ts    330 normalised ingredients (aliases, nutrition, aisles, pack sizes)
    recipes/*.json    seed library, one file per slice, loaded on demand
  src/db/db.ts      IndexedDB (Dexie): favourites, history, planner, pantry, shopping, added recipes
  src/data/micronutrients/*.json  micronutrients per ingredient (per 100 g)
  scripts/validate-recipes.ts   library validation (schema, ingredients, philosophy, duplicates, stats)
  tests/            Vitest tests (scenarios A, B and C, planner)
```

- **Structured, normalised data.** Each recipe references `ingredient_id`s. Aliases (« PDT », « pommes de terre ») point to the same ingredient. Nutrition is computed from the quantities.
- **Persistence.** Data lives in the browser (IndexedDB). It can be exported and imported as JSON (Settings) to sync both phones.
- **Scale.** Recipes are indexed in memory and lists load progressively, which is enough for several thousand recipes. To add recipes, drop a JSON file into `src/data/recipes/` and run the validator.
- **No paid services.** Everything runs in the browser, with no server, no AI and no API key.

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
