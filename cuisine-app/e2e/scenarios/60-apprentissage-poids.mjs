// Retours après repas → apprentissage (ingrédient suspect) ; poids qui stagne
// → proposition d'augmenter les calories → les parts du planning suivent.
import { check, generateWeek, idb, onboard, phone, wait } from '../helpers.mjs';

const put = (p, store, rows) =>
  p.evaluate(
    ({ store, rows }) =>
      new Promise((res) => {
        const r = indexedDB.open('cuisine-foyer');
        r.onsuccess = () => {
          const tx = r.result.transaction(store, 'readwrite');
          for (const row of rows) tx.objectStore(store).put(row);
          tx.oncomplete = () => res();
        };
      }),
    { store, rows },
  );

export default async function ({ browser, base }) {
  const A = await phone(browser, null, 'lorenzo');
  const p = A.p;
  await onboard(A, base, 'Lorenzo');
  const [prof] = await idb(p, 'profiles');
  await put(p, 'profiles', [{ ...prof, sex: 'homme', age: 30, height: 182, weight: 75, daily: 'sedentaire', sport: { sessions: 4, type: 'musculation', minutes: 60 }, objective: 'prise-de-muscle', pace: 'standard' }]);
  await p.reload();
  await wait(500);

  // 1. avis après un plat cuisiné
  await p.goto(base + '#/recettes');
  await p.locator('.rcard a').first().click();
  await p.getByText('J’ai cuisiné ce plat').click();
  await p.getByText('Comment c’était ?').waitFor();
  await p.getByLabel('5 sur 5').click();
  await p.getByRole('button', { name: /Bien digéré/ }).click();
  await p.getByRole('button', { name: /À refaire/ }).click();
  await p.getByRole('button', { name: 'Terminé' }).click();
  const fb = await idb(p, 'feedback');
  check(fb.length === 1 && fb[0].profileId === prof.id && fb[0].taste === 5 && fb[0].again === 'oui' && fb[0].digestion === 'bien', 'avis enregistré');

  // 2. plusieurs repas avec oignon mal digérés → suspect
  const withOnion = ['boeuf-bourguignon', 'pdj-frittata-pommes-de-terre-courgette', 'pdj-galettes-pdt-saumon-fume-aneth', 'pdj-tortilla-espanola-oignons'];
  const without = ['pdj-oeufs-brouilles-beurre-ciboulette', 'pdj-oeufs-mollets-mouillettes-jambon-cru', 'pdj-omelette-comte-fines-herbes', 'pdj-oeufs-poches-royale-hollandaise'];
  const date = new Date().toISOString().slice(0, 10);
  await put(
    p,
    'feedback',
    [...withOnion, ...without].map((r, i) => ({ id: `x${i}|${prof.id}`, cookedId: `x${i}`, recipeId: r, profileId: prof.id, date, digestion: i < 3 ? 'inconfort' : 'bien', taste: 4 })),
  );
  await p.reload();
  await p.goto(base + '#/appris');
  await p.getByText('Ce que l’appli a appris').waitFor();
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/appris.png', fullPage: true });
  const learned = await p.locator('main').innerText();
  check(/Vos plats préférés/.test(learned), 'page « appris »');
  if (/Ingrédients à surveiller/.test(learned)) {
    await p.getByRole('button', { name: /L’éviter/ }).first().click();
    await wait(400);
    const [after] = await idb(p, 'profiles');
    check((after.intolerances ?? []).length > 0, 'ingrédient suspect écarté sur demande');
  } else check(false, 'ingrédient suspect détecté : ' + learned.slice(0, 400));

  // 3. planning, part du jour avant ajustement
  await generateWeek(A, base);
  await p.goto(base + '#/ma-journee');
  await p.getByText('Mon bilan du jour').waitFor({ timeout: 10000 });
  const part = async () => Number((/Ma part : ([\d,]+) portion/.exec(await p.locator('main').innerText())?.[1] ?? '0').replace(',', '.'));
  const before = await part();

  // 4. 14 jours de poids stable → proposition → appliquer
  const logs = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 14 + i * 2);
    return { id: `w${i}`, profileId: prof.id, date: d.toISOString().slice(0, 10), kg: [75.2, 74.8, 74.8, 75.2, 75.2, 74.8, 74.8, 75.2][i] };
  });
  await put(p, 'weights', logs);
  await p.reload();
  await p.goto(base + '#/poids');
  await p.getByText('Tendance actuelle').waitFor();
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/poids.png', fullPage: true });
  const w = await p.locator('main').innerText();
  check(/stagne/.test(w) && /Proposition : \+\d+ kcal/.test(w), 'poids stagnant → proposition : ' + w.slice(0, 500));
  check(!!(await p.locator('svg[aria-label="Courbe du poids"]').count()), 'courbe affichée');
  await p.getByRole('button', { name: '✅ Appliquer' }).click();
  await wait(500);
  const [adj] = await idb(p, 'profiles');
  check(adj.overrides?.kcal > 0 && adj.adjustments?.length === 1, 'ajustement enregistré');
  await p.goto(base + '#/ma-journee');
  await p.getByText('Mon bilan du jour').waitFor({ timeout: 10000 });
  const afterPart = await part();
  check(afterPart > before, `les parts suivent (${before} → ${afterPart})`);
  check(!A.errors.length, A.errors.join('\n'));
  await A.ctx.close();
}
