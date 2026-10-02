# D'où viennent les chiffres de vitamines et minéraux ?

> Mise à jour : 2 octobre 2026.

## Source principale : la table officielle USDA (SR 28)

- **298 des 344 ingrédients** de l'application ont leurs vitamines et minéraux tirés de la **USDA National Nutrient Database for Standard Reference, Release 28** (département de l'Agriculture des États-Unis, Nutrient Data Laboratory, 2015 ; données reprises dans FoodData Central « SR Legacy »). C'est la table de composition des aliments la plus complète et la plus utilisée au monde.
- Chaque ingrédient est relié à l'aliment USDA le plus proche, **cru** quand l'ingrédient s'achète cru (viandes, poissons, légumes) et **sec** pour les féculents secs (riz, pâtes, céréales). La liste complète des correspondances est dans `docs/sources/usda-sr28-correspondances.tsv` (numéro NDB et description USDA).
- Nutriments repris de l'USDA : calcium, fer, magnésium, phosphore, potassium, sodium, zinc, cuivre, manganèse, sélénium, vitamines A (équivalents rétinol), B1, B2, B3, B5, B6, B9 (folates totaux), B12, C, D, E, K, choline et fibres.
- Quand l'USDA ne donne pas de valeur pour un nutriment, on garde l'estimation précédente.

## Précautions prises

- **Produits enrichis.** Aux États-Unis, le pain et la chapelure sont enrichis en fer et en vitamines B, ce qui n'est pas le cas en France. Pour le pain de seigle, le pain au levain et la chapelure, le fer, les vitamines B1, B2, B3 et les folates de l'USDA sont donc ignorés. Pour les farines, le riz, les pâtes et l'avoine, ce sont les versions **non enrichies** qui ont été choisies.
- **Lait.** On utilise le lait entier **sans vitamine D ajoutée**, comme en France.
- **Correspondances écartées.** Certains aliments n'ont pas d'équivalent fiable dans la table USDA. Ils gardent donc des valeurs estimées, à partir des moyennes des tables européennes (CIQUAL / ANSES) :
  - le foie gras, très différent du foie d'oie cru ;
  - le petit salé, qui n'est pas du « salt pork » ;
  - le mascarpone ;
  - la moutarde de Dijon ;
  - le cacao, l'algue nori séchée et les airelles séchées ;
  - les herbes fraîches que l'USDA ne propose que séchées ;
  - le poivre, le safran et le clou de girofle ;
  - le fromage blanc, le skyr, l'halloumi, le manchego et le paneer ;
  - les charcuteries françaises (merguez, andouillette, boudin blanc) ;
  - le foie de morue en conserve.
- **Iode et oméga-3 (EPA + DHA).** La table abrégée de l'USDA ne les donne pas. Ce sont des estimations tirées des valeurs moyennes publiées (CIQUAL, EFSA), à considérer comme des ordres de grandeur.

## Ce que cela change

- L'ancienne base, estimée « de mémoire », avait des écarts nets pour environ 275 valeurs. Les plus fréquents concernaient le sélénium, les vitamines B1, B3 et B12, le sodium, les folates et le fer. Le tableau de couverture de la semaine repose désormais sur des données de référence.
- Même avec ces données, la composition réelle varie selon la race, l'alimentation de l'animal, la saison, la variété et la cuisson. Les vitamines B et C diminuent de 10 à 40 % à la cuisson. Les pourcentages affichés sont donc des **repères**, pas des mesures.

## Besoins de référence

- Vitamines et minéraux : apports de référence de l'**EFSA** (2017–2023), valeurs adultes 18–60 ans, homme ou femme selon le profil.
- Acides aminés essentiels : besoins **OMS / FAO / UNU 2007** (mg par kg de poids corporel).

## Pour aller plus loin

- USDA, Agricultural Research Service. *USDA National Nutrient Database for Standard Reference, Release 28* (2015), et *FoodData Central — SR Legacy* (2018).
- ANSES. *Table de composition nutritionnelle des aliments Ciqual* (version 2020 et suivantes).
- EFSA. *Dietary Reference Values for nutrients — Summary report* (2017, mis à jour en 2019–2023).
