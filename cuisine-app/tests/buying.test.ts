import { describe, expect, it } from 'vitest';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { guideFor, nutrientGains, quickTip, UPGRADES } from '../src/domain/buying';
import { classify, overpassQuery, parseStores } from '../src/domain/stores';

describe('assistant courses', () => {
  it('classe les commerces OpenStreetMap', () => {
    expect(classify({ shop: 'butcher' })).toBe('boucherie');
    expect(classify({ shop: 'supermarket', brand: 'Biocoop' })).toBe('bio');
    expect(classify({ shop: 'supermarket', name: 'Carrefour' })).toBe('supermarche');
    expect(classify({ amenity: 'marketplace' })).toBe('marche');
    expect(classify({ shop: 'bakery' })).toBeNull();
  });

  it('trie par distance et ignore les éléments sans position', () => {
    const p = { lat: 45.76, lon: 4.85, city: 'Lyon' };
    const list = parseStores(
      [
        { type: 'node', id: 1, lat: 45.8, lon: 4.85, tags: { shop: 'cheese', name: 'Loin' } },
        { type: 'way', id: 2, center: { lat: 45.761, lon: 4.85 }, tags: { shop: 'farm', name: 'Près' } },
        { type: 'node', id: 3, tags: { shop: 'butcher' } },
      ],
      p,
    );
    expect(list.map((s) => s.name)).toEqual(['Près', 'Loin']);
    expect(overpassQuery(p, 5)).toContain('around:5000,45.76,4.85');
  });

  it('a un guide pour chaque aliment frais et des morceaux plus nutritifs', () => {
    for (const id of ['boeuf-hache', 'agneau-epaule', 'porc-echine', 'poulet-blanc', 'foie-veau', 'oeuf', 'comte', 'sardine', 'cabillaud', 'moule', 'carotte', 'beurre-clarifie', 'riz-blanc']) {
      expect(guideFor(INGREDIENT_BY_ID[id]), id).toBeTruthy();
    }
    for (const [from, u] of Object.entries(UPGRADES)) expect(INGREDIENT_BY_ID[u.to], `${from} → ${u.to}`).toBeTruthy();
    const g = nutrientGains('poulet-blanc', 'poulet-haut-cuisse-desosse').map((x) => x.label);
    expect(g).toEqual(expect.arrayContaining(['Zinc', 'Vitamine B12']));
    // conseil spécifique au produit quand il existe
    expect(quickTip(INGREDIENT_BY_ID['boeuf-hache'])?.text).toMatch(/hacher devant vous/);
    expect(quickTip(INGREDIENT_BY_ID['agneau-gigot'])?.text).toMatch(/herbe/);
  });
});
