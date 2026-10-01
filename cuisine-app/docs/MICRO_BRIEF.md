# Brief : table des micronutriments par ingrédient

Objectif : pour chaque ingrédient de la base (`src/data/ingredients.ts`), fournir les teneurs **pour 100 g de partie comestible, à l'état cru** (sauf ingrédient vendu cuit/préparé : pois chiches cuits, châtaignes cuites, conserves… → valeur du produit tel que vendu), d'après tes connaissances des tables **Ciqual (ANSES)** et **USDA FoodData Central**. Valeurs moyennes, arrondies raisonnablement. Mieux vaut une estimation réaliste qu'un champ omis pour un nutriment significatif.

## Format

Un fichier JSON : objet `{ "<ingredient_id>": { <clé>: valeur, ... }, ... }`. Omettre une clé = 0 / négligeable. Inclure **tous** les ids de ta liste (même `sel`, `eau` : `{}` ou seulement sodium).

| clé | nutriment | unité |
|---|---|---|
| `fib` | fibres | g |
| `vA` | vitamine A (équivalents rétinol, RAE) | µg |
| `vB1` | thiamine | mg |
| `vB2` | riboflavine | mg |
| `vB3` | niacine | mg |
| `vB5` | acide pantothénique | mg |
| `vB6` | vitamine B6 | mg |
| `vB9` | folates | µg |
| `vB12` | vitamine B12 | µg |
| `vC` | vitamine C | mg |
| `vD` | vitamine D | µg |
| `vE` | vitamine E | mg |
| `vK` | vitamine K | µg |
| `chol` | choline | mg |
| `ca` | calcium | mg |
| `fe` | fer | mg |
| `mg` | magnésium | mg |
| `p` | phosphore | mg |
| `k` | potassium | mg |
| `na` | sodium | mg |
| `zn` | zinc | mg |
| `cu` | cuivre | mg |
| `mn` | manganèse | mg |
| `se` | sélénium | µg |
| `i` | iode | µg |
| `o3` | oméga-3 totaux (ALA + EPA + DHA) | g |
| `epa` | EPA + DHA | g |

Exemples (ordre de grandeur) :
- `"foie-veau": { "vA": 9000, "vB2": 2.8, "vB12": 60, "vB9": 330, "cu": 10, "fe": 6, "zn": 12, "se": 40, "chol": 330, "p": 360, "k": 310, "na": 75, "vB3": 13, "vB6": 1, "vB5": 7, "vC": 20, "vD": 1.2, "mg": 18 }`
- `"sel": { "na": 38700 }`
- `"saumon": { "vD": 11, "vB12": 3.2, "se": 30, "o3": 2.3, "epa": 2, "p": 240, "k": 360, "vB3": 8, "vB6": 0.6, "i": 30, "mg": 27, "na": 45, "chol": 90 }`

Le nom, la catégorie et les alias de chaque ingrédient sont dans `docs/INGREDIENTS.txt` / `src/data/ingredients.ts` : utilise-les pour savoir de quel aliment il s'agit (ex. `comte` = fromage à pâte pressée cuite type comté).

## Contrôle

Après écriture, vérifie avec :

```
npx tsx -e "const d=require('./src/data/micronutrients/<fichier>.json');const ids=require('fs').readFileSync('docs/<liste>.txt','utf8').split(/\s+/).filter(Boolean);const miss=ids.filter(i=>!(i in d));const keys=new Set(['fib','vA','vB1','vB2','vB3','vB5','vB6','vB9','vB12','vC','vD','vE','vK','chol','ca','fe','mg','p','k','na','zn','cu','mn','se','i','o3','epa']);const bad=Object.entries(d).flatMap(([id,o])=>Object.entries(o).filter(([k,v])=>!keys.has(k)||typeof v!=='number'||v<0).map(([k])=>id+'.'+k));console.log('manquants',miss,'clés invalides',bad,'total',Object.keys(d).length)"
```

Ne modifie aucun autre fichier.
