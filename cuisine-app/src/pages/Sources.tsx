import { useState } from 'react';
import antinutriments from '../../docs/sources/antinutriments.md?raw';
import sensibilites from '../../docs/sources/sensibilites.md?raw';
import regimes from '../../docs/sources/regimes.md?raw';
import donnees from '../../docs/sources/donnees-nutritionnelles.md?raw';
import acheter from '../../docs/sources/acheter.md?raw';

const DOCS = [
  { id: 'antinutriments', title: '🌾 Antinutriments & préparation', text: antinutriments },
  { id: 'sensibilites', title: '💎 Oxalates, FODMAP, phytoestrogènes', text: sensibilites },
  { id: 'regimes', title: '🧈 Approches : WAPF, GAPS, Ray Peat…', text: regimes },
  { id: 'donnees', title: '🔬 Données nutritionnelles (USDA)', text: donnees },
  { id: 'acheter', title: '🧭 Bien acheter : élevage et labels', text: acheter },
];

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s: string) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code class="kbd">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>');
}

/** Rendu Markdown minimal (titres, listes, tableaux, liens, gras) */
export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|/.test(l) && /^\s*\|?\s*-{3}/.test(lines[i + 1] ?? '')) {
      closeList();
      const cells = (x: string) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      out.push('<div class="cov-table-wrap"><table class="md-table"><thead><tr>' + cells(l).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        out.push('<tr>' + cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
        i++;
      }
      out.push('</tbody></table></div>');
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      closeList();
      const lvl = Math.min(4, h[1].length + 1);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
    } else if (/^\s*[-*]\s+/.test(l)) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`);
    } else if (/^\s*\d+\.\s+/.test(l)) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>`);
    } else if (/^---+\s*$/.test(l)) {
      closeList();
      out.push('<hr class="sep"/>');
    } else if (l.trim() === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(l)}</p>`);
    }
    i++;
  }
  closeList();
  return out.join('\n');
}

export function Sources() {
  const [doc, setDoc] = useState(DOCS[0].id);
  const d = DOCS.find((x) => x.id === doc)!;
  return (
    <div className="page narrow">
      <h1>📚 Sources & méthode</h1>
      <p className="muted">
        Les règles appliquées à chaque recette (trempage des céréales et légumineuses, levain, oxalates, FODMAP, phytoestrogènes, huiles de graines, profils WAPF / GAPS / Ray Peat…) viennent de cette documentation. Les niveaux de preuve et les points débattus y sont signalés.
      </p>
      <div className="segmented" style={{ marginBottom: 16 }}>
        {DOCS.map((x) => (
          <button key={x.id} className={doc === x.id ? 'on' : ''} onClick={() => setDoc(x.id)}>
            {x.title}
          </button>
        ))}
      </div>
      <article className="card pad md" dangerouslySetInnerHTML={{ __html: renderMarkdown(d.text) }} />
    </div>
  );
}
