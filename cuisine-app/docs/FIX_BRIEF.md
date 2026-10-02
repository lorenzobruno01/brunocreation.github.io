# Brief de correction : digestibilité et antinutriments

Le foyer a signalé, à juste titre, que des recettes utilisaient de l'avoine, des légumineuses, des céréales ou des oléagineux **sans préparation traditionnelle** (trempage, fermentation), ainsi que des huiles de graines, du soja non fermenté, du lin ou trop d'oxalates. Les règles sont désormais vérifiées par `src/domain/digestion.ts` (fonction `analyzeDigestion`), branchée sur le validateur. Leurs fondements sont dans `docs/sources/antinutriments.md`, `docs/sources/sensibilites.md` et `docs/sources/regimes.md`. Lis au moins leurs sections « RÈGLES PRATIQUES ».

## Comment corriger chaque erreur

- **Avoine** : ajoute une étape « La veille au soir : … » qui fait tremper les flocons **au moins 12 h** dans de l'eau tiède (35-40 °C au départ) avec 1 à 2 c. à soupe de kéfir, de yaourt ou de jus de citron pour 100 g d'avoine, **plus 1 c. à soupe de farine de seigle ou de sarrasin** (ajoute l'ingrédient `farine-seigle` ou `farine-sarrasin`). Cuis ensuite l'avoine (porridge, flapjacks, granola cuit au four après trempage et séchage…). Mets `restTime` à 720 minutes au moins. Le texte doit contenir explicitement les mots « tremper », « 12 h » (ou « la veille », « une nuit »), l'acide et « seigle » ou « sarrasin ». Si la recette ne s'y prête pas (crumble cru, overnight oats froids…), transforme-la : flocons trempés puis séchés au four, ou remplacement de l'avoine.
- **Sarrasin, boulgour, orge** : trempage ≥ 7 h (idéalement 12 h) dans de l'eau tiède acidifiée (1 c. à soupe de citron, vinaigre ou kéfir), rinçage, cuisson. `restTime` ≥ 420.
- **Farine de sarrasin** (galettes, blinis, crêpes) : pâte reposée et fermentée **≥ 8 h ou une nuit** à température ambiante. Le mot « repos » ou « fermenter » doit apparaître avec « nuit » ou une durée.
- **Riz complet** : trempage 12 à 24 h, eau jetée. Ou remplace-le par du `riz-blanc`.
- **Quinoa** : rinçage énergique, puis trempage ≥ 8 h avec un acide et nouveau rinçage. Ou remplace-le.
- **Lentilles vertes** : trempage ≥ 7 h, eau jetée. **Lentilles corail** : trempage ≥ 2 h.
- **Oléagineux et graines > 30 g par portion** : réduis à 30 g ou moins, ou utilise des oléagineux trempés (eau salée, ≥ 7 h) puis séchés au four à 60 °C maximum. Le texte doit dire « tremper » puis « sécher » ou « déshydrater ».
- **Huile de sésame ou de noix** : 1 c. à café par portion au maximum, en assaisonnement hors du feu. Réduis la quantité et cuis au beurre, au ghee ou à l'huile d'olive.
- **Edamame, graines de lin** : retire-les ou remplace-les (petits pois, fèves, autre légume ; graines de courge en petite quantité).
- **Oxalates > 150 mg par portion** : réduis fortement la quantité de l'ingrédient en cause (épinards ≤ 40 g par portion, ou remplace-les par du chou, de la laitue, de la courgette, du brocoli, de la mâche… ; sarrasin ≤ 50 g sec par portion, ou complète avec du riz blanc ou des pommes de terre), et ajoute un laitage riche en calcium dans le repas. Pour les épinards restants, blanchis-les 2 à 3 min et jette l'eau.
- **Foie > 150 g par portion** : réduis à 150 g ou moins (ou augmente `servings`).
- **Poisson cru** : ajoute une étape « Congelez le poisson 24 h à −20 °C au préalable (ou achetez-le qualité sashimi) ».

## Contraintes

- Chaque recette doit rester appétissante, cohérente et différente des autres, avec ≥ 30 g de protéines et 600 à 1000 kcal pour les plats principaux.
- Mets à jour `prepTime`, `cookTime`, `restTime`, `description` et `tips` si nécessaire. Ajoute le tag `préparation à l’avance` quand il y a un trempage la veille.
- Tu peux remplacer complètement une recette impossible à corriger par une autre, distincte, qui respecte les règles. Garde alors le même préfixe d'id.
- Valide après chaque lot : `npx tsx scripts/validate-recipes.ts src/data/recipes/<fichier>.json`. Vise 0 erreur. Traite aussi les avertissements « [oxalates] » et « [phytates] » quand c'est simple.
- Ne modifie que les fichiers qui te sont attribués.
