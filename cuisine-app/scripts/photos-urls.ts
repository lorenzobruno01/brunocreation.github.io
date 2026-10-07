/**
 * Met à jour src/data/photos.json à partir des photos téléchargées par le
 * robot GitHub (photos-work/chosen-meta.json → public/photos/<id>.webp).
 * Les photos sont hébergées avec le site : pas de dépendance à Wikimedia.
 *   npx tsx scripts/photos-urls.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const file = join(root, 'src/data/photos.json');
// chosen-meta.json (premières photos) + chosen-meta-<lot>.json (un fichier par lot du robot)
const work = join(root, '../photos-work');
const meta: Record<string, { file: string; author: string; license: string; source: string }> = {};
for (const f of readdirSync(work).filter((f) => /^chosen-meta.*\.json$/.test(f)).sort()) Object.assign(meta, JSON.parse(readFileSync(join(work, f), 'utf8')));
const photos: Record<string, object> = {};
for (const [id, m] of Object.entries(meta)) {
  if (!existsSync(join(root, 'public/photos', `${id}.webp`))) continue;
  photos[id] = { commons: m.file, author: m.author, license: m.license, source: m.source, url: `photos/${id}.webp` };
}
writeFileSync(file, JSON.stringify(photos, null, 1) + '\n');
console.log(Object.keys(photos).length, 'photos');
