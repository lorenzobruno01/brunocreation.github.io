// Migration incomplète côté serveur (une table absente) : le reste se
// synchronise, un message clair indique quoi faire.
import { check, createMock, generateWeek, onboard, phone, signup, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const mock = createMock({ missingTables: ['recipes'] });
  const A = await phone(browser, mock, 'A');
  await onboard(A, base, 'Lorenzo');
  await generateWeek(A, base);
  await signup(A, base, 'lo@test.fr');
  await wait(1500);
  await A.p.goto(base + '#/compte');
  await A.p.getByText('Mise à jour automatique').waitFor({ timeout: 10000 });
  const txt = await A.p.locator('main').innerText();
  check(!/Problème de synchronisation/.test(txt), 'pas d’erreur bloquante : ' + txt.slice(0, 600));
  check(/ne trouve pas la table recipes/.test(txt), 'table manquante signalée');
  const plans = Object.keys(mock.db.tables.meal_plans ?? {}).length;
  check(plans >= 20, `planning envoyé malgré tout (${plans})`);
  check(!A.errors.length, A.errors.join('\n'));
  await A.ctx.close();
}
