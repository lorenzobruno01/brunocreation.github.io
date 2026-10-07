/**
 * Complète src/data/photos.json avec l'adresse de la vignette Wikimedia
 * (640 px) de chaque fichier Commons, calculée comme le fait MediaWiki
 * (répertoire = empreinte MD5 du nom de fichier).
 *   npx tsx scripts/photos-urls.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(import.meta.dirname, '../src/data/photos.json');
const photos = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { commons: string; url?: string }>;
for (const p of Object.values(photos)) {
  const name = p.commons.replace(/ /g, '_');
  const h = createHash('md5').update(name).digest('hex');
  const enc = encodeURIComponent(name).replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')');
  p.url = `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${enc}/640px-${enc}`;
}
writeFileSync(file, JSON.stringify(photos, null, 1) + '\n');
console.log(Object.keys(photos).length, 'photos');
