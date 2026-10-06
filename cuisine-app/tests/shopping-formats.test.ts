import { describe, expect, it } from 'vitest';
import { INGREDIENT_BY_ID } from '../src/data/ingredients';
import { costOf, purchaseFor } from '../src/config/formats';

const ing = (id: string) => INGREDIENT_BY_ID[id];

describe('formats de vente', () => {
  it('œufs : boîtes de 6 et 12', () => {
    expect(purchaseFor(ing('oeuf'), 7)).toMatchObject({ bought: 12, leftover: 5, text: '1 boîte de 12' });
    expect(purchaseFor(ing('oeuf'), 5).text).toBe('1 boîte de 6');
    expect(purchaseFor(ing('oeuf'), 17).text).toBe('1 boîte de 12 + 1 boîte de 6');
  });
  it('beurre : plaquettes', () => {
    expect(purchaseFor(ing('beurre'), 137).text).toBe('1 plaquette de 250 g');
    expect(purchaseFor(ing('beurre'), 300).text).toBe('1 plaquette de 250 g + 1 plaquette de 125 g');
    expect(purchaseFor(ing('beurre'), 480).text).toBe('2 plaquettes de 250 g');
  });
  it('boucher : à la coupe, au plus juste', () => {
    expect(purchaseFor(ing('poulet-cuisse'), 612)).toMatchObject({ bought: 650, text: '650 g à la coupe' });
  });
  it('légumes à la pièce, herbes en bottes', () => {
    expect(purchaseFor(ing('pomme-de-terre'), 700).text).toMatch(/^5 pommes de terre$/);
    expect(purchaseFor(ing('persil'), 15).text).toBe('1 botte');
  });
  it('lait : bouteilles de 1 L', () => {
    expect(purchaseFor(ing('lait'), 1300)).toMatchObject({ bought: 2000, text: '2 bouteilles de 1 L' });
  });
  it('prix estimés', () => {
    expect(costOf(ing('oeuf'), 12)).toBeCloseTo(5.4);
    expect(costOf(ing('poulet-cuisse'), 1000)).toBe(10);
  });
});
