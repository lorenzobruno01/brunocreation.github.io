// « J'ai ces ingrédients » : bascule claire « tous mes ingrédients / au moins un »,
// plus d'onglet ET/OU ni de recette « version maison ».
import { check, onboard, phone, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const A = await phone(browser, null, 'frigo');
  const p = A.p;
  await onboard(A, base, 'Lorenzo');
  await p.goto(base + '#/frigo');
  check(!(await p.getByText('ET / OU').count()), 'plus d’onglet ET/OU');
  const search = p.locator('.search-box input').first();
  for (const q of ['pomme de terre', 'paleron']) {
    await search.fill(q);
    await wait(300);
    await p.locator('.ing-tile, .tile, button', { hasText: new RegExp(q, 'i') }).first().click();
  }
  await search.fill('');
  await p.getByRole('button', { name: /recettes avec tous ces ingrédients/ }).click();
  const group = p.getByRole('group', { name: 'Ingrédients à utiliser' });
  await group.waitFor();
  const txt = await group.innerText();
  const tous = Number(/tous mes ingrédients\s*(\d+)/.exec(txt)?.[1]);
  const un = Number(/au moins un\s*(\d+)/.exec(txt)?.[1]);
  check(tous > 0 && un > tous, `compteurs cohérents (tous ${tous}, au moins un ${un})`);
  check((await p.locator('.grid-cards .rcard').count()) === Math.min(tous, 24), 'liste « tous » affichée par défaut');
  await group.getByRole('button', { name: /au moins un/ }).click();
  await wait(300);
  check((await p.locator('.grid-cards .rcard').count()) > Math.min(tous, 24) || un <= 24, 'liste « au moins un »');
  check(!(await p.getByText(/Composer une recette/).count()), 'plus de composition « version maison »');
  check(!A.errors.length, A.errors.join('\n'));
  await A.ctx.close();
}
