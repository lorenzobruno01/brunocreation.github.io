// Semaine type (dehors, restes, soirs rapides), batch cooking, restes du frigo,
// courses en formats de vente réels, budget, tri par commerce.
import { check, idb, onboard, phone, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const A = await phone(browser, null, 'gabarit');
  const p = A.p;
  await onboard(A, base, 'Lorenzo');

  // 1. semaine type
  await p.goto(base + '#/semaine');
  await p.getByRole('button', { name: '🗓 Ma semaine type' }).click();
  await p.getByLabel('Lundi ☀️ Midi').selectOption('dehors');
  await p.getByLabel('Mardi ☀️ Midi').selectOption('restes');
  await p.getByLabel('Mercredi 🌙 Soir').selectOption('30');
  await p.getByLabel('Dimanche 🌙 Soir').selectOption('batch');
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/tpl.png' });
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(300);
  const [tpl] = await idb(p, 'weekTemplate');
  check(tpl?.slots['0|midi'] === 'dehors' && tpl.slots['1|midi'] === 'restes', 'semaine type enregistrée');

  // 2. génération
  await p.getByText('Générer ma semaine').first().click();
  await p.getByText('Optimiser ma semaine').click();
  await p.locator('.slot-name').first().waitFor({ timeout: 30000 });
  await wait(500);
  const plan = await idb(p, 'plan');
  const monday = plan.map((e) => e.date).sort()[0];
  check(!plan.some((e) => e.key === `${monday}|midi`), 'lundi midi : dehors');
  const rest = plan.find((e) => e.leftoverOf);
  check(rest && rest.servings === 0, 'mardi midi : restes, rien à cuisiner');
  const src = plan.find((e) => e.key === rest.leftoverOf);
  const others = plan.filter((e) => e.slot === 'soir' && !e.leftoverOf && e.key !== src?.key).map((e) => e.servings);
  check(src && src.recipeId === rest.recipeId && src.servings >= [...others].sort((a, b) => a - b)[Math.floor(others.length / 2)] + 0.5, `plat d’origine cuisiné en plus grande quantité (${src?.servings} contre ${others.join(', ')})`);
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/grid.png', fullPage: true });
  const grid = await p.locator('.week').innerText();
  check(/Dehors/.test(grid) && /Restes/.test(grid), 'grille : dehors et restes visibles');

  // 3. batch cooking
  await p.getByRole('link', { name: '📦 Batch cooking' }).click();
  await p.getByText('Dans quel ordre').waitFor();
  check(/Conservation/.test(await p.locator('main').innerText()), 'mode batch');

  // 4. restes du frigo
  await p.goto(base + '#/frigo');
  await p.getByPlaceholder(/un demi chou/).fill('un demi chou');
  await p.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await wait(300);
  const left = await idb(p, 'leftovers');
  check(left.length === 1 && left[0].ingredientIds.length === 1, 'reste noté et reconnu');

  // 5. courses : formats réels, budget, commerces
  await p.goto(base + '#/courses?source=semaine');
  await p.getByText('Générer ma liste de courses').click();
  await p.locator('.shop-item').first().waitFor();
  await p.getByText(/Estimation : \d+ €/).waitFor();
  await wait(300);
  if (process.env.SHOTS) { await p.locator('.aisle').first().scrollIntoViewIfNeeded(); await p.screenshot({ path: process.env.SHOTS + '/courses2.png' }); }
  const list = await p.locator('main').innerText();
  check(/à la coupe|boîte|plaquette|bouteille|botte|paquet/.test(list), 'formats de vente : ' + list.slice(0, 1500));
  check(/Estimation : \d+ €/.test(list), 'estimation du coût');
  check(/besoin : /.test(list), 'besoin exact rappelé');
  await p.getByRole('button', { name: 'Par commerce' }).click();
  await wait(300);
  check(/Boucher|Primeur|Supermarch|Poissonn|Volailler|Fromager/i.test(await p.locator('main').innerText()), 'tri par commerce');
  await p.getByLabel('Budget de la semaine (€)').fill('20');
  await p.getByLabel('Budget de la semaine (€)').blur();
  await wait(300);
  check(/Au-dessus du budget/.test(await p.locator('main').innerText()), 'alerte budget');
  check(!A.errors.length, A.errors.join('\n'));
  await A.ctx.close();
}
