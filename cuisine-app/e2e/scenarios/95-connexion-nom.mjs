// Connexion par code (appli installée), choix d'un mot de passe, connexion par
// mot de passe ; nom dans le foyer modifiable et qui suit « c'est moi ».
import { check, createMock, idb, onboard, phone, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const mock = createMock();
  const A = await phone(browser, mock, 'A');
  const p = A.p;
  await onboard(A, base, 'Lorenzo');
  await p.goto(base + '#/compte');
  // le mot de passe est proposé en premier
  check(/Se connecter/.test(await p.locator('form button[type=submit]').innerText()), 'mot de passe par défaut');
  // connexion par code reçu par e-mail
  await p.getByRole('button', { name: /Code par e-mail/ }).click();
  await p.locator('input[type=email]').fill('lo@test.fr');
  await p.getByRole('button', { name: 'Recevoir mon code de connexion' }).click();
  await p.getByLabel('Code reçu par e-mail').fill('123456');
  await p.getByRole('button', { name: 'Me connecter avec ce code' }).click();
  await p.getByText('Mise à jour automatique').or(p.getByText('Temps réel actif')).first().waitFor({ timeout: 15000 });
  check(Object.values(mock.db.households).length === 1, 'connecté par code, foyer créé');

  // choisir un mot de passe
  await p.getByRole('button', { name: 'Choisir', exact: true }).click();
  await p.getByLabel('Nouveau mot de passe').fill('secret123');
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(500);
  check(Object.values(mock.db.users)[0].password === 'secret123', 'mot de passe enregistré');

  // nom dans le foyer
  check(mock.db.members[0].display_name === 'Lorenzo', `nom initial (${mock.db.members[0].display_name})`);
  await p.getByRole('button', { name: /Changer mon nom/ }).click();
  await p.getByLabel('Mon nom dans le foyer').fill('Lolo');
  await p.getByRole('button', { name: 'OK' }).click();
  await wait(500);
  check(mock.db.members[0].display_name === 'Lolo', 'nom changé');
  check(/Lolo/.test(await p.locator('main').innerText()), 'nom affiché');

  // « c'est moi » sur un autre profil : le nom suit
  await p.goto(base + '#/reglages');
  await p.getByText('Ajouter une personne qui mange avec moi').click();
  await p.getByPlaceholder('Votre prénom').nth(1).waitFor();
  await p.getByPlaceholder('Votre prénom').nth(1).fill('Emma');
  await wait(500);
  await p.getByRole('button', { name: /Choisir le mien/ }).click();
  await p.locator('.choice', { hasText: 'Lorenzo' }).click();
  await wait(800);
  check(mock.db.members[0].display_name === 'Lorenzo', `le nom suit le profil choisi (${mock.db.members[0].display_name})`);

  // reconnexion avec le mot de passe
  const B = await phone(browser, mock, 'B');
  await B.p.goto(base + '#/compte');
  await B.p.locator('input[type=email]').fill('lo@test.fr');
  await B.p.locator('input[type=password]').fill('secret123');
  await B.p.getByRole('button', { name: 'Se connecter' }).last().click();
  await B.p.getByText(/Foyer de/).first().waitFor({ timeout: 15000 });
  await wait(2500);
  const profs = await idb(B.p, 'profiles');
  check(profs.some((x) => x.name === 'Lorenzo'), 'reconnecté par mot de passe, profils retrouvés');
  check(!A.errors.length && !B.errors.length, [...A.errors, ...B.errors].join('\n'));
  await A.ctx.close();
  await B.ctx.close();
}
