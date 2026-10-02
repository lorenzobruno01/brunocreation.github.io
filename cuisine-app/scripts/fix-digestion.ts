/**
 * Correction systématique des recettes selon les règles de digestion
 * (src/domain/digestion.ts). Idempotent : peut être relancé.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { analyzeDigestion, prepStepFor, OXALATE_MG } from '../src/domain/digestion';
import { toGrams } from '../src/domain/units';
import { computeDetailed, MICROS } from '../src/domain/micronutrients';
import type { Recipe } from '../src/domain/types';

const dir = join(import.meta.dirname, '../src/data/recipes');
const lookup = (id: string) => INGREDIENT_BY_ID[id];
const grams = (r: Recipe, id: string) => {
  const ri = r.ingredients.find((x) => x.id === id);
  return ri ? (toGrams(ri.qty, ri.unit, lookup(id)) ?? 0) / r.servings : 0;
};
const setGrams = (r: Recipe, id: string, perPortion: number) => {
  const ri = r.ingredients.find((x) => x.id === id)!;
  const ing = lookup(id);
  const g1 = toGrams(1, ri.unit, ing) ?? 1;
  ri.qty = Math.max(0, Math.round(((perPortion * r.servings) / g1) * 4) / 4);
};
const replaceText = (r: Recipe, re: RegExp, by: string) => {
  r.steps = r.steps.map((s) => s.replace(re, by));
  if (r.tips) r.tips = r.tips.replace(re, by);
  r.description = r.description.replace(re, by);
  r.name = r.name.replace(re, by);
};
const addTag = (r: Recipe, t: string) => !r.tags.includes(t) && r.tags.push(t);

const OX_CAP: Record<string, number> = { epinard: 40, sarrasin: 50, 'farine-sarrasin': 50, 'nouilles-sarrasin': 60, rhubarbe: 20, oseille: 20, betterave: 100, 'haricots-blancs': 120, amande: 20, cacao: 10, 'chocolat-noir': 20, sesame: 10, tahini: 20, 'noix-cajou': 25, noisette: 25, pignons: 20, quinoa: 60, 'patate-douce': 200, persil: 30 };

const SWEET = new Set(['petit-dejeuner', 'dessert', 'collation', 'boisson']);
const CALCIUM_IDS = ['manchego', 'comte', 'parmesan', 'pecorino', 'feta', 'yaourt-nature', 'yaourt-grec', 'kefir', 'fromage-blanc', 'cheddar', 'chevre-buche', 'roquefort', 'reblochon', 'camembert', 'mozzarella', 'skyr', 'lait'];

/**
 * Source de calcium cohérente avec le plat (le calcium lie les oxalates dans l'intestin) :
 * fromage de la cuisine du plat, ou yaourt en dessert pour les plats sucrés et les cuisines sans fromage.
 */
function addCalcium(r: Recipe, missingMg: number): boolean {
  const sweet = SWEET.has(r.category) && !r.flavors.includes('umami');
  const yaourt = ['yaourt-nature', 125, 250, 'Prévoyez un yaourt nature entier en dessert (son calcium limite l’absorption des oxalates).'] as const;
  const cheese = (id: string, label: string) => [id, 20, 40, `Terminez le repas par un morceau de ${label} (son calcium limite l’absorption des oxalates).`] as const;
  const BY_CUISINE: Record<string, readonly [string, number, number, string]> = {
    francaise: cheese('comte', 'comté'),
    rustique: cheese('comte', 'comté'),
    'europe-centrale': cheese('comte', 'fromage affiné (comté, emmental)'),
    britannique: cheese('cheddar', 'cheddar'),
    americaine: cheese('cheddar', 'cheddar'),
    italienne: ['parmesan', 20, 30, 'Servez parsemé de parmesan râpé (son calcium limite l’absorption des oxalates).'],
    espagnole: cheese('manchego', 'manchego'),
    portugaise: cheese('manchego', 'fromage de brebis affiné'),
    grecque: ['feta', 30, 60, 'Servez avec un peu de feta émiettée (son calcium limite l’absorption des oxalates).'],
    levantine: ['yaourt-grec', 100, 200, 'Servez avec une bonne cuillerée de yaourt épais (son calcium limite l’absorption des oxalates).'],
    turque: ['yaourt-grec', 100, 200, 'Servez avec une bonne cuillerée de yaourt épais (son calcium limite l’absorption des oxalates).'],
    'nord-africaine': ['yaourt-grec', 100, 200, 'Servez avec une bonne cuillerée de yaourt épais (son calcium limite l’absorption des oxalates).'],
    indienne: ['yaourt-nature', 125, 250, 'Servez avec un raïta (yaourt nature entier, sel, cumin) : son calcium limite l’absorption des oxalates.'],
    nordique: ['skyr', 125, 200, 'Prévoyez un skyr nature en dessert (son calcium limite l’absorption des oxalates).'],
  };
  const [id, min, max, step] = sweet
    ? (['yaourt-nature', 125, 250, 'Servez avec une cuillerée de yaourt nature entier (son calcium limite l’absorption des oxalates).'] as const)
    : (BY_CUISINE[r.cuisine] ?? yaourt);
  if (r.ingredients.some((i) => i.id === id)) return false;
  const perG = (MICROS[id]?.ca ?? 100) / 100;
  const g = Math.max(min, Math.min(max, Math.ceil(missingMg / perG / 5) * 5));
  r.ingredients.push({ id, qty: g * r.servings, unit: 'g', note: 'le calcium limite l’absorption des oxalates' });
  r.steps.push(step);
  return true;
}

let changed = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const data: Recipe[] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  let mod = false;
  for (const r of data) {
    const before = JSON.stringify(r);
    // 0. Oxalates modérés avec peu de calcium : ajouter un laitage adapté au plat
    {
      const d0 = analyzeDigestion(r, lookup);
      const ca = computeDetailed(r, lookup).ca ?? 0;
      if (d0.oxalateMg >= 60 && d0.oxalateMg <= 150 && ca < 300 && !r.ingredients.some((i) => CALCIUM_IDS.includes(i.id) && i.note?.includes('oxalates'))) {
        addCalcium(r, 300 - ca);
      }
    }
    let issues = analyzeDigestion(r, lookup).issues.filter((i) => i.level === 'error');
    if (!issues.length) {
      if (JSON.stringify(r) !== before) {
        mod = true;
        changed++;
      }
      continue;
    }
    const ids = () => new Set(r.ingredients.map((i) => i.id));

    // 1. Soja non fermenté / lin
    if (ids().has('edamame')) {
      const ri = r.ingredients.find((i) => i.id === 'edamame')!;
      if (ids().has('petits-pois')) r.ingredients = r.ingredients.filter((i) => i !== ri);
      else ri.id = 'petits-pois';
      replaceText(r, /edamames?/gi, 'petits pois');
    }
    if (ids().has('graines-lin')) {
      const ri = r.ingredients.find((i) => i.id === 'graines-lin')!;
      if (ids().has('graines-courge')) r.ingredients = r.ingredients.filter((i) => i !== ri);
      else {
        ri.id = 'graines-courge';
        ri.unit = 'g';
        ri.qty = 10 * r.servings;
      }
      replaceText(r, /graines de lin( moulues)?/gi, 'graines de courge');
    }
    // 2. Huiles de sésame / noix : 1 c. à café par portion en assaisonnement
    for (const oil of ['huile-sesame', 'huile-noix']) {
      const ri = r.ingredients.find((i) => i.id === oil);
      if (ri && (toGrams(ri.qty, ri.unit, lookup(oil)) ?? 0) / 0.92 / r.servings > 5.5) {
        ri.qty = r.servings;
        ri.unit = 'cac';
        ri.note = 'en assaisonnement, hors du feu';
        if (!ids().has('beurre-clarifie') && !ids().has('huile-olive') && !ids().has('beurre')) r.ingredients.push({ id: 'beurre-clarifie', qty: 15 * r.servings, unit: 'g', note: 'pour la cuisson' });
        replaceText(r, /huile de (sésame|noix)( grillé)?(?! hors)/i, 'beurre clarifié');
        r.steps.push(`Hors du feu, arrosez d’un filet d’${lookup(oil)!.name} (1 c. à café par personne) pour le parfum.`);
      }
    }
    // 3. Oléagineux > 30 g par portion
    for (const n of ['noix', 'noisette', 'amande', 'pistache', 'noix-cajou', 'pignons', 'macadamia', 'graines-courge', 'sesame']) {
      if (grams(r, n) > 30) setGrams(r, n, 30);
    }
    // 4. Foie ≤ 150 g
    for (const l of ['foie-volaille', 'foie-veau', 'foie-agneau', 'foie-gras']) if (grams(r, l) > 150) setGrams(r, l, 150);
    // 5. Oxalates
    for (let k = 0; k < 4; k++) {
      const d = analyzeDigestion(r, lookup);
      if (d.oxalateMg <= 150) break;
      const top = r.ingredients
        .map((ri) => [ri.id, ((OXALATE_MG[ri.id] ?? 0) * (toGrams(ri.qty, ri.unit, lookup(ri.id)) ?? 0)) / 100 / r.servings] as const)
        .sort((a, b) => b[1] - a[1])[0];
      const cap = OX_CAP[top[0]] ?? grams(r, top[0]) * 0.6;
      setGrams(r, top[0], Math.min(cap, grams(r, top[0]) * 0.7));
      if (top[0] === 'epinard' && !/blanch/i.test(r.steps.join(' '))) r.steps.splice(1, 0, 'Blanchissez les épinards 2 min dans l’eau bouillante salée, égouttez-les et jetez l’eau de cuisson (cela élimine une bonne partie des oxalates solubles).');
      if (!CALCIUM_IDS.some((c) => ids().has(c))) addCalcium(r, 300);
    }
    // 6. Préparations traditionnelles (trempage la veille)
    issues = analyzeDigestion(r, lookup).issues.filter((i) => i.level === 'error' && i.topic === 'phytates');
    if (issues.length) {
      let rest = r.restTime ?? 0;
      const pre: string[] = [];
      for (const ri of r.ingredients) {
        const p = prepStepFor(ri.id);
        if (!p) continue;
        pre.push(p.step);
        rest = Math.max(rest, p.restMinutes);
        if (ri.id === 'flocons-avoine') {
          const oat = (toGrams(ri.qty, ri.unit, lookup(ri.id)) ?? 0);
          if (!ids().has('farine-seigle') && !ids().has('farine-sarrasin')) r.ingredients.push({ id: 'farine-seigle', qty: Math.max(10, Math.round(oat * 0.12)), unit: 'g', note: 'pour le trempage de l’avoine (phytase)' });
          if (!ids().has('kefir') && !ids().has('yaourt-nature') && !ids().has('yaourt-grec')) r.ingredients.push({ id: 'kefir', qty: 2 * r.servings, unit: 'cas', note: 'pour le trempage' });
        }
      }
      const uniq = [...new Set(pre)].filter((p) => !r.steps.includes(p));
      r.steps = [...uniq, ...r.steps];
      r.restTime = rest;
      addTag(r, 'préparation à l’avance');
    }
    // 7. Oléagineux restants > 30 g : sécurité
    // 8. Poisson cru
    if (analyzeDigestion(r, lookup).issues.some((i) => i.topic === 'securite' && i.level === 'error')) {
      r.steps.unshift('Sécurité : congelez le poisson au moins 24 h à −20 °C avant de le préparer cru (ou achetez-le « qualité sashimi », déjà assaini) — recommandation ANSES contre les parasites.');
    }
    if (JSON.stringify(r) !== before) {
      mod = true;
      changed++;
    }
  }
  if (mod) writeFileSync(join(dir, f), JSON.stringify(data, null, 2) + '\n');
}
console.log('recettes corrigées :', changed);
