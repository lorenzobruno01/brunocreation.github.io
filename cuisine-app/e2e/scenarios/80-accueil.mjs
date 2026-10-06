// Accueil personnalisé : « Bonjour [prénom] », repas du jour et parts,
// couverture de la semaine, à utiliser vite, avis en attente, demandes locales.
import { check, generateWeek, onboard, phone, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const A = await phone(browser, null, 'accueil');
  const p = A.p;
  await onboard(A, base, 'Lorenzo');
  await p.goto(base + '#/');
  await p.getByRole('heading', { name: /Lorenzo !/ }).waitFor({ timeout: 10000 });
  check(/Rien de prévu aujourd’hui/.test(await p.getByLabel('Aujourd’hui').innerText()), 'pas encore de planning');
  // options payantes absentes par défaut
  check(!(await p.getByText('Demander à l’assistant').count()), 'pas d’assistant IA par défaut');

  await generateWeek(A, base);
  await p.goto(base + '#/');
  await p.getByText(/Semaine \d+ %/).waitFor({ timeout: 10000 });
  const today = await p.getByLabel('Aujourd’hui').innerText();
  check(/Matin|Midi|Soir/.test(today), 'repas du jour : ' + today.slice(0, 200));
  check(!(await p.getByText(/attend(ent)? votre avis/).count()), 'pas d’avis demandé pour des repas ajoutés après coup');

  // demande locale
  await p.getByLabel('Votre demande').fill('combler mon manque de fer');
  await p.getByRole('button', { name: 'Chercher' }).click();
  await wait(500);
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/home.png', clip: { x: 0, y: 0, width: 390, height: 1900 }, fullPage: true });
  const ans = await p.getByLabel('Demander').innerText();
  check(/Compris : riche en fer/.test(ans), 'demande comprise : ' + ans.slice(0, 300));
  check((await p.getByLabel('Demander').locator('.rcard').count()) >= 3, 'plats proposés');
  await p.getByRole('button', { name: 'Une recette pour deux ce soir en 30 min' }).click();
  await wait(400);
  check(/prêt en 30 min maximum/.test(await p.getByLabel('Demander').innerText()), 'deuxième demande');
  check(!A.errors.length, A.errors.join('\n'));
  await A.ctx.close();
}
