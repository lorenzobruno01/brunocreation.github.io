# Brief : recettes pour le profil du foyer

Le foyer a coché 5 approches : **Weston A. Price (WAPF), anti-inflammatoire, pauvre en oxalates, prudent en phytoestrogènes, Primal**. Chaque nouvelle recette doit être compatible avec **les 5 à la fois**. Objectif : une alimentation dense en nutriments et anti-inflammatoire, qui permet de prendre du muscle (plats de 600 à 1000 kcal et au moins 30 g de protéines par portion).

Lis d'abord `docs/RECIPE_BRIEF.md` : format JSON, ingrédients autorisés, philosophie, variété. Les règles ci-dessous s'y **ajoutent**.

## Contraintes (vérifiées par `scripts/check-diets.ts`)

**Interdits (Primal)**
- pâtes, pâtes fraîches, udon, pains (levain, seigle, pita) ;
- semoule, boulgour, crozets, orge ;
- farine de blé, farine de seigle, chapelure ;
- sucre, huile de colza.

**Interdits (oxalates)**
- épinards, oseille, rhubarbe, betterave ;
- amandes, cajou, sésame, tahini ;
- cacao, chocolat ;
- sarrasin (et sa farine, ses nouilles), quinoa, miso.

**Interdits (phytoestrogènes)**
- edamame, graines de lin, bière.

**Limites par portion**
- pomme de terre : 200 g ;
- patate douce : 100 g ;
- noix, noisettes, pistaches, pignons : 15 g ;
- légumineuses (pois chiches, haricots, lentilles) : 60 g, trempées ;
- miel, sirop d'érable, confiture : 15 g ;
- lardons, bacon, chorizo, saucisson sec : 50 g ;
- merguez : 80 g ;
- **oxalates au total : 40 mg maximum par portion.** Attention aux carottes (20 mg/100 g), au céleri, aux poireaux, aux haricots verts, au persil (156 mg/100 g : 10 g au plus), à la cannelle et au curcuma (une pincée seulement), aux framboises et aux myrtilles.
- Pas de friture (technique `friture-legere` interdite).

**Avoine.** Pratiquement impossible : le trempage exigé demande du seigle ou du sarrasin, tous deux exclus. Ne pas en utiliser.

## Féculents conseillés pour l'énergie
Riz blanc ou rond, pommes de terre (200 g maximum), polenta, maïs et tortillas de maïs, nouilles de riz, farine de riz, châtaignes, panais, potimarron, butternut, plantain, manioc, patate douce (100 g maximum), fruits.

## Densité nutritionnelle (règles des livres et des études)
- *Nourishing Traditions* (Sally Fallon) et Weston A. Price : bouillons d'os, abats, graisses animales, laitages crus et fermentés, jaunes d'œufs.
- *Deep Nutrition* (Catherine Shanahan) : quatre piliers — viande sur l'os, abats, aliments fermentés, végétaux frais.
- Préférer les **morceaux gras et sur l'os** : cuisses de poulet avec la peau plutôt que des blancs, plat de côtes, jarret, joue, queue.
- **Poissons gras** (sardines, maquereau, saumon, hareng : oméga-3, vitamine D), **coquillages** (zinc, B12), **foie** (petite part).
- Varier les protéines, les techniques, les cuisines et les saisons.
- Dans `tips`, ajouter si pertinent une ligne qui explique **pourquoi la recette est nutritive**, sans inventer de chiffres.

## Validation obligatoire
Depuis `cuisine-app/` :
```
npx tsx scripts/check-diets.ts src/data/recipes/<ton-fichier>.json
npx tsx scripts/validate-recipes.ts src/data/recipes/<ton-fichier>.json
```
- Les deux commandes doivent donner **100 % de recettes compatibles et 0 erreur**.
- Corrige les avertissements « trop proche » en rendant la recette réellement différente.
- Ne modifie **aucun autre fichier** que le tien. D'autres rédacteurs écrivent en parallèle.
