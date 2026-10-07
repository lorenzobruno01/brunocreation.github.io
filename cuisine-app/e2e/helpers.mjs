import { createMock } from './mock-supabase.mjs';
export { createMock };
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function check(cond, msg) {
  if (!cond) throw new Error(msg);
}
/** Un « téléphone » : contexte isolé (sa propre base locale), relié au faux Supabase */
export async function phone(browser, mock, name = 'téléphone') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/supabase\.co/, (r) => (mock ? mock.handle(r) : r.abort()));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(`${name} : ${e.message}`));
  return { ctx, p, errors, name };
}
/** Accueil en 5 étapes : prénom, activité, objectif, goûts (passés), besoins */
/** Passe les écrans de présentation et ouvre la création de profil */
export async function startProfile(p) {
  await p.getByRole('dialog', { name: 'Présentation' }).waitFor({ timeout: 15000 });
  for (let i = 0; i < 3 && !(await p.getByRole('button', { name: /Créer mon profil/ }).isVisible()); i++) await p.getByRole('button', { name: 'Suivant ›' }).click();
  await p.getByRole('button', { name: /Créer mon profil/ }).click();
}
export async function onboard(d, base, prenom) {
  await d.p.goto(base + '#/');
  await startProfile(d.p);
  await d.p.getByPlaceholder('Votre prénom').fill(prenom);
  for (let i = 0; i < 3; i++) await d.p.getByRole('button', { name: 'Suivant ›' }).click();
  await d.p.getByRole('button', { name: 'Passer' }).click();
  d.p.once('dialog', (x) => x.dismiss());
  await d.p.getByRole('button', { name: '✅ C’est parti' }).click();
  await wait(500);
}
export async function signup(d, base, email, { from = '#/compte' } = {}) {
  if (from) await d.p.goto(base + from);
  await d.p.getByRole('button', { name: /🔑 Mot de passe/ }).click();
  await d.p.getByRole('button', { name: 'Créer un compte' }).click();
  await d.p.locator('input[type=email]').fill(email);
  await d.p.locator('input[type=password]').fill('secret123');
  await d.p.getByRole('button', { name: 'Créer mon compte' }).click();
  await wait(2500);
}
export async function login(d, base, email) {
  await d.p.goto(base + '#/compte');
  await d.p.getByRole('button', { name: /🔑 Mot de passe/ }).click();
  await d.p.locator('input[type=email]').fill(email);
  await d.p.locator('input[type=password]').fill('secret123');
  await d.p.getByRole('button', { name: 'Se connecter' }).last().click();
  await wait(3000);
}
export async function generateWeek(d, base) {
  await d.p.goto(base + '#/semaine');
  await d.p.getByText('Générer ma semaine').first().click();
  await d.p.getByText('Optimiser ma semaine').click();
  await d.p.locator('.slot-name').first().waitFor({ timeout: 30000 });
  await wait(500);
}
/** Lecture directe d'une table IndexedDB */
export function idb(p, store) {
  return p.evaluate(
    (s) =>
      new Promise((res) => {
        const r = indexedDB.open('cuisine-foyer');
        r.onsuccess = () => {
          const q = r.result.transaction(s).objectStore(s).getAll();
          q.onsuccess = () => res(q.result);
        };
      }),
    store,
  );
}
