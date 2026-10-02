# Brief de rédaction des recettes (bibliothèque initiale)

Tu rédiges des recettes pour une application de cuisine personnelle d'un couple (2 personnes par défaut).
Toutes les recettes sont en **français**, réellement cuisinables, détaillées, et respectent la philosophie ci-dessous.

## Philosophie alimentaire — RÈGLE FONDAMENTALE

Lis `src/domain/philosophy.ts` (constante `PHILOSOPHY_PROMPT`). Résumé :
- Densité nutritionnelle + digestibilité + qualité + variété + énergie suffisante + plaisir + simplicité. Pragmatique, PAS paleo/keto/carnivore.
- Objectif : **prise de poids et de muscle** → recettes généreuses. Plats principaux : viser **≥ 30 g de protéines** et **600–1000 kcal par portion**, avec glucides ET lipides. Petits-déjeuners : 400–900 kcal. Collations : 250–600 kcal. Desserts : maison, à base de produits laitiers/fruits/œufs/miel.
- Protéines animales TRÈS variées (bœuf, veau, agneau, porc, poulet, dinde, canard, poissons blancs, poissons gras, fruits de mer, œufs, abats). Le poulet ne doit pas dominer.
- Abats (foie, cœur, rognons, moelle, gésiers, langue, ris), bouillons d'os, collagène : intégrés dans de VRAIES recettes gourmandes. Foie régulièrement mais raisonnablement.
- Laitiers traditionnels : lait cru, kéfir, beurre, crème crue, fromages au lait cru, yaourt entier.
- Glucides bienvenus : pommes de terre, riz, patate douce, pain de seigle/levain, sarrasin, avoine, polenta, fruits, miel.
- **INTERDITS** : whey, poudres protéinées, beurre de cacahuète, purées d'oléagineux, chia, ultra-transformés, sodas, margarine, surimi, plats industriels. Sucre ajouté modéré (miel/sirop d'érable/sucre complet en petite quantité).
- Oxalates : pas de grandes quantités d'épinards (≤ 100 g/portion), d'amandes (≤ 25 g/portion), de cacao/chocolat (≤ 20 g/portion), de betterave.
- FODMAP : modéré, mais **ail et oignon autorisés normalement**. Ne pas empiler légumineuses + chou + crucifères crus. Légumineuses : rarement, en accompagnement.
- Cuisson : beurre, ghee, graisse de canard, saindoux, huile d'olive, huile de coco (pas de friture à l'huile de tournesol).
- Difficulté : ~45 % « tres-facile », ~40 % « facile », ~15 % « intermediaire ».

## VARIÉTÉ — PRIORITÉ MAJEURE

Chaque recette doit être **culinairement distincte** : pas de « poulet citron » / « poulet citron thym ». Varier protéine, féculent, légumes, sauce, épices, technique, texture, temps, cuisine.
Avant d'écrire, consulte les fichiers déjà présents dans `src/data/recipes/` pour éviter les doublons avec les autres rédacteurs (d'autres agents écrivent en parallèle d'autres fichiers ; le validateur détecte les recettes trop proches).

## Format (JSON strict)

Écris un **tableau JSON** dans le fichier qui t'est attribué. Exemple complet : `src/data/recipes/01-classiques.json`.
Types : `src/domain/types.ts` (interface `Recipe`). Champs :

| champ | valeurs |
|---|---|
| `id` | kebab-case unique, sans accent, préfixé par ton préfixe attribué (ex. `pdj-…`) |
| `name`, `description` | description 1–2 phrases, appétissante, concrète |
| `emoji` | un emoji représentatif |
| `category` | `petit-dejeuner` `plat` `salade-composee` `soupe` `mijote` `accompagnement` `collation` `dessert` `sauce` `boisson` |
| `mealTypes` | un ou plusieurs de `petit-dejeuner` `dejeuner` `diner` `collation` `dessert` |
| `cuisine` | `francaise` `italienne` `grecque` `espagnole` `portugaise` `levantine` `turque` `nord-africaine` `japonaise` `coreenne` `chinoise` `thai-vietnamienne` `indienne` `mexicaine` `latino-americaine` `nordique` `britannique` `europe-centrale` `americaine` `rustique` |
| `prepTime`, `cookTime` | minutes (travail actif / cuisson). `restTime` optionnel (marinade, repos, nuit au frigo) |
| `difficulty` | `tres-facile` `facile` `intermediaire` |
| `servings` | portions de base des quantités (2 en général ; 4–6 pour mijotés/rôtis/batch/desserts) |
| `ingredients` | `[{ "id", "qty", "unit", "note"?, "optional"? }]` |
| `steps` | 4–9 étapes **précises** : températures (°C, feu vif/moyen/doux), durées, repères visuels. Jamais « cuire jusqu'à ce que ce soit prêt ». |
| `tags` | parmi : `rapide` `économique` `batch cooking` `week-end` `sportif` `riche en protéines` `riche en glucides` `calorique` `léger` `familial` `une poêle` `four` `barbecue` `mijoté` `préparation à l’avance` `repas froid` `abats` `prise de masse` `lunch box` `réconfortant` `sans gluten` `riche en collagène` `fermenté` (3–7 tags) |
| `seasons` | `printemps` `ete` `automne` `hiver` — `[]` = toute l'année |
| `technique` | `poele` `four` `mijote` `grill` `vapeur` `poche` `cru` `friture-legere` `braise` `roti` `wok` `mixe` `sans-cuisson` `bouilli` |
| `flavors` | 1–3 parmi `umami` `herbace` `epice` `piquant` `acidule` `sucre` `fume` `cremeux` `frais` `reconfortant` `iode` `grille` `lacte` `fruite` |
| `tips` | optionnel : astuce, conservation, variante |

### Ingrédients — IMPORTANT
- `id` doit exister dans la base : **liste complète dans `docs/INGREDIENTS.txt`** (source : `src/data/ingredients.ts`). N'invente aucun id. Si l'ingrédient exact n'existe pas, prends l'id le plus proche (les alias indiquent ce qu'il couvre, ex. `cabillaud` couvre colin/lieu/merlu ; `comte` couvre gruyère/beaufort/emmental) et précise dans `note` (ex. `"note": "ou merlu"`).
- **Ne modifie pas** `src/data/ingredients.ts`.
- Unités : `g` `kg` `ml` `cl` `l` `piece` `cas` (c. à soupe) `cac` (c. à café) `pincee` `tranche` `gousse` `brin` `feuille` `botte` `filet` `au-gout`.
- `piece` seulement si l'ingrédient a un poids pièce (voir `pièce≈` dans la liste) ; sinon grammes. Pour l'ail : `gousse`. Œufs : `piece`. Citron : `piece`.
- Sel/poivre : `{ "id": "sel", "qty": 1, "unit": "au-gout" }`.
- Quantités réalistes pour `servings` portions (la nutrition est **calculée automatiquement** à partir des quantités → elles doivent être justes).
- Un même id une seule fois par recette.

## Validation (obligatoire)

Après écriture, lance depuis `cuisine-app/` :

```
npx tsx scripts/validate-recipes.ts src/data/recipes/<ton-fichier>.json
```

Corrige **toutes les erreurs** (❌). Traite les avertissements (⚠️) : protéines/calories trop basses → augmente les portions de protéine / féculent / matière grasse ; « trop proche » → rends la recette réellement différente ou remplace-la. Itère jusqu'à 0 erreur et le moins d'avertissements possible. Ne touche à aucun autre fichier que le tien.

Dans ton message final : nombre de recettes, répartition (repas / protéines / cuisines / temps), avertissements restants éventuels. Pas besoin de recopier les recettes.

## Digestibilité et antinutriments (règles vérifiées automatiquement)

Le validateur applique `src/domain/digestion.ts`. Le détail, avec les sources, est dans `docs/sources/` et les consignes de correction dans `docs/FIX_BRIEF.md`.

- **Avoine** : trempage ≥ 12 h dans un liquide acide, avec de la farine de seigle ou de sarrasin.
- **Sarrasin, boulgour et orge** : trempage acide ≥ 7 h.
- **Pâte à galettes de sarrasin** : repos ≥ 8 h.
- **Riz complet** : trempage ≥ 12 h.
- **Quinoa** : rinçage, puis trempage ≥ 8 h.
- **Lentilles vertes** : trempage ≥ 7 h. **Lentilles corail** : trempage ≥ 2 h.
- **Oléagineux** : ≤ 30 g par portion, ou trempés puis séchés.
- **Interdits** : huile de colza (et autres huiles de graines en cuisson), soja non fermenté (edamame), graines de lin.
- **Huiles de sésame et de noix** : ≤ 1 c. à café par portion, en assaisonnement.
- **Oxalates** : ≤ 150 mg par portion. Si le plat dépasse 60 mg, ajouter un laitage riche en calcium.
- **Foie** : ≤ 150 g par portion.
- **Poisson cru** : congélation préalable à −20 °C pendant 24 h.
