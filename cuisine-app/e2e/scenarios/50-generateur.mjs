// Générateur : allergies et goûts respectés, 100 % sur la semaine annoncé,
// et message honnête quand ce n'est pas possible (repas non planifiés).
import { check, generateWeek, idb, onboard, phone, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const A = await phone(browser, null, 'allergique');
  const p = A.p;
  await onboard(A, base, 'Inès');
  await p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('cuisine-foyer');
        r.onsuccess = () => {
          const tx = r.result.transaction(['profiles'], 'readwrite');
          const st = tx.objectStore('profiles');
          const g = st.getAll();
          g.onsuccess = () => {
            const prof = g.result[0];
            st.put({ ...prof, allergies: ['crustaces', 'fruits-a-coque'], intolerances: ['lactose'], dislikes: ['foie-volaille'], spice: 0 });
          };
          tx.oncomplete = () => res();
        };
      }),
  );
  await p.reload();
  await wait(500);
  const t0 = Date.now();
  await generateWeek(A, base);
  const secs = (Date.now() - t0) / 1000;
  check(secs < 20, `génération rapide (${secs.toFixed(1)} s)`);
  await p.getByLabel('Bilan de la semaine').waitFor({ timeout: 10000 });
  const verdict = await p.getByLabel('Bilan de la semaine').innerText();
  check(/100 %.*couverts sur la semaine/.test(verdict), 'semaine à 100 % annoncée : ' + verdict);

  // aucun plat avec un ingrédient interdit : chaque fiche le signalerait
  const plan = await idb(p, 'plan');
  for (const e of plan.slice(0, 6)) {
    await p.goto(base + `#/recette/${e.recipeId}`);
    await p.locator('h1').first().waitFor();
    check(!/n’est pas proposé dans le planning/.test(await p.locator('main').innerText()), `plat compatible : ${e.recipeId}`);
  }

  // seulement midi et soir : le bilan l'explique et propose des ajouts
  await p.goto(base + '#/semaine');
  await p.locator('button.chip', { hasText: 'Matin' }).click();
  await p.locator('button.chip', { hasText: 'Collation' }).click();
  await p.getByText('Générer ma semaine').first().click();
  await p.getByLabel(/Tout regénérer/).check();
  await p.getByText('Optimiser ma semaine').click();
  await wait(1500);
  const after = await p.getByLabel('Bilan de la semaine').innerText();
  if (process.env.SHOTS) await p.getByLabel('Bilan de la semaine').screenshot({ path: process.env.SHOTS + '/verdict.png' });
  check(/repas planifiés sur 4|100 %/.test(after), 'bilan cohérent avec 2 repas : ' + after);
  check(!A.errors.length, A.errors.join('\n'));
  await A.ctx.close();
}
