// Liste compacte des ingrédients normalisés (référence pour la rédaction de recettes)
import { INGREDIENTS } from '../src/data/ingredients';
const byCat = new Map<string, string[]>();
for (const i of INGREDIENTS) {
  const extra = [i.unit !== 'g' ? `unité:${i.unit}` : '', i.pieceWeight ? `pièce≈${i.pieceWeight}g` : '', i.aliases?.length ? `alias: ${i.aliases.slice(0, 4).join(', ')}` : '']
    .filter(Boolean)
    .join(' | ');
  (byCat.get(i.category) ?? byCat.set(i.category, []).get(i.category)!).push(`  ${i.id} — ${i.name}${extra ? ` (${extra})` : ''}`);
}
for (const [c, l] of byCat) console.log(`## ${c}\n${l.join('\n')}`);
