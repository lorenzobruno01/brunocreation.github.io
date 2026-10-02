// ─────────────────────────────────────────────────────────────
// Créateur de recettes intégré (gratuit, sans IA) : à partir
// d'ingrédients imposés, compose un repas complet et équilibré
// (protéine + féculent + légumes + matière grasse + aromates)
// avec des étapes précises selon la nature de chaque ingrédient.
// ─────────────────────────────────────────────────────────────
import type { Ingredient, MealType, Recipe, RecipeIngredient, Season, Technique } from './types';
import type { IngQuery } from './ingredientQuery';
import { currentSeason } from './season';
import { slugify } from './text';
import { prepStepFor } from './digestion';

type Lookup = (id: string) => Ingredient | undefined;

const BRAISE = new Set(['boeuf-paleron', 'boeuf-joue', 'boeuf-plat-de-cote', 'boeuf-queue', 'boeuf-jarret', 'veau-epaule', 'veau-jarret', 'agneau-epaule', 'agneau-souris', 'porc-echine', 'porc-jarret', 'porc-travers', 'porc-demi-sel', 'canard-cuisse', 'dinde-cuisse', 'lapin', 'gibier', 'langue-boeuf', 'tripes', 'coeur-boeuf']);
const ROAST = new Set(['poulet-entier', 'pintade', 'agneau-gigot', 'boeuf-rosbif', 'porc-fume', 'poulet-cuisse']);
const MINCED = new Set(['boeuf-hache', 'veau-hache', 'agneau-hache', 'porc-hache', 'dinde-hachee']);
const SAUSAGE = new Set(['saucisse-toulouse', 'saucisse-morteau', 'merguez', 'boudin-noir', 'boudin-blanc', 'chorizo', 'andouillette']);
const SHELL = new Set(['moule', 'palourde', 'huitre']);

const STARCH_DEFAULT: Record<string, string> = {
  poisson: 'pomme-de-terre',
  'fruits-de-mer': 'riz-blanc',
  braise: 'pomme-de-terre',
  roast: 'pomme-de-terre',
  viande: 'riz-blanc',
  oeufs: 'pomme-de-terre',
  abats: 'pomme-de-terre',
  minced: 'pates',
};

const VEG_BY_SEASON: Record<Season, string[]> = {
  printemps: ['asperge', 'petits-pois', 'carotte'],
  ete: ['courgette', 'tomate', 'haricots-verts'],
  automne: ['courge-butternut', 'champignon', 'brocoli'],
  hiver: ['poireau', 'carotte', 'chou-vert'],
};

interface Parts {
  protein?: Ingredient;
  starch?: Ingredient;
  vegs: Ingredient[];
  dairy?: Ingredient;
  extras: Ingredient[];
}

function pick(option: { ids: string[] }, lookup: Lookup, prefer: Set<string>): Ingredient | undefined {
  const ids = option.ids.filter((id) => lookup(id));
  const fav = ids.find((id) => prefer.has(id));
  // pour une famille (« bœuf »), on privilégie une pièce polyvalente
  const pref = ['boeuf-steak', 'agneau-cotelette', 'porc-filet-mignon', 'poulet-haut-cuisse-desosse', 'veau-escalope', 'saumon', 'cabillaud', 'oeuf', 'comte', 'crevette'].find((p) => ids.includes(p));
  return lookup(fav ?? pref ?? ids[0]);
}

function isProtein(i: Ingredient) {
  return !!i.protein_group && ['viande', 'volaille', 'abats', 'poisson', 'fruits-de-mer', 'oeufs'].includes(i.category);
}

function kindOf(p: Ingredient): string {
  if (MINCED.has(p.id)) return 'minced';
  if (BRAISE.has(p.id)) return 'braise';
  if (ROAST.has(p.id)) return 'roast';
  if (p.category === 'poisson') return 'poisson';
  if (p.category === 'fruits-de-mer') return 'fruits-de-mer';
  if (p.category === 'oeufs') return 'oeufs';
  if (p.category === 'abats') return 'abats';
  return 'viande';
}

/** Quantité par personne (dans l'unité choisie) */
function proteinLine(p: Ingredient, n: number): RecipeIngredient {
  if (p.unit === 'piece' && p.category === 'oeufs') return { id: p.id, qty: 3 * n, unit: 'piece' };
  if (SHELL.has(p.id)) return { id: p.id, qty: 500 * n, unit: 'g', note: 'avec coquilles' };
  if (ROAST.has(p.id) && p.id !== 'poulet-cuisse') return { id: p.id, qty: Math.max(900, 400 * n), unit: 'g' };
  if (p.id === 'poulet-cuisse') return { id: p.id, qty: n, unit: 'piece' };
  if (p.category === 'abats' && p.id.startsWith('foie')) return { id: p.id, qty: 150 * n, unit: 'g' };
  if (p.category === 'poisson') return { id: p.id, qty: 190 * n, unit: 'g' };
  if (p.category === 'fruits-de-mer') return { id: p.id, qty: 220 * n, unit: 'g' };
  if (SAUSAGE.has(p.id)) return { id: p.id, qty: 180 * n, unit: 'g' };
  if (p.category === 'laitier') return { id: p.id, qty: 100 * n, unit: 'g' };
  return { id: p.id, qty: 210 * n, unit: 'g' };
}

function starchLine(s: Ingredient, n: number): RecipeIngredient {
  switch (s.id) {
    case 'pomme-de-terre':
    case 'pomme-de-terre-farineuse':
    case 'patate-douce':
      return { id: s.id, qty: 320 * n, unit: 'g', note: 'bien lavées, avec la peau' };
    case 'pain-seigle':
    case 'pain-levain':
      return { id: s.id, qty: 110 * n, unit: 'g' };
    case 'gnocchi':
      return { id: s.id, qty: 250 * n, unit: 'g' };
    case 'chataigne':
      return { id: s.id, qty: 200 * n, unit: 'g' };
    case 'pates-fraiches':
      return { id: s.id, qty: 150 * n, unit: 'g' };
    default:
      return { id: s.id, qty: 95 * n, unit: 'g', note: 'poids cru' };
  }
}

function starchSteps(s: Ingredient): { pre: string[]; time: number; phrase: string } {
  switch (s.id) {
    case 'pomme-de-terre':
    case 'pomme-de-terre-farineuse':
      return { pre: ['Coupez les pommes de terre en quartiers (sans les éplucher), mettez-les dans une casserole d’eau froide salée, portez à ébullition et cuisez 18 à 20 min : la pointe d’un couteau doit s’enfoncer sans résistance. Égouttez, ajoutez une noix de beurre et du persil.'], time: 25, phrase: 'pommes de terre persillées' };
    case 'patate-douce':
      return { pre: ['Préchauffez le four à 210 °C. Coupez les patates douces en gros cubes, mélangez-les avec 1 c. à soupe d’huile d’olive, du sel et du paprika, étalez-les sur une plaque et rôtissez 30 min en les retournant à mi-cuisson : elles doivent être dorées sur les bords.'], time: 35, phrase: 'patates douces rôties' };
    case 'riz-blanc':
    case 'riz-rond':
    case 'riz-complet':
      return { pre: [`Rincez le riz, versez-le dans 1,5 fois son volume d’eau bouillante salée, couvrez et cuisez à feu doux ${s.id === 'riz-complet' ? '35' : '12'} min, puis laissez reposer 5 min hors du feu, couvercle fermé.`], time: s.id === 'riz-complet' ? 40 : 18, phrase: 'riz' };
    case 'pates':
      return { pre: ['Faites cuire les pâtes dans un grand volume d’eau bouillante salée selon le temps indiqué sur le paquet (en général 9 à 11 min), al dente. Gardez une louche d’eau de cuisson.'], time: 15, phrase: 'pâtes' };
    case 'pates-fraiches':
      return { pre: ['Faites cuire les pâtes fraîches 3 min dans l’eau bouillante salée et égouttez-les.'], time: 6, phrase: 'pâtes fraîches' };
    case 'semoule':
      return { pre: ['Versez la semoule dans un saladier, ajoutez le même volume d’eau bouillante salée et une noix de beurre, couvrez 5 min puis égrainez à la fourchette.'], time: 8, phrase: 'semoule' };
    case 'boulgour':
    case 'quinoa':
    case 'sarrasin':
    case 'orge':
      return { pre: [`Rincez ${s.name}, puis cuisez-le dans 2 fois son volume d’eau salée à frémissement, 12 à 15 min (25 min pour l’orge), jusqu’à absorption. Laissez gonfler 5 min à couvert.`], time: 20, phrase: s.name };
    case 'polenta':
      return { pre: ['Portez 4 fois le volume de polenta en eau (ou moitié lait) à ébullition salée, versez la polenta en pluie en fouettant et cuisez 5 min à feu doux en remuant ; ajoutez une noix de beurre.'], time: 10, phrase: 'polenta crémeuse' };
    case 'pain-seigle':
    case 'pain-levain':
      return { pre: [`Coupez ${s.name} en tranches et faites-les griller 2 à 3 min.`], time: 3, phrase: `${s.name} grillé` };
    case 'gnocchi':
      return { pre: ['Plongez les gnocchis dans l’eau bouillante salée et retirez-les à l’écumoire dès qu’ils remontent à la surface (2 à 3 min).'], time: 5, phrase: 'gnocchis' };
    case 'chataigne':
      return { pre: ['Faites revenir les châtaignes cuites 6 min dans une noix de beurre à feu moyen, jusqu’à ce qu’elles soient brillantes et chaudes.'], time: 8, phrase: 'châtaignes rissolées' };
    default:
      return { pre: [`Faites cuire ${s.name} dans l’eau bouillante salée selon les indications du paquet.`], time: 15, phrase: s.name };
  }
}

function vegStep(vegs: Ingredient[]): { step: string; time: number } {
  if (!vegs.length) return { step: '', time: 0 };
  const names = vegs.map((v) => v.plural ?? v.name).join(' et ');
  const raw = vegs.every((v) => ['laitue', 'mache', 'roquette', 'concombre', 'tomate-cerise', 'avocat', 'radis', 'endive'].includes(v.id) || v.category === 'fruit');
  if (raw)
    return { step: `Préparez ${names} en salade : lavez, taillez, et assaisonnez au dernier moment avec 1 c. à soupe d’huile d’olive, 1 c. à café de vinaigre de cidre, sel et poivre.`, time: 5 };
  return {
    step: `Pendant ce temps, taillez ${names} en morceaux de taille régulière. Faites-les sauter 8 à 10 min dans une poêle avec une noix de beurre et 1 gousse d’ail écrasée, à feu moyen-vif, en remuant : ils doivent être tendres mais encore légèrement croquants. Salez, poivrez.`,
    time: 12,
  };
}

function proteinSteps(p: Ingredient, kind: string, dairy?: Ingredient): { steps: string[]; time: number; technique: Technique; phrase: string } {
  const name = p.name;
  switch (kind) {
    case 'braise':
      return {
        technique: 'mijote',
        time: 140,
        phrase: 'mijoté(e) au thym',
        steps: [
          `Coupez ${name} en gros morceaux (5 cm), épongez-les et salez. Dans une cocotte en fonte, faites-les dorer 8 min à feu vif dans 20 g de beurre ou de graisse, en plusieurs fois.`,
          'Ajoutez l’oignon émincé et les carottes coupées en tronçons, faites revenir 5 min. Mouillez à hauteur avec le bouillon, ajoutez le thym et le laurier.',
          'Couvrez et laissez mijoter 2 h à feu très doux (ou au four à 150 °C) : la viande doit se défaire à la fourchette. Retirez le couvercle les 15 dernières minutes pour réduire la sauce.',
        ],
      };
    case 'roast':
      return {
        technique: 'roti',
        time: 75,
        phrase: 'rôti(e) au four',
        steps: [
          `Préchauffez le four à 200 °C. Sortez ${name} du réfrigérateur 30 min avant. Badigeonnez-le de beurre mou, salez, poivrez, glissez le thym et l’ail en chemise autour.`,
          'Enfournez 60 à 70 min (compter 20 min par 500 g pour une volaille, 15 min par 500 g pour un gigot rosé), en arrosant de jus toutes les 20 min. Une volaille est cuite quand le jus qui s’écoule de la cuisse est clair.',
          'Laissez reposer 10 min sous une feuille de papier cuisson avant de découper, et déglacez le plat avec 5 cl d’eau pour récupérer le jus.',
        ],
      };
    case 'minced':
      return {
        technique: 'poele',
        time: 20,
        phrase: 'en boulettes à la tomate',
        steps: [
          `Mélangez ${name} avec l’œuf, l’oignon finement haché, le persil, sel et poivre. Formez des boulettes de la taille d’une noix (mains mouillées).`,
          'Faites-les dorer 6 min dans 1 c. à soupe d’huile d’olive à feu moyen-vif, en les roulant. Ajoutez les tomates concassées, couvrez et laissez mijoter 12 min à feu doux.',
        ],
      };
    case 'poisson':
      return {
        technique: 'poele',
        time: 10,
        phrase: 'poêlé(e) au beurre citronné',
        steps: [
          `Épongez ${name}, salez-le. Faites chauffer 20 g de beurre dans une poêle à feu moyen-vif ; quand il mousse, déposez le poisson côté peau (ou côté présentation) et cuisez 4 min sans le bouger, puis retournez et cuisez 2 à 3 min : la chair doit être nacrée à cœur et se détacher en lamelles.`,
          'Hors du feu, arrosez du jus d’un demi-citron et du beurre de cuisson, parsemez d’aneth ou de persil.',
        ],
      };
    case 'fruits-de-mer':
      return SHELL.has(p.id)
        ? {
            technique: 'vapeur',
            time: 10,
            phrase: 'marinières',
            steps: [
              `Grattez et rincez ${name} à l’eau froide, jetez celles qui restent ouvertes. Dans une grande cocotte, faites suer l’échalote émincée 2 min dans 20 g de beurre, versez 10 cl de vin blanc, ajoutez les coquillages, couvrez et cuisez 5 à 6 min à feu vif en secouant : elles doivent être toutes ouvertes.`,
              dairy ? `Ajoutez ${dairy.name} et le persil, mélangez 1 min.` : 'Parsemez de persil haché et servez avec le jus.',
            ],
          }
        : {
            technique: 'poele',
            time: 8,
            phrase: 'sautés à l’ail',
            steps: [`Faites sauter ${name} 3 à 4 min à feu vif dans 1 c. à soupe d’huile d’olive avec 2 gousses d’ail émincées, jusqu’à ce qu’ils soient opaques et légèrement dorés. Ajoutez le persil et un filet de citron.`],
          };
    case 'oeufs':
      return {
        technique: 'four',
        time: 25,
        phrase: 'en frittata',
        steps: [
          'Préchauffez le four à 190 °C. Battez les œufs avec sel, poivre et la moitié du fromage râpé (ou un peu de lait).',
          'Dans une poêle allant au four, répartissez les légumes cuits et le féculent coupé en dés, versez les œufs battus, parsemez du reste de fromage. Cuisez 3 min sur le feu, puis 15 min au four : le centre doit être pris et le dessus doré.',
        ],
      };
    case 'abats':
      return {
        technique: 'poele',
        time: 8,
        phrase: 'en persillade',
        steps: [
          `Coupez ${name} en tranches de 1,5 cm (ou en morceaux), épongez-les. Faites chauffer 20 g de beurre à feu vif et saisissez 2 min par face : l’intérieur doit rester rosé (le foie trop cuit devient sec).`,
          'Hors du feu, ajoutez 1 gousse d’ail hachée, le persil et un trait de vinaigre de cidre, salez, poivrez.',
        ],
      };
    default:
      return {
        technique: 'poele',
        time: 12,
        phrase: 'à la poêle',
        steps: [
          `Sortez ${name} du réfrigérateur 20 min avant. Épongez, salez. Saisissez dans 15 g de beurre et 1 c. à café d’huile à feu vif : 2 à 3 min par face pour une pièce de bœuf de 2 cm (saignant), 4 à 5 min par face pour une volaille ou du porc (le jus doit être clair).`,
          'Laissez reposer 3 min sur une planche. Déglacez la poêle avec 5 cl d’eau ou de bouillon et 1 c. à café de moutarde, grattez les sucs et nappez la viande.',
        ],
      };
  }
}

/** Compose une recette respectant la requête (un ingrédient choisi par groupe « OU ») */
export function composeRecipe(q: IngQuery, lookup: Lookup, opts: { meal?: MealType | null; servings?: number; available?: Set<string>; existingNames?: Set<string> } = {}): Recipe | null {
  if (!q.groups.length) return null;
  const n = opts.servings ?? 2;
  const prefer = opts.available ?? new Set<string>();
  const excluded = new Set(q.exclude.flatMap((o) => o.ids));
  const chosen = q.groups.map((g) => pick(g.find((o) => o.ids.some((id) => prefer.has(id))) ?? g[0], lookup, prefer)).filter(Boolean) as Ingredient[];
  const parts: Parts = { vegs: [], extras: [] };
  for (const i of chosen) {
    if (isProtein(i) && !parts.protein) parts.protein = i;
    else if (i.category === 'feculent' && !parts.starch) parts.starch = i;
    else if ((i.category === 'legume' || i.category === 'fruit') && !['oignon', 'ail', 'echalote'].includes(i.id)) parts.vegs.push(i);
    else if (i.category === 'laitier' && !parts.dairy) parts.dairy = i;
    else parts.extras.push(i);
  }
  // Compléter le repas
  if (!parts.protein) parts.protein = parts.dairy && ['feta', 'halloumi', 'paneer'].includes(parts.dairy.id) ? parts.dairy : lookup('oeuf');
  const kind = kindOf(parts.protein!);
  if (!parts.starch) {
    const d = lookup(STARCH_DEFAULT[kind] ?? 'pomme-de-terre');
    parts.starch = d && !excluded.has(d.id) ? d : lookup('riz-blanc');
  }
  if (!parts.vegs.length) {
    const v = VEG_BY_SEASON[currentSeason()].map(lookup).find((x) => x && !excluded.has(x.id));
    if (v) parts.vegs.push(v);
  }
  if (kind === 'oeufs' && !parts.dairy) parts.dairy = lookup('comte');

  const p = parts.protein!;
  const s = parts.starch!;
  const ps = proteinSteps(p, kind, parts.dairy);
  const ss = starchSteps(s);
  const vs = vegStep(parts.vegs);

  const ing: RecipeIngredient[] = [proteinLine(p, n)];
  const add = (id: string, qty: number, unit: RecipeIngredient['unit'], note?: string) => {
    if (excluded.has(id) || ing.some((x) => x.id === id) || !lookup(id)) return;
    ing.push({ id, qty, unit, ...(note ? { note } : {}) });
  };
  add(s.id, starchLine(s, n).qty, starchLine(s, n).unit, starchLine(s, n).note);
  for (const v of parts.vegs) {
    const grams = Math.round((220 * n) / parts.vegs.length);
    const usePiece = v.pieceWeight && v.pieceWeight >= 80 && v.pieceWeight <= 400;
    add(v.id, usePiece ? Math.max(1, Math.round(grams / v.pieceWeight!)) : grams, usePiece ? 'piece' : 'g');
  }
  if (parts.dairy && parts.dairy.id !== p.id) add(parts.dairy.id, kind === 'oeufs' ? 40 * n : 30 * n, 'g', 'râpé ou émietté');
  for (const e of parts.extras) add(e.id, e.unit === 'piece' ? 1 : 30, e.unit === 'piece' ? 'piece' : 'g');
  if (kind === 'braise') {
    add('oignon', 1, 'piece', 'émincé');
    add('carotte', 2, 'piece');
    add('bouillon-boeuf', 400, 'ml');
    add('laurier', 1, 'feuille');
  }
  if (kind === 'minced') {
    add('oeuf', 1, 'piece');
    add('oignon', 1, 'piece');
    add('tomates-concassees', 400, 'g');
  }
  if (kind === 'fruits-de-mer' && SHELL.has(p.id)) {
    add('echalote', 2, 'piece');
    add('vin-blanc', 100, 'ml');
  }
  if (kind === 'poisson' || kind === 'fruits-de-mer') add('citron', 1, 'piece');
  add('beurre', 30, 'g');
  add('huile-olive', 1, 'cas');
  add('ail', 2, 'gousse');
  add('persil', 10, 'g');
  if (kind === 'braise' || kind === 'roast') add('thym', 3, 'brin');
  add('sel', 1, 'au-gout');
  add('poivre', 1, 'au-gout');

  // Préparations traditionnelles (trempage la veille) pour céréales et légumineuses
  const preps = ing.map((x) => prepStepFor(x.id)).filter(Boolean) as Array<{ step: string; restMinutes: number }>;
  const restTime = preps.length ? Math.max(...preps.map((p) => p.restMinutes)) : undefined;
  if (preps.length && ing.some((x) => x.id === 'flocons-avoine')) add('farine-seigle', 15, 'g', 'pour le trempage');
  const steps = [
    ...preps.map((p) => p.step),
    'Sortez et pesez tous les ingrédients. Lavez les légumes.',
    ...(kind === 'oeufs' ? [...ss.pre, vs.step, ...ps.steps] : kind === 'braise' || kind === 'roast' ? [...ps.steps, `Pendant la dernière demi-heure de cuisson : ${ss.pre[0].charAt(0).toLowerCase()}${ss.pre[0].slice(1)}`, vs.step] : [...ss.pre, vs.step, ...ps.steps]),
    'Dressez dans des assiettes chaudes : le féculent, les légumes, puis la protéine nappée de son jus. Rectifiez l’assaisonnement.',
  ].filter(Boolean);

  const vegPhrase = parts.vegs.map((v) => v.name).join(' et ');
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  let name = `${cap(p.name)} ${ps.phrase}, ${ss.phrase}${vegPhrase ? ` et ${vegPhrase}` : ''}`;
  if (opts.existingNames?.has(name.toLowerCase())) name += ' (version maison)';
  const time = kind === 'braise' || kind === 'roast' ? ps.time : Math.max(ps.time, ss.time) + vs.time / 2;
  const meal = opts.meal && opts.meal !== 'dessert' && opts.meal !== 'collation' ? opts.meal : null;
  return {
    id: `maison-${slugify(name).slice(0, 50)}-${Date.now().toString(36).slice(-4)}`,
    name,
    description: `Recette composée automatiquement autour de vos ingrédients : ${chosen.map((c) => c.name).join(', ')}. Un repas complet et équilibré (protéine, féculent, légumes).`,
    emoji: p.emoji ?? '🍽️',
    category: meal === 'petit-dejeuner' ? 'petit-dejeuner' : kind === 'braise' ? 'mijote' : 'plat',
    mealTypes: meal ? [meal] : ['dejeuner', 'diner'],
    cuisine: 'francaise',
    prepTime: 15,
    cookTime: Math.round(time),
    ...(restTime ? { restTime } : {}),
    difficulty: kind === 'roast' || kind === 'braise' ? 'facile' : 'tres-facile',
    servings: n,
    ingredients: ing,
    steps,
    tags: [...(restTime && restTime >= 360 ? ['préparation à l’avance'] : []), ...(time + 15 <= 30 ? ['rapide'] : []), ...(kind === 'braise' ? ['mijoté', 'week-end'] : []), 'riche en protéines', 'création maison'],
    seasons: [],
    technique: ps.technique,
    flavors: kind === 'poisson' || kind === 'fruits-de-mer' ? ['iode', 'frais'] : kind === 'braise' ? ['reconfortant', 'umami'] : ['umami'],
    source: 'user',
    createdAt: new Date().toISOString(),
  };
}
