// Scénario 2 du cahier des charges : un foyer, deux téléphones, même planning et
// même liste de courses ; une case cochée chez l'un apparaît chez l'autre ; hors ligne.
import { check, createMock, generateWeek, idb, onboard, phone, signup, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const mock = createMock();
  const A = await phone(browser, mock, 'A');
  await onboard(A, base, 'Lorenzo');
  await generateWeek(A, base); // avant même d'avoir un compte
  const planA = await A.p.locator('.slot-name').allInnerTexts();
  await signup(A, base, 'lo@test.fr');
  const hid = Object.keys(mock.db.households)[0];
  check(mock.db.households[hid]?.name === 'Foyer de Lorenzo', 'foyer créé au premier login');
  check(Object.keys(mock.db.tables.meal_plans ?? {}).length === planA.length, 'planning local envoyé au foyer');

  await A.p.getByText('Inviter quelqu’un dans le foyer').click();
  const code = (await A.p.locator('strong', { hasText: /^[A-Z0-9]{8}$/ }).first().innerText()).trim();

  const B = await phone(browser, mock, 'B');
  await onboard(B, base, 'Julie');
  await signup(B, base, 'julie@test.fr', { from: `#/rejoindre/${code}` });
  check(Object.keys(mock.db.households).length === 1, 'pas de foyer créé pour rien quand on arrive par une invitation');
  await B.p.getByRole('button', { name: 'Rejoindre ce foyer' }).click();
  await wait(2500);
  // « Qui êtes-vous ? » : Julie garde le profil créé sur son téléphone
  await B.p.getByRole('button', { name: /Le profil que j’avais créé/ }).click();
  await wait(1000);
  check(mock.db.members.filter((m) => m.household_id === hid).length === 2, 'deux membres');
  await B.p.goto(base + '#/semaine');
  await B.p.locator('.slot-name').first().waitFor();
  const planB = await B.p.locator('.slot-name').allInnerTexts();
  check(planB.join('|') === planA.join('|'), 'même planning sur les deux téléphones');
  const names = (await idb(B.p, 'profiles')).map((p) => p.name).sort();
  check(names.join(',') === 'Julie,Lorenzo', `profils du foyer : ${names}`);

  // liste de courses partagée, cochée en direct
  await A.p.goto(base + '#/courses?source=semaine');
  await A.p.getByRole('button', { name: '🛒 Générer ma liste de courses' }).click();
  await wait(2000);
  await B.p.goto(base + '#/compte');
  await B.p.getByText('Synchroniser maintenant').click();
  await wait(1500);
  await B.p.goto(base + '#/courses');
  const first = await B.p.locator('.shop-item .sn').first().innerText();
  await B.p.locator('.shop-item .sn').first().click();
  await A.p.locator('.shop-item.done .sn', { hasText: first }).waitFor({ timeout: 25000 });

  // hors ligne : la modification attend, puis part au retour du réseau
  mock.down = true;
  await B.p.locator('.shop-item:not(.done) .sn').first().click();
  await wait(1200);
  check((await idb(B.p, 'outbox')).length >= 1, 'modification en file d’attente hors ligne');
  mock.down = false;
  await B.p.evaluate(() => window.dispatchEvent(new Event('online')));
  await wait(2500);
  const checked = Object.values(mock.db.tables.shopping_items).filter((r) => r.household_id === hid && r.data.checked).length;
  check(checked === 2, `deux articles cochés côté serveur (${checked})`);
  check(!A.errors.length && !B.errors.length, [...A.errors, ...B.errors].join(' ; '));
  await A.ctx.close();
  await B.ctx.close();
}
