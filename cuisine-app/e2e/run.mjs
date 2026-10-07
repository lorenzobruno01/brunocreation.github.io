// ─────────────────────────────────────────────────────────────
// Tests de bout en bout (navigateur réel, format téléphone).
//   npm run test:e2e            → tous les scénarios
//   npm run test:e2e -- foyer   → un scénario
// L'appli est construite avec un faux Supabase (e2e/mock-supabase.mjs),
// servie localement, puis pilotée avec Playwright (Chromium).
// ─────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '.site');
execSync(`npx vite build --outDir ${join(site, 'cuisine')} --emptyOutDir`, {
  cwd: join(here, '..'),
  stdio: 'ignore',
  env: { ...process.env, VITE_SUPABASE_URL: 'https://fake.supabase.co', VITE_SUPABASE_KEY: 'fakekey', VITE_FEATURE_EMAIL_CODE: '1' },
});

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let p = join(site, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/cuisine/`;

const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const only = process.argv[2];
const scenarios = readdirSync(join(here, 'scenarios')).filter((f) => f.endsWith('.mjs') && (!only || f.includes(only))).sort();
let failed = 0;
for (const f of scenarios) {
  const t0 = Date.now();
  try {
    const mod = await import(join(here, 'scenarios', f));
    await mod.default({ browser, base });
    console.log(`✅ ${f} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    failed++;
    console.log(`❌ ${f} : ${e.message}`);
  }
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
