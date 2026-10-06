// Serveur pas encore migré : l'appli garde l'ancienne sauvegarde. Après migration,
// un nouveau téléphone reprend cette sauvegarde et crée le foyer.
import { check, createMock, login, onboard, phone, signup } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const old = createMock({ legacy: true });
  const A = await phone(browser, old, 'A');
  await onboard(A, base, 'Lorenzo');
  await signup(A, base, 'lo@test.fr');
  check(/ancienne sauvegarde/.test(await A.p.locator('main').innerText()), 'ancien mode signalé');
  const saved = Object.values(old.db.user_data)[0];
  check(saved?.data?.profiles?.[0]?.name === 'Lorenzo', 'sauvegarde complète envoyée');

  const migrated = createMock();
  migrated.db.users = old.db.users;
  migrated.db.user_data = old.db.user_data;
  const B = await phone(browser, migrated, 'B');
  await B.p.goto(base + '#/');
  await login(B, base, 'lo@test.fr');
  check(Object.values(migrated.db.households)[0]?.name === 'Foyer de Lorenzo', 'foyer créé à partir de l’ancienne sauvegarde');
  check(Object.values(migrated.db.tables.profiles ?? {}).some((r) => r.data.name === 'Lorenzo'), 'profil repris');
  check(!(await B.p.getByText('Bienvenue dans Notre Cuisine').isVisible()), 'pas d’écran de bienvenue');
  await A.ctx.close();
  await B.ctx.close();
}
