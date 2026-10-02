// ─────────────────────────────────────────────────────────────
// Digestibilité, antinutriments et profils alimentaires.
// Règles tirées de la documentation sourcée : docs/sources/
//   antinutriments.md (phytates, lectines, trempage, levain)
//   sensibilites.md   (oxalates, FODMAP, phytoestrogènes)
//   regimes.md        (WAPF, GAPS, Ray Peat, anti-inflammatoire…)
// ─────────────────────────────────────────────────────────────
import type { Ingredient, Recipe, RecipeIngredient } from './types';
import { toGrams } from './units';
import { norm } from './text';
import { MICROS } from './micronutrients';

type Lookup = (id: string) => Ingredient | undefined;

// ── Données par ingrédient ─────────────────────────────────

/** Oxalates, mg pour 100 g (cru sauf mention) — OHF 2024, listes Harvard, J Food Compos Anal 2011 */
export const OXALATE_MG: Record<string, number> = {
  epinard: 750, oseille: 500, rhubarbe: 600, betterave: 70, amande: 435, 'noix-cajou': 175, noisette: 225, noix: 70, pistache: 50, pignons: 200,
  sesame: 400, tahini: 105, cacao: 656, 'chocolat-noir': 250, 'patate-douce': 45, 'pomme-de-terre': 18, 'pomme-de-terre-farineuse': 18,
  sarrasin: 240, 'farine-sarrasin': 240, 'nouilles-sarrasin': 150, quinoa: 90, 'riz-complet': 30, 'flocons-avoine': 10, 'haricots-blancs': 85,
  'haricots-noirs': 12, 'lentilles-vertes': 20, 'lentilles-corail': 20, 'pois-chiches': 17, kiwi: 20, framboise: 38, myrtille: 25, carotte: 20,
  'celeri-branche': 30, 'celeri-rave': 20, poireau: 17, 'haricots-verts': 15, artichaut: 15, aubergine: 18, figue: 15, 'raisins-secs': 30,
  'abricots-secs': 15, persil: 156, curcuma: 1500, cannelle: 1300, poivre: 430, the: 10, miso: 40, 'graines-courge': 15, 'graines-lin': 20,
  'chou-vert': 3, brocoli: 6, 'chou-fleur': 2, courgette: 2, concombre: 4, laitue: 6, champignon: 1, 'riz-blanc': 2, tomate: 5, 'poivron-rouge': 10,
};

/** Préparation traditionnelle exigée (WAPF / Nourishing Traditions, études Larsson & Sandberg, Hurrell…) */
type PrepKind = 'avoine' | 'cereale' | 'riz-complet' | 'quinoa' | 'lentilles' | 'lentilles-corail' | 'galette-sarrasin';
const PREP: Record<string, PrepKind> = {
  'flocons-avoine': 'avoine',
  sarrasin: 'cereale',
  boulgour: 'cereale',
  orge: 'cereale',
  'riz-complet': 'riz-complet',
  quinoa: 'quinoa',
  'lentilles-vertes': 'lentilles',
  'lentilles-corail': 'lentilles-corail',
  'farine-sarrasin': 'galette-sarrasin',
};

/** Oléagineux et graines (phytates, PUFA) */
const NUTS = new Set(['noix', 'noisette', 'amande', 'pistache', 'noix-cajou', 'pignons', 'macadamia', 'graines-courge', 'sesame']);
/** Huiles de graines riches en oméga-6 (PUFA) */
const SEED_OILS = new Set(['huile-colza', 'huile-noix', 'huile-sesame']);
/** Exclus d'office : soja non fermenté (isoflavones), lin (lignanes + PUFA très oxydables) */
const ALWAYS_EXCLUDED: Record<string, string> = {
  edamame: 'Soja non fermenté (isoflavones, inhibiteurs de trypsine) — exclu par l’approche WAPF.',
  'graines-lin': 'Graines de lin : très riches en lignanes (phytoestrogènes, ≈ 300 mg/100 g) et en oméga-3 instables.',
  'huile-colza': 'Huile de graines raffinée (oméga-6 / PUFA) : remplacée par beurre, ghee, graisse animale, huile d’olive ou de coco.',
};

const FERMENTED = new Set(['kefir', 'yaourt-grec', 'yaourt-nature', 'fromage-blanc', 'skyr', 'choucroute', 'kimchi', 'cornichon', 'creme-fraiche', 'miso', 'levain']);
const BROTH = new Set(['bouillon-boeuf', 'bouillon-volaille', 'os-boeuf', 'os-a-moelle', 'pied-veau', 'carcasse-poulet', 'boeuf-queue', 'boeuf-jarret', 'veau-jarret', 'porc-jarret', 'gelatine', 'boeuf-joue']);
const ORGANS = new Set(['foie-volaille', 'foie-veau', 'foie-agneau', 'foie-morue', 'coeur-boeuf', 'coeur-volaille', 'rognon', 'langue-boeuf', 'ris-veau', 'gesiers', 'os-a-moelle', 'tripes', 'foie-gras']);
const LIVER = new Set(['foie-volaille', 'foie-veau', 'foie-agneau', 'foie-gras']);

// ── Détection des préparations dans le texte des étapes ────

const ACID = /(kefir|yaourt|petit lait|lactoserum|babeurre|citron|vinaigre|lait ribot|fromage blanc|skyr)/;
const LONG = /(la veille|une nuit|toute la nuit|nuit|(1[2-9]|2[0-4]|36|48) ?h|12 a 24|douze heures|24 heures)/;
const SOAK = /(tremp|fermente|fermentation|germ)/;
const hours = (t: string): number => {
  let max = 0;
  for (const m of t.matchAll(/(\d+)(?: ?(?:a|-) ?(\d+))? ?h(?:eures?)?\b/g)) max = Math.max(max, Number(m[2] ?? m[1]));
  if (/la veille|une nuit|toute la nuit|la nuit/.test(t)) max = Math.max(max, 10);
  return max;
};

function soakOk(kind: PrepKind, text: string, ids: Set<string>): boolean {
  const t = text;
  const soaked = SOAK.test(t);
  const h = hours(t);
  switch (kind) {
    case 'avoine':
      // ≥ 12 h, milieu acide ET source de phytase (seigle ou sarrasin) — Larsson & Sandberg 1992
      return soaked && (h >= 12 || LONG.test(t)) && ACID.test(t) && (/seigle|sarrasin/.test(t) || ids.has('farine-seigle') || ids.has('farine-sarrasin') || ids.has('sarrasin'));
    case 'cereale':
      return soaked && (h >= 7 || LONG.test(t)) && ACID.test(t);
    case 'riz-complet':
      return soaked && (h >= 12 || LONG.test(t));
    case 'quinoa':
      return soaked && /rinc/.test(t) && (h >= 8 || LONG.test(t));
    case 'lentilles':
      return soaked && (h >= 7 || LONG.test(t));
    case 'lentilles-corail':
      return soaked && h >= 2;
    case 'galette-sarrasin':
      // pâte à galettes reposée / fermentée ≥ 8 h (tradition bretonne) ou trempage de la farine en milieu acide
      return (/repos|fermente|tremp/.test(t) && (h >= 8 || LONG.test(t))) || (soaked && ACID.test(t) && h >= 7);
  }
}

const PREP_HELP: Record<PrepKind, string> = {
  avoine: 'Flocons d’avoine : tremper ≥ 12 h dans de l’eau tiède + 1–2 c. à s. de kéfir/yaourt/citron pour 100 g, avec 10–15 % de farine de seigle ou de sarrasin (l’avoine n’a presque pas de phytase), puis cuire.',
  cereale: 'Sarrasin / boulgour / orge : tremper ≥ 7 h (idéalement 12 h) dans de l’eau tiède acidifiée (1 c. à s. de citron, vinaigre ou kéfir), rincer, puis cuire.',
  'riz-complet': 'Riz complet : tremper 12–24 h au chaud, jeter l’eau, puis cuire (ou utiliser du riz blanc).',
  quinoa: 'Quinoa : rincer énergiquement (saponines) puis tremper ≥ 8 h avec un acide, rincer, cuire.',
  lentilles: 'Lentilles : tremper ≥ 7 h, jeter l’eau, rincer, cuire complètement.',
  'lentilles-corail': 'Lentilles corail : rincer et tremper au moins 2 h, eau jetée.',
  'galette-sarrasin': 'Farine de sarrasin : laisser reposer/fermenter la pâte au moins 8 h (une nuit), ou tremper la farine dans un liquide acidifié.',
};

const CEREAL_NAME: Record<string, string> = { sarrasin: 'le sarrasin', boulgour: 'le boulgour', orge: 'l’orge perlé' };

/** Étape « la veille » à ajouter pour un ingrédient qui demande une préparation traditionnelle */
export function prepStepFor(id: string): { step: string; restMinutes: number } | null {
  const kind = PREP[id];
  if (!kind) return null;
  const text: Record<PrepKind, string> = {
    avoine: 'La veille au soir : faites tremper les flocons d’avoine 12 h (une nuit) dans de l’eau tiède avec 2 c. à soupe de kéfir ou de yaourt et 1 c. à soupe de farine de seigle (sa phytase dégrade les phytates de l’avoine). Égouttez avant de cuire.',
    cereale: `La veille : faites tremper ${CEREAL_NAME[id] ?? 'la céréale'} 12 h (une nuit) dans de l’eau tiède additionnée d’1 c. à soupe de jus de citron ou de vinaigre de cidre. Rincez avant de cuire.`,
    'riz-complet': 'La veille : faites tremper le riz complet 12 à 24 h dans de l’eau tiède, jetez l’eau et rincez avant de cuire.',
    quinoa: 'La veille : rincez énergiquement le quinoa (3 eaux), puis faites-le tremper 12 h (une nuit) avec 1 c. à soupe de jus de citron ; rincez de nouveau avant de cuire.',
    lentilles: 'La veille : faites tremper les lentilles 12 h (une nuit) dans de l’eau tiède, jetez l’eau et rincez avant de cuire.',
    'lentilles-corail': 'Rincez les lentilles corail et laissez-les tremper 2 h dans de l’eau tiède ; jetez l’eau avant de cuire.',
    'galette-sarrasin': 'La veille : préparez la pâte et laissez-la reposer et fermenter une nuit (12 h) à température ambiante, couverte.',
  };
  return { step: text[kind], restMinutes: kind === 'lentilles-corail' ? 120 : 720 };
}

// ── Analyse d'une recette ───────────────────────────────────

export interface DigestIssue {
  level: 'error' | 'warning' | 'info';
  topic: 'phytates' | 'oxalates' | 'pufa' | 'phyto' | 'securite' | 'fodmap' | 'vitamine-a';
  message: string;
}

export interface DigestReport {
  issues: DigestIssue[];
  /** préparations traditionnelles présentes */
  prepared: string[];
  oxalateMg: number; // par portion
  oxalateLevel: 'faible' | 'moyen' | 'eleve' | 'tres-eleve';
  fermented: boolean;
  broth: boolean;
  organs: boolean;
}

function gramsPerPortion(ri: RecipeIngredient, ing: Ingredient, servings: number): number {
  return (toGrams(ri.qty, ri.unit, ing) ?? 0) / Math.max(1, servings);
}

export function analyzeDigestion(recipe: Recipe, lookup: Lookup): DigestReport {
  const text = norm(recipe.steps.join(' ') + ' ' + (recipe.tips ?? '') + ' ' + recipe.ingredients.map((i) => i.note ?? '').join(' '));
  const ids = new Set(recipe.ingredients.map((i) => i.id));
  const issues: DigestIssue[] = [];
  const prepared: string[] = [];
  let ox = 0;
  let calcium = 0;

  for (const ri of recipe.ingredients) {
    const ing = lookup(ri.id);
    if (!ing) continue;
    const g = gramsPerPortion(ri, ing, recipe.servings);
    ox += ((OXALATE_MG[ing.id] ?? 0) * g) / 100;
    calcium += ((MICROS[ing.id]?.ca ?? 0) * g) / 100;

    if (ALWAYS_EXCLUDED[ing.id]) issues.push({ level: 'error', topic: ing.id === 'huile-colza' ? 'pufa' : 'phyto', message: ALWAYS_EXCLUDED[ing.id] });

    const kind = PREP[ing.id];
    if (kind && g >= 5) {
      if (soakOk(kind, text, ids)) prepared.push(`${ing.name} préparé selon la tradition`);
      else issues.push({ level: 'error', topic: 'phytates', message: PREP_HELP[kind] });
    }

    if (NUTS.has(ing.id) && g > 30) {
      if (/tremp/.test(text) && /(sech|deshydrat|torrefi|grill|four)/.test(text)) prepared.push(`${ing.name} trempés puis séchés`);
      else issues.push({ level: 'error', topic: 'phytates', message: `${ing.name} : plus de 30 g par portion — utiliser des oléagineux trempés (eau salée, ≥ 7 h) puis séchés à basse température, ou réduire la quantité.` });
    }

    if (SEED_OILS.has(ing.id) && ing.id !== 'huile-colza') {
      const ml = (toGrams(ri.qty, ri.unit, ing) ?? 0) / (ing.density ?? 0.92) / Math.max(1, recipe.servings);
      if (ml > 5.5) issues.push({ level: 'error', topic: 'pufa', message: `${ing.name} : riche en oméga-6 instables — à réserver à l’assaisonnement, ≤ 1 c. à café par portion, jamais en cuisson.` });
    }

    if (LIVER.has(ing.id) && g > 150) issues.push({ level: 'error', topic: 'vitamine-a', message: 'Foie : ≤ 150 g par portion (vitamine A préformée, limite EFSA 3 000 µg/j).' });
    if (ing.id === 'epinard' && g > 50 && !/(blanch|bouill|eau bouillante|egoutt)/.test(text)) {
      issues.push({ level: 'warning', topic: 'oxalates', message: 'Épinards : les blanchir 2–3 min dans l’eau bouillante et jeter l’eau réduit fortement les oxalates solubles.' });
    }
    if (ing.id === 'polenta') issues.push({ level: 'info', topic: 'phytates', message: 'Maïs non nixtamalisé : niacine peu disponible ; varier avec d’autres féculents.' });
  }

  // Oxalates par portion (seuils : < 10 faible, 10–25 moyen, 26–99 élevé, ≥ 100 très élevé)
  const level = ox >= 100 ? 'tres-eleve' : ox >= 26 ? 'eleve' : ox >= 10 ? 'moyen' : 'faible';
  if (ox > 150) issues.push({ level: 'error', topic: 'oxalates', message: `≈ ${Math.round(ox)} mg d’oxalates par portion : trop élevé (viser < 100 mg par jour).` });
  else if (ox >= 60 && calcium < 300) issues.push({ level: 'warning', topic: 'oxalates', message: `≈ ${Math.round(ox)} mg d’oxalates par portion avec peu de calcium (${Math.round(calcium)} mg) : ajouter un laitage ou un fromage au repas, et ne pas en faire un plat quotidien.` });
  else if (ox >= 60) issues.push({ level: 'info', topic: 'oxalates', message: `≈ ${Math.round(ox)} mg d’oxalates par portion, compensés en partie par ${Math.round(calcium)} mg de calcium dans le plat.` });

  // Sécurité des préparations crues
  const rawFish = (recipe.technique === 'cru' || recipe.technique === 'sans-cuisson') && recipe.ingredients.some((ri) => ['saumon', 'thon', 'bar', 'cabillaud', 'maquereau', 'sardine', 'truite', 'saint-jacques', 'daurade'].includes(ri.id));
  if (rawFish && !/congel/.test(text)) issues.push({ level: 'error', topic: 'securite', message: 'Poisson cru : le congeler à −20 °C pendant au moins 24 h (parasites, recommandation ANSES) ou l’acheter qualité sashimi assaini.' });

  return {
    issues,
    prepared,
    oxalateMg: Math.round(ox),
    oxalateLevel: level,
    fermented: recipe.ingredients.some((i) => FERMENTED.has(i.id)) || /ferment|levain/.test(text),
    broth: recipe.ingredients.some((i) => BROTH.has(i.id)),
    organs: recipe.ingredients.some((i) => ORGANS.has(i.id)),
  };
}

// ── Profils alimentaires sélectionnables ────────────────────

export type DietProfileId = 'wapf' | 'anti-inflammatoire' | 'peat' | 'gaps' | 'low-fodmap' | 'pauvre-oxalates' | 'phyto-prudent' | 'primal';

export interface DietProfileDef {
  id: DietProfileId;
  label: string;
  emoji: string;
  description: string;
  warning?: string;
  /** ingrédients exclus */
  exclude: string[];
  /** limites par portion (g ou ml) */
  limits?: Record<string, number>;
  /** règle supplémentaire */
  check?: (r: Recipe, lookup: Lookup, d: DigestReport) => string | null;
}

const GRAINS = ['riz-blanc', 'riz-rond', 'riz-complet', 'pates', 'pates-fraiches', 'gnocchi', 'nouilles-riz', 'nouilles-sarrasin', 'udon', 'semoule', 'boulgour', 'quinoa', 'sarrasin', 'farine-sarrasin', 'crozets', 'flocons-avoine', 'polenta', 'orge', 'mais', 'mais-a-eclater', 'tortilla-mais', 'pain-seigle', 'pain-levain', 'pain-pita', 'farine', 'farine-seigle', 'farine-riz', 'fecule-mais', 'panure', 'levain'];
const STARCHES = ['pomme-de-terre', 'pomme-de-terre-farineuse', 'patate-douce', 'panais', 'chataigne', 'creme-marrons', 'plantain', 'manioc', 'topinambour'];
const LEGUMES = ['pois-chiches', 'haricots-blancs', 'haricots-noirs', 'lentilles-vertes', 'lentilles-corail', 'feves', 'edamame'];
const FATTY_FISH = ['saumon', 'saumon-fume', 'truite', 'maquereau', 'maquereau-fume', 'maquereau-conserve', 'sardine', 'sardine-conserve', 'hareng', 'oeufs-poisson', 'thon', 'thon-conserve'];

export const DIET_PROFILES: DietProfileDef[] = [
  {
    id: 'wapf',
    label: 'Traditionnel (Weston A. Price)',
    emoji: '🧈',
    description: 'Graisses animales, abats, bouillons d’os, fermentés, laitages traditionnels ; céréales, légumineuses et oléagineux trempés ou fermentés ; pas d’huiles de graines ni de soja non fermenté. Profil par défaut.',
    exclude: ['huile-colza', 'edamame', 'graines-lin'],
  },
  {
    id: 'anti-inflammatoire',
    label: 'Anti-inflammatoire',
    emoji: '🫒',
    description: 'Huile d’olive, poissons gras, légumes et fruits colorés, épices ; peu de charcuteries, de sucres ajoutés et de cuissons à très haute température.',
    exclude: ['huile-colza', 'graines-lin'],
    limits: { sucre: 15, miel: 15, 'sirop-erable': 15, confiture: 15, lardons: 50, bacon: 50, chorizo: 50, 'saucisson-sec': 50, merguez: 80 },
    check: (r) => (r.technique === 'friture-legere' ? 'friture' : null),
  },
  {
    id: 'peat',
    label: 'Inspiré Ray Peat',
    emoji: '🍊',
    description: 'Laitages, fruits mûrs, jus d’orange, miel, pommes de terre, gélatine et bouillons, coquillages, foie hebdomadaire ; pas d’huiles de graines, d’oléagineux, de légumineuses ni de céréales complètes ; poissons gras limités.',
    warning: 'Approche peu étudiée scientifiquement ; elle contredit les recommandations habituelles sur les poissons gras et les fibres.',
    exclude: ['huile-colza', 'huile-noix', 'huile-sesame', 'graines-lin', 'graines-courge', 'sesame', 'tahini', 'noix', 'noisette', 'amande', 'pistache', 'noix-cajou', 'pignons', 'foie-morue', ...LEGUMES, 'boulgour', 'quinoa', 'orge', 'riz-complet', 'flocons-avoine'],
    limits: { macadamia: 15, ...Object.fromEntries(FATTY_FISH.map((f) => [f, 0.001])) },
  },
  {
    id: 'gaps',
    label: 'GAPS (régime complet)',
    emoji: '🥣',
    description: 'Bouillons maison, viandes, poissons, œufs, légumes cuits, fermentés maison, fromages affinés ; ni céréales, ni féculents, ni sucres (hors miel), ni laitages frais.',
    warning: 'Régime très restrictif aux preuves faibles ; risque de perte de poids — surveillez les calories.',
    exclude: [...GRAINS, ...STARCHES, 'sucre', 'sirop-erable', 'confiture', 'chocolat-noir', 'cacao', 'mirin', 'sauce-soja', 'miso', 'gochujang', 'edamame', 'pois-chiches', 'haricots-noirs', 'feves', 'petits-pois', 'lait', 'creme-liquide', 'mascarpone', 'ricotta', 'cottage', 'mozzarella', 'feta', 'halloumi', 'paneer', 'fromage-frais-chevre', 'biere', 'cidre', 'pate-curry'],
    limits: { miel: 20, 'haricots-blancs': 80, 'lentilles-vertes': 80, 'lentilles-corail': 80 },
    check: (r) => (r.technique === 'friture-legere' ? 'friture' : null),
  },
  {
    id: 'low-fodmap',
    label: 'Pauvre en FODMAP (ail et oignon tolérés)',
    emoji: '🌿',
    description: 'Phase d’élimination (2 à 6 semaines) : ni blé, seigle, orge, légumineuses, lactose, fruits riches en fructose ou polyols ; ail et oignon autorisés pour ce foyer.',
    warning: 'Phase d’élimination temporaire, puis réintroduction progressive (Monash University).',
    exclude: ['pates', 'pates-fraiches', 'udon', 'semoule', 'boulgour', 'crozets', 'pain-pita', 'pain-seigle', 'farine', 'farine-seigle', 'orge', 'panure', 'pois-chiches', 'haricots-blancs', 'haricots-noirs', 'lentilles-vertes', 'feves', 'lait', 'creme-liquide', 'fromage-blanc', 'ricotta', 'cottage', 'pomme', 'poire', 'mangue', 'pasteque', 'cerise', 'figue', 'peche', 'nectarine', 'prune', 'pruneaux', 'abricot', 'abricots-secs', 'datte', 'raisins-secs', 'chou-fleur', 'champignon', 'asperge', 'artichaut', 'topinambour', 'petits-pois', 'miel', 'noix-cajou', 'pistache', 'kimchi'],
    limits: { 'pain-levain': 70, 'patate-douce': 75, 'courge-butternut': 60, avocat: 30, 'flocons-avoine': 50, 'lentilles-corail': 45, choucroute: 40, 'celeri-branche': 10 },
  },
  {
    id: 'pauvre-oxalates',
    label: 'Pauvre en oxalates',
    emoji: '💎',
    description: 'Moins de 100 mg d’oxalates par jour : pas d’épinards, oseille, rhubarbe, betterave, amandes, cajou, cacao, sarrasin, sésame, quinoa ; laitages riches en calcium aux repas.',
    exclude: ['epinard', 'oseille', 'rhubarbe', 'betterave', 'amande', 'noix-cajou', 'cacao', 'chocolat-noir', 'sarrasin', 'farine-sarrasin', 'nouilles-sarrasin', 'sesame', 'tahini', 'quinoa', 'miso', 'edamame'],
    limits: { 'patate-douce': 100, 'pomme-de-terre': 200, noisette: 15, pistache: 15, pignons: 15, noix: 15 },
    check: (_r, _l, d) => (d.oxalateMg > 40 ? `≈ ${d.oxalateMg} mg d’oxalates par portion` : null),
  },
  {
    id: 'phyto-prudent',
    label: 'Prudent en phytoestrogènes',
    emoji: '⚖️',
    description: 'Pas de soja non fermenté ni de lin ; légumineuses avec modération ; houblon (bière) évité.',
    exclude: ['edamame', 'graines-lin', 'biere'],
    limits: { 'pois-chiches': 60, 'haricots-blancs': 60, 'haricots-noirs': 60, 'lentilles-vertes': 60, miso: 15 },
  },
  {
    id: 'primal',
    label: 'Primal Blueprint (adapté prise de masse)',
    emoji: '🦴',
    description: 'Viandes, poissons, œufs, légumes, laitages entiers ; pas de céréales à gluten ni de sucre ; riz, pommes de terre et patates douces autorisés pour l’énergie.',
    exclude: ['pates', 'pates-fraiches', 'pain-seigle', 'pain-levain', 'pain-pita', 'semoule', 'boulgour', 'crozets', 'farine', 'farine-seigle', 'orge', 'udon', 'panure', 'sucre', 'huile-colza'],
  },
];

export interface Compatibility {
  ok: boolean;
  reasons: string[];
}

/** Compatibilité d'une recette avec un profil (exclusions, limites par portion, règle propre) */
export function compatibility(recipe: Recipe, profile: DietProfileDef, lookup: Lookup, digest?: DigestReport): Compatibility {
  const reasons: string[] = [];
  const excl = new Set(profile.exclude);
  for (const ri of recipe.ingredients) {
    if (ri.optional) continue;
    const ing = lookup(ri.id);
    if (!ing) continue;
    if (excl.has(ri.id)) reasons.push(`contient ${ing.name}`);
    const lim = profile.limits?.[ri.id];
    if (lim != null) {
      const g = gramsPerPortion(ri, ing, recipe.servings);
      if (g > lim) reasons.push(lim < 1 ? `${ing.name} (limité dans ce profil)` : `${ing.name} > ${lim} g par portion`);
    }
  }
  const extra = profile.check?.(recipe, lookup, digest ?? analyzeDigestion(recipe, lookup));
  if (extra) reasons.push(extra);
  return { ok: reasons.length === 0, reasons };
}

export const DIET_BY_ID: Record<DietProfileId, DietProfileDef> = Object.fromEntries(DIET_PROFILES.map((p) => [p.id, p])) as Record<DietProfileId, DietProfileDef>;
