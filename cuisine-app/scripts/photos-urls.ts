/**
 * Met à jour src/data/photos.json à partir des photos téléchargées par le
 * robot GitHub (photos-work/chosen-meta.json → public/photos/<id>.webp).
 * Les photos sont hébergées avec le site : pas de dépendance à Wikimedia.
 *   npx tsx scripts/photos-urls.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const file = join(root, 'src/data/photos.json');
const meta = JSON.parse(readFileSync(join(root, '../photos-work/chosen-meta.json'), 'utf8')) as Record<string, { file: string; author: string; license: string; source: string }>;
const photos: Record<string, object> = {};
for (const [id, m] of Object.entries(meta)) {
  if (!existsSync(join(root, 'public/photos', `${id}.webp`))) continue;
  photos[id] = { commons: m.file, author: m.author, license: m.license, source: m.source, url: `photos/${id}.webp` };
}
writeFileSync(file, JSON.stringify(photos, null, 1) + '\n');
console.log(Object.keys(photos).length, 'photos');
