/** Normalisation de texte pour la recherche : minuscules, sans accents, œ→oe */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Racine grossière (pluriels français) : « pommes » → « pomme », « choux » → « chou » */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith('aux')) return word.slice(0, -3) + 'al';
  if (word.length > 3 && (word.endsWith('s') || word.endsWith('x'))) return word.slice(0, -1);
  return word;
}

export function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'a', 'en', 'un', 'une', 'd', 'l', 'pour', 'avec', 'sur']);

export function slugify(s: string): string {
  return norm(s).replace(/ /g, '-').slice(0, 60);
}
