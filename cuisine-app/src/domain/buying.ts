// ─────────────────────────────────────────────────────────────
// Assistant d'achat : comment bien choisir chaque aliment (labels,
// mode d'élevage, morceaux), où l'acheter, et quels morceaux sont
// les plus nutritifs (calculé à partir des données USDA de l'appli).
// Sources : docs/sources/acheter.md
// ─────────────────────────────────────────────────────────────
import type { Ingredient } from './types';
import { MICROS, NUTRIENTS } from './micronutrients';

/** Types de commerces, avec leur recherche OpenStreetMap */
export type ShopKind = 'boucherie' | 'volailler' | 'poissonnerie' | 'fromagerie' | 'ferme' | 'marche' | 'primeur' | 'bio' | 'supermarche';

export const SHOPS: Record<ShopKind, { label: string; one: string; emoji: string; osm: string[]; why: string }> = {
  boucherie: {
    one: 'Boucherie',
    label: 'Boucheries',
    emoji: '🔪',
    osm: ['shop=butcher'],
    why: 'Demandez la race, l’origine et l’alimentation (herbe, foin). Le boucher hache la viande devant vous, garde les abats, les os à moelle et les os pour bouillon.',
  },
  volailler: { one: 'Volailler', label: 'Volaillers', emoji: '🐔', osm: ['shop=poultry'], why: 'Volailles fermières entières, foies, cœurs, gésiers et carcasses pour bouillon.' },
  poissonnerie: {
    one: 'Poissonnerie',
    label: 'Poissonneries',
    emoji: '🐟',
    osm: ['shop=seafood', 'shop=fish'],
    why: 'Poissons entiers de petite pêche (sardines, maquereaux, harengs), coquillages vivants ; demandez la zone de pêche et la date d’arrivage.',
  },
  fromagerie: { one: 'Fromagerie', label: 'Fromageries & crémeries', emoji: '🧀', osm: ['shop=cheese', 'shop=dairy'], why: 'Fromages au lait cru AOP, beurre cru, crème crue, lait entier non homogénéisé.' },
  ferme: {
    one: 'Vente à la ferme',
    label: 'Vente à la ferme',
    emoji: '🚜',
    osm: ['shop=farm'],
    why: 'Viande d’animaux élevés à l’herbe, œufs de poules au pâturage, lait cru : vous voyez l’élevage et pouvez poser toutes vos questions.',
  },
  marche: { one: 'Marché', label: 'Marchés', emoji: '🧺', osm: ['amenity=marketplace'], why: 'Producteurs locaux de saison ; repérez les étals « producteur » (et non « revendeur »).' },
  primeur: { one: 'Primeur', label: 'Primeurs', emoji: '🥕', osm: ['shop=greengrocer'], why: 'Fruits et légumes de saison, souvent plus frais et moins emballés.' },
  bio: { one: 'Magasin bio', label: 'Magasins bio', emoji: '🌿', osm: ['shop=organic', 'shop=health_food'], why: 'Rayons vrac, viande et laitages bio, lait cru, choucroute crue, huiles vierges.' },
  supermarche: {
    one: 'Supermarché',
    label: 'Supermarchés',
    emoji: '🛒',
    osm: ['shop=supermarket'],
    why: 'Pratiques pour les basiques : lisez les labels (voir les conseils par aliment) et préférez les rayons traditionnels (boucherie, poissonnerie à la coupe).',
  },
};

export interface BuyGuide {
  id: string;
  title: string;
  emoji: string;
  shops: ShopKind[];
  /** le meilleur choix */
  best: string[];
  /** bon compromis, notamment en supermarché */
  good: string[];
  /** à éviter */
  avoid: string[];
  /** ce qu'il faut lire sur l'étiquette */
  read?: string[];
  why: string;
  sources: string[];
}

const S = {
  daley: 'Daley et al. 2010, Nutrition Journal — bœuf nourri à l’herbe vs au grain',
  sredni: 'Średnicka-Tober et al. 2016, British Journal of Nutrition — viande bio vs conventionnelle (méta-analyse)',
  kuhn: 'Kühn et al. 2014, Nutrition — vitamine D des œufs de poules en plein air',
  karsten: 'Karsten et al. 2010, Renewable Agriculture and Food Systems — œufs de poules au pâturage',
  labelRouge: 'Cahiers des charges Label Rouge (INAO) — volailles fermières',
  bbc: 'Bleu-Blanc-Cœur — filière à alimentation animale riche en oméga-3',
  usda: 'USDA SR28 — composition des aliments (données de l’appli)',
  salmon: 'Hites et al. 2004, Science ; Lundebye et al. 2017, Environmental Research — saumon d’élevage vs sauvage',
  wapf: 'Weston A. Price Foundation ; S. Fallon, Nourishing Traditions',
  shanahan: 'C. Shanahan, Deep Nutrition (2016)',
};

export const GUIDES: BuyGuide[] = [
  {
    id: 'boeuf',
    title: 'Bœuf et veau',
    emoji: '🐄',
    shops: ['boucherie', 'ferme', 'marche'],
    best: [
      'Bœuf **nourri à l’herbe** (pâturage + foin, sans ensilage de maïs ni tourteaux de soja), race à viande (Salers, Aubrac, Limousine, Charolaise) d’un éleveur ou d’un boucher qui connaît la ferme',
      'Viande hachée **à la demande** devant vous, à partir d’un morceau entier (paleron, macreuse)',
      'Veau « sous la mère » (Label Rouge) ou veau rosé élevé en plein air',
    ],
    good: ['**Label Rouge** (race à viande, pâturage exigé une partie de l’année)', '**AB** (bio : pâturage obligatoire dès que possible, alimentation bio)', 'Viande Bleu-Blanc-Cœur', 'Origine « Viande Bovine Française », race à viande précisée'],
    avoid: [
      'Steak haché en barquette sans race ni origine (souvent vaches laitières de réforme nourries au maïs et au soja)',
      '« Préparation de viande hachée » : contient de l’eau, des additifs, des fibres végétales',
      'Viande hachée à 5 % de matières grasses : le gras d’un animal à l’herbe est une partie précieuse (oméga-3, CLA, vitamine E)',
    ],
    read: ['« Race à viande » plutôt que « race laitière »', 'Pays de naissance, d’élevage et d’abattage', 'Mention « 100 % muscle » pour la viande hachée'],
    why: 'Le bœuf nourri à l’herbe contient 2 à 4 fois plus d’oméga-3, davantage de CLA, de bêta-carotène et de vitamine E que le bœuf engraissé aux céréales. La viande bio contient en moyenne 47 % d’oméga-3 en plus.',
    sources: [S.daley, S.sredni],
  },
  {
    id: 'agneau',
    title: 'Agneau',
    emoji: '🐑',
    shops: ['boucherie', 'ferme', 'marche'],
    best: ['Agneau d’herbe ou de prés-salés (AOP Prés-salés du Mont-Saint-Michel, Baie de Somme), agneau de parcours (Sisteron Label Rouge)'],
    good: ['Label Rouge, AB, IGP (Agneau du Limousin, du Quercy…)'],
    avoid: ['Agneau d’importation lointaine sans indication d’élevage'],
    why: 'L’agneau est presque toujours élevé à l’herbe : c’est l’une des viandes les plus riches en oméga-3 et en CLA naturellement. Choisissez les morceaux sur l’os (souris, épaule, collier) pour les bouillons.',
    sources: [S.sredni, S.wapf],
  },
  {
    id: 'porc',
    title: 'Porc et charcuterie',
    emoji: '🐖',
    shops: ['boucherie', 'ferme', 'marche'],
    best: ['Porc **plein air** de race ancienne (Porc Noir de Bigorre AOP, Porc Blanc de l’Ouest, Basque Kintoa) élevé sur parcours', 'Charcuterie artisanale **sans nitrites** (jambon sec, saucisson) ou au sel de mer seul'],
    good: ['Label Rouge « fermier élevé en plein air » ou « en liberté »', 'AB', 'Jambon « supérieur » ou « sans nitrite ajouté »'],
    avoid: ['Porc standard (bâtiments sur caillebotis, croissance très rapide, alimentation riche en oméga-6)', 'Charcuterie industrielle avec nitrites (E250, E252), dextrose, polyphosphates'],
    read: ['Liste des additifs (E250, E252, E451)', '« Élevé en plein air » sur l’emballage'],
    why: 'Le gras de porc reflète directement l’alimentation de l’animal : un porc nourri au maïs et au soja a un lard riche en oméga-6 (inflammatoires). Les charcuteries nitritées sont classées cancérogènes par le CIRC.',
    sources: [S.sredni, 'CIRC 2015 — viandes transformées'],
  },
  {
    id: 'volaille',
    title: 'Poulet, dinde, canard',
    emoji: '🐔',
    shops: ['volailler', 'ferme', 'marche', 'boucherie'],
    best: ['Volaille fermière **entière** élevée en plein air (Bresse AOP, Label Rouge fermier, petit éleveur)', 'Cuisses et hauts de cuisse **avec la peau et l’os** plutôt que des blancs', 'Abats de volaille : foies, cœurs, gésiers, carcasses pour bouillon'],
    good: ['**Label Rouge** : abattage à 81 jours minimum contre environ 38 jours en standard, souches à croissance lente, parcours extérieur', '**AB** : abattage à 81 jours minimum, plein air'],
    avoid: ['Poulet standard « élevé au sol » ou « certifié » (croissance en 35–40 jours, sans extérieur)', 'Blancs en barquette « filets » : la partie la moins nutritive', 'Volaille marinée ou « préparation » (additifs)'],
    read: ['Âge d’abattage (81 jours ou plus)', '« Fermier élevé en plein air » ou « en liberté »'],
    why: 'Dans les données USDA de l’appli, la cuisse apporte bien plus de fer, de zinc et de vitamine B12 que le blanc. La peau et le gras fournissent les vitamines liposolubles et l’énergie, et l’os donne du collagène au bouillon.',
    sources: [S.labelRouge, S.usda, S.shanahan],
  },
  {
    id: 'abats',
    title: 'Abats',
    emoji: '🫀',
    shops: ['boucherie', 'volailler', 'ferme'],
    best: ['Foie, cœur, rognons, langue d’animaux **élevés à l’herbe** ou bio (le foie filtre : l’élevage compte doublement)'],
    good: ['Foies de volaille Label Rouge ou bio', 'Cœur et langue de bœuf de boucherie (peu chers, très nutritifs)'],
    avoid: ['Foie d’animaux d’élevage intensif', 'Plus de 150 g de foie par portion, ou plus d’une à deux fois par semaine (excès de vitamine A, surtout pendant la grossesse)'],
    why: 'Les abats sont les aliments les plus denses du règne animal : le foie apporte vitamine A, B12, folates, cuivre et choline ; le cœur apporte de la CoQ10 et du fer.',
    sources: [S.wapf, S.shanahan, S.usda],
  },
  {
    id: 'oeufs',
    title: 'Œufs',
    emoji: '🥚',
    shops: ['ferme', 'marche', 'bio'],
    best: ['Œufs de poules **au pâturage** chez un petit producteur (poules qui sortent vraiment, herbe, insectes)', 'Code **0** (bio) ou **1** (plein air)'],
    good: ['Label Rouge « fermiers élevés en plein air »', 'Bleu-Blanc-Cœur (jaunes plus riches en oméga-3)'],
    avoid: ['Code **3** (cage) et **2** (au sol, sans extérieur)', 'Œufs « enrichis » à la place de poules qui sortent'],
    read: ['Le premier chiffre du code imprimé sur la coquille : 0 = bio, 1 = plein air, 2 = au sol, 3 = cage'],
    why: 'Les poules exposées au soleil pondent des jaunes 3 à 4 fois plus riches en vitamine D. Au pâturage, les œufs contiennent 2 fois plus de vitamine E et d’oméga-3 à longue chaîne.',
    sources: [S.kuhn, S.karsten],
  },
  {
    id: 'laitier',
    title: 'Lait, beurre, crème, fromages',
    emoji: '🧈',
    shops: ['fromagerie', 'ferme', 'marche', 'bio'],
    best: ['Fromages **au lait cru AOP** (comté, beaufort, reblochon, roquefort, salers, ossau-iraty…)', 'Beurre et crème **crus** ou de baratte, lait entier cru ou non homogénéisé', 'Yaourt et kéfir au lait entier (faits maison ou fermiers)'],
    good: ['AB (vaches au pâturage, foin)', 'Bleu-Blanc-Cœur', 'Lait de foin (« Heumilch »), AOP de montagne'],
    avoid: ['Produits allégés (0 %, 20 % MG) : sans vitamines A, D, K2', 'Fromages « industriels » au lait pasteurisé standardisé avec additifs', 'Yaourts aromatisés sucrés'],
    read: ['« Au lait cru »', 'AOP', 'Matière grasse « entière »'],
    why: 'Le lait de vaches au pâturage est plus riche en oméga-3, en CLA et en vitamine E. Les fromages au lait cru affinés apportent la vitamine K2. Le gras du lait transporte les vitamines liposolubles.',
    sources: [S.sredni, S.wapf],
  },
  {
    id: 'poisson-gras',
    title: 'Poissons gras',
    emoji: '🐟',
    shops: ['poissonnerie', 'marche', 'supermarche'],
    best: ['Petits poissons gras **sauvages** de nos côtes : sardines, maquereaux, harengs, anchois (bas de la chaîne alimentaire, peu de mercure)', 'Saumon sauvage d’Alaska'],
    good: ['Sardines et maquereaux en conserve **à l’huile d’olive** (on mange les arêtes : calcium)', 'Saumon d’élevage bio ou Label Rouge (Écosse, Irlande)', 'Label MSC'],
    avoid: ['Thon rouge et espadon trop souvent (mercure)', 'Poissons panés, surimi', 'Conserves à l’huile de tournesol'],
    read: ['Zone de pêche FAO (27 = Atlantique Nord-Est)', 'Méthode de pêche (ligne, filet maillant plutôt que chalut de fond)'],
    why: 'Les petits poissons gras sont la meilleure source d’EPA, de DHA et de vitamine D. Le saumon d’élevage nourri aux huiles végétales a un rapport oméga-6/oméga-3 plus défavorable que le sauvage. Les contaminants ont beaucoup baissé dans l’élevage norvégien récent.',
    sources: [S.salmon],
  },
  {
    id: 'poisson-blanc',
    title: 'Poissons blancs et fruits de mer',
    emoji: '🦪',
    shops: ['poissonnerie', 'marche'],
    best: ['Poisson entier de petite pêche (lieu jaune, merlan, bar de ligne, rouget)', 'Coquillages vivants : huîtres, moules, palourdes (zinc, B12, iode)'],
    good: ['Label MSC', 'Moules de bouchot AOP', 'Huîtres Label Rouge'],
    avoid: ['Pangasius, tilapia d’élevage intensif', 'Crevettes tropicales d’élevage intensif (antibiotiques), surimi'],
    why: 'Les coquillages sont parmi les aliments les plus riches en zinc, en vitamine B12 et en iode ; les huîtres battent tous les records de zinc.',
    sources: [S.usda, S.wapf],
  },
  {
    id: 'vegetaux',
    title: 'Légumes, fruits, herbes',
    emoji: '🥬',
    shops: ['marche', 'primeur', 'ferme', 'bio'],
    best: ['Producteur local **de saison**, cueilli mûr', 'Bio pour ce qu’on mange avec la peau (pommes, fraises, salades, herbes)'],
    good: ['Origine France, de saison', 'Surgelés nature (récoltés à maturité)'],
    avoid: ['Fruits et légumes hors saison venant de loin (cueillis verts, moins de vitamines)'],
    why: 'Les vitamines C et B9 diminuent pendant le transport et le stockage : un légume de saison et local en contient davantage à l’assiette.',
    sources: ['ANSES — Ciqual ; études sur la perte de vitamine C après récolte'],
  },
  {
    id: 'graisses',
    title: 'Graisses et huiles',
    emoji: '🫒',
    shops: ['bio', 'ferme', 'supermarche'],
    best: ['Beurre cru ou bio, ghee, graisse de canard, saindoux d’un porc plein air', 'Huile d’olive **vierge extra** de première pression à froid (AOP)'],
    good: ['Huile de coco vierge pour les cuissons vives'],
    avoid: ['Huiles de graines raffinées (tournesol, colza, soja, maïs) pour cuire', 'Margarines, pâtes à tartiner'],
    why: 'Les graisses saturées et mono-insaturées résistent à la chaleur ; les huiles de graines riches en oméga-6 s’oxydent à la cuisson (Deep Nutrition).',
    sources: [S.shanahan, S.wapf],
  },
  {
    id: 'feculents',
    title: 'Féculents, céréales et légumineuses',
    emoji: '🍚',
    shops: ['bio', 'marche', 'supermarche'],
    best: ['Pommes de terre et légumes racines du marché', 'Riz blanc de qualité (basmati, riz rond de Camargue IGP)', 'Légumineuses bio en vrac (à faire tremper)'],
    good: ['Bio pour les pommes de terre (moins de traitements anti-germination)'],
    avoid: ['Purées et riz « précuits » industriels', 'Céréales du petit-déjeuner'],
    why: 'Les féculents simples, bien préparés (trempage pour les légumineuses), apportent l’énergie nécessaire à la prise de masse sans additifs.',
    sources: [S.wapf],
  },
];

const FATTY = new Set(['saumon', 'saumon-fume', 'truite', 'maquereau', 'maquereau-fume', 'maquereau-conserve', 'sardine', 'sardine-conserve', 'hareng', 'anchois', 'thon', 'thon-conserve', 'oeufs-poisson']);

export function guideFor(ing: Pick<Ingredient, 'id' | 'category'>): BuyGuide | undefined {
  const id = ing.id;
  const g = (k: string) => GUIDES.find((x) => x.id === k);
  if (/^(boeuf|veau|os-)/.test(id) || id === 'gibier') return g('boeuf');
  if (/^agneau/.test(id)) return g('agneau');
  if (/^(porc|lardons|bacon|jambon|saucisse|chorizo|boudin|merguez|saucisson|pancetta|andouillette)/.test(id)) return g('porc');
  switch (ing.category) {
    case 'volaille':
      return g('volaille');
    case 'abats':
      return g('abats');
    case 'oeufs':
      return g('oeufs');
    case 'laitier':
      return g('laitier');
    case 'poisson':
      return FATTY.has(id) ? g('poisson-gras') : g('poisson-blanc');
    case 'fruits-de-mer':
      return g('poisson-blanc');
    case 'legume':
    case 'fruit':
    case 'herbe':
      return g('vegetaux');
    case 'matiere-grasse':
      return g('graisses');
    case 'feculent':
    case 'legumineuse':
      return g('feculents');
    case 'viande':
      return g('boeuf');
  }
  return undefined;
}

/** Morceaux plus nutritifs à proposer à la place */
export const UPGRADES: Record<string, { to: string; tip: string }> = {
  'poulet-blanc': { to: 'poulet-haut-cuisse-desosse', tip: 'Prenez des hauts de cuisse (avec la peau si possible) : plus de fer, de zinc et de B12, plus moelleux.' },
  'dinde-escalope': { to: 'dinde-cuisse', tip: 'La cuisse de dinde est plus riche en fer, zinc et B12 que l’escalope, et coûte moins cher.' },
  'boeuf-steak': { to: 'boeuf-paleron', tip: 'Le paleron ou la joue, mijotés, apportent du collagène en plus des minéraux.' },
  'veau-escalope': { to: 'veau-jarret', tip: 'Le jarret (osso buco) apporte la moelle et le collagène de l’os.' },
  'porc-filet-mignon': { to: 'porc-echine', tip: 'L’échine, persillée, est plus riche en vitamines B et plus fondante.' },
  cabillaud: { to: 'maquereau', tip: 'Alternez avec un poisson gras (maquereau, sardine) : EPA, DHA et vitamine D.' },
  'blanc-oeuf': { to: 'oeuf', tip: 'Gardez le jaune : il concentre les vitamines A, D, E, K2, la choline et les caroténoïdes.' },
};

/** Nutriments nettement plus abondants dans `to` que dans `from` (par 100 g) ; ratio plafonné à 10 (« 10 » = 10 fois ou plus) */
export function nutrientGains(from: string, to: string, min = 1.4): Array<{ label: string; ratio: number }> {
  const a = MICROS[from];
  const b = MICROS[to];
  if (!a || !b) return [];
  const keys = ['fe', 'zn', 'vB12', 'vB2', 'vB3', 'vB6', 'se', 'vA', 'vD', 'chol', 'epa', 'o3', 'cu'] as const;
  return keys
    .map((k) => ({ k, ratio: (b[k] ?? 0) / Math.max(1e-6, a[k] ?? 0) }))
    .filter((x) => x.ratio >= min && (b[x.k] ?? 0) > 0)
    .sort((x, y) => y.ratio - x.ratio)
    .slice(0, 5)
    .map((x) => ({ label: NUTRIENTS.find((n) => n.key === x.k)?.label.replace(/ \(.*\)/, '') ?? x.k, ratio: Math.min(10, Math.round(x.ratio * 10) / 10) }));
}

/** Conseil d'achat en une ligne, par famille (affiché sous chaque produit de la liste) */
const SHORT: Record<string, string> = {
  boeuf: 'Bœuf de race à viande nourri à l’herbe, chez le boucher ; sinon Label Rouge ou bio.',
  agneau: 'Agneau d’herbe ou de prés-salés (Label Rouge, IGP, bio).',
  porc: 'Porc plein air (Label Rouge, bio, race ancienne) ; charcuterie sans nitrites.',
  volaille: 'Volaille fermière Label Rouge ou bio (81 jours minimum), de préférence entière ou en cuisses.',
  abats: 'Abats d’animaux élevés à l’herbe ou bio : le foie concentre aussi ce que l’animal a mangé.',
  oeufs: 'Code 0 (bio) ou 1 (plein air), idéalement de poules au pâturage ; jamais code 3.',
  laitier: 'Entier, au lait cru ou AOP de préférence ; jamais allégé.',
  'poisson-gras': 'Petits poissons sauvages (sardine, maquereau, hareng) ; conserves à l’huile d’olive.',
  'poisson-blanc': 'Pêche de ligne ou MSC ; coquillages vivants (moules de bouchot, huîtres Label Rouge).',
  vegetaux: 'De saison et local, bio pour ce qui se mange avec la peau.',
  graisses: 'Beurre cru ou bio, graisses animales, huile d’olive vierge extra ; pas d’huile de graines.',
  feculents: 'Produit brut (riz, pommes de terre, légumineuses en vrac) plutôt que précuit.',
};

/** Conseils propres à certains produits (prioritaires sur ceux de la famille) */
const ITEM_TIPS: Record<string, string> = {
  'boeuf-hache': 'Faites-le hacher devant vous dans un morceau entier (paleron, macreuse), 15 à 20 % de gras ; évitez la barquette « préparation de viande hachée ».',
  'poulet-blanc': 'Volaille Label Rouge ou bio ; mieux encore, prenez des hauts de cuisse avec la peau.',
  'poulet-entier': 'Poulet fermier Label Rouge ou bio ; gardez la carcasse pour un bouillon.',
  'foie-volaille': 'Foies de volailles fermières ou bio, bien rosés et sans taches vertes.',
  'foie-veau': 'Foie de veau élevé sous la mère ou bio ; 150 g par portion maximum.',
  lait: 'Lait entier cru ou non homogénéisé, de vaches au pâturage.',
  beurre: 'Beurre cru ou de baratte, AOP (Charentes-Poitou, Isigny) ou bio.',
  'creme-fraiche': 'Crème crue ou AOP d’Isigny, épaisse et entière.',
  'yaourt-nature': 'Yaourt au lait entier, sans sucre ni épaississant (ou fait maison).',
  'yaourt-grec': 'Yaourt grec au lait entier (10 % MG), sans épaississant.',
  comte: 'Comté AOP au lait cru, affiné 12 mois ou plus (vitamine K2).',
  parmesan: 'Parmigiano Reggiano AOP (lait cru, affiné 24 mois).',
  saumon: 'Saumon sauvage d’Alaska, ou d’élevage bio / Label Rouge d’Écosse ou d’Irlande.',
  'saumon-fume': 'Saumon sauvage ou Label Rouge, fumé au bois, sans sucre ajouté.',
  thon: 'Thon germon ou albacore pêché à la ligne ; pas plus d’une fois par semaine (mercure).',
  'thon-conserve': 'Thon albacore ou germon au naturel ou à l’huile d’olive, pêché à la ligne.',
  'sardine-conserve': 'Sardines entières à l’huile d’olive (on mange les arêtes : calcium).',
  crevette: 'Crevettes sauvages ou bio plutôt que tropicales d’élevage intensif.',
  moule: 'Moules de bouchot AOP du Mont-Saint-Michel ou Label Rouge.',
  lardons: 'Lardons sans nitrites, de porc plein air.',
  bacon: 'Bacon sans nitrites, de porc plein air.',
  'jambon-blanc': 'Jambon « supérieur » sans nitrites, de porc plein air.',
  'jambon-cru': 'Jambon sec affiné au sel seul (Bayonne, Serrano, Parme), sans nitrites.',
  'huile-olive': 'Vierge extra, première pression à froid, en bouteille sombre (AOP si possible).',
  'pomme-de-terre': 'Pommes de terre bio de préférence (moins de traitements anti-germination).',
  'riz-blanc': 'Riz basmati ou riz de Camargue IGP.',
  'bouillon-volaille': 'À faire avec la carcasse du poulet du dimanche : bien plus riche que les cubes.',
  'bouillon-boeuf': 'À faire avec des os à moelle et du jarret demandés au boucher.',
};

export function quickTip(ing: Pick<Ingredient, 'id' | 'category'>): { text: string; guide: BuyGuide } | null {
  const guide = guideFor(ing);
  if (!guide) return null;
  return { text: ITEM_TIPS[ing.id] ?? SHORT[guide.id] ?? guide.best[0], guide };
}
