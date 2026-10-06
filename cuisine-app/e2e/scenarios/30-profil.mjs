// Un ami crée son profil complet en moins de 2 minutes, voit ses besoins,
// les ajuste, masque les chiffres ; un second membre ; profil actif.
import { check, phone, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const A = await phone(browser, null, 'ami');
  const p = A.p;
  const t0 = Date.now();
  await p.goto(base + '#/');
  await p.getByText('Créer mon profil').click({ timeout: 15000 });
  await p.getByPlaceholder('Votre prénom').fill('Karim');
  await p.getByLabel('Âge').fill('27');
  await p.getByLabel('Taille').fill('182');
  await p.getByLabel('Poids').fill('74');
  await p.getByRole('button', { name: 'Suivant ›' }).click();
  // activité : assis + 4 séances de musculation d'1 h, lundi/mardi/jeudi/vendredi
  await p.getByRole('button', { name: /Assis la plupart du temps/ }).click();
  await p.getByRole('button', { name: '4 séances' }).click();
  await p.getByRole('button', { name: /Musculation/ }).click();
  await p.getByRole('button', { name: '1 h', exact: true }).click();
  for (const d of ['lundi', 'mardi', 'jeudi', 'vendredi']) await p.getByRole('button', { name: d, exact: true }).click();
  await p.getByRole('button', { name: 'Suivant ›' }).click();
  await p.getByRole('button', { name: /Prendre du muscle/ }).click();
  await p.getByRole('button', { name: /Prudent/ }).click();
  await p.getByRole('button', { name: 'Suivant ›' }).click();
  // goûts : allergie aux crustacés, n'aime pas le foie
  await p.getByRole('button', { name: /Crustacés/ }).click();
  await p.getByPlaceholder(/ex\. foie/).fill('foie');
  await p.locator('.chips .chip', { hasText: /foie/i }).first().click();
  await p.getByRole('button', { name: 'Suivant ›' }).click();
  const summary = await p.locator('.sheet').innerText();
  check(/kcal/.test(summary) && /protéines/.test(summary), 'besoins affichés à la fin de l’accueil');
  check(/médecin/.test(summary), 'avertissement santé affiché');
  p.once('dialog', (x) => x.dismiss());
  await p.getByRole('button', { name: '✅ C’est parti' }).click();
  await wait(400);
  const secs = (Date.now() - t0) / 1000;
  check(secs < 120, `accueil en moins de 2 minutes (${secs.toFixed(0)} s)`);

  const prof = await p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('cuisine-foyer');
        r.onsuccess = () => {
          const q = r.result.transaction('profiles').objectStore('profiles').getAll();
          q.onsuccess = () => res(q.result);
        };
      }),
  );
  const k = prof[0];
  check(k.name === 'Karim' && k.age === 27 && k.weight === 74, 'identité enregistrée');
  check(k.daily === 'sedentaire' && k.sport?.sessions === 4 && k.sport.type === 'musculation' && k.trainingDays?.length === 4, 'activité et sport enregistrés');
  check(k.objective === 'prise-de-muscle' && k.pace === 'prudent', 'objectif enregistré');
  check(k.allergies?.includes('crustaces') && k.dislikes?.some((x) => /foie/.test(x)), 'goûts enregistrés');
  // 1832 × 1,4 + 4 × 296/7 ≈ 2690 ; +5 % → ~2800 ; protéines 1,6 × 74 = 118
  check(k.kcal >= 2700 && k.kcal <= 2900, `calories cohérentes (${k.kcal})`);

  // Mes besoins : détail, jours d'entraînement, ajustement manuel
  await p.goto(base + '#/besoins');
  await p.getByText(/Mifflin/).waitFor();
  const page = await p.locator('main').innerText();
  check(/Mifflin/.test(page) && /Selon le jour/.test(page), 'raisonnement et énergie par jour affichés : ' + page.slice(0, 900));
  await p.locator('.need', { hasText: 'Énergie' }).getByText('Ajuster').click();
  await p.getByLabel('Énergie à la main').fill('3100');
  await p.getByLabel('Énergie à la main').blur();
  await wait(400);
  check(/saisi à la main/.test(await p.locator('.need', { hasText: 'Énergie' }).innerText()), 'valeur saisie à la main');
  await p.locator('.need', { hasText: 'Énergie' }).getByText('Revenir au calcul').click();
  await wait(300);
  check(!/saisi à la main/.test(await p.locator('.need', { hasText: 'Énergie' }).innerText()), 'retour au calcul');

  // masquer les chiffres : plus de kcal sur les recettes
  await p.goto(base + '#/recettes');
  await p.locator('.rcard').first().waitFor();
  check(/kcal/.test(await p.locator('.rcard').first().innerText()), 'kcal visibles par défaut');
  await p.goto(base + '#/reglages');
  await p.getByText('🎯 Objectif').first().click();
  await p.getByText(/Ne pas m’afficher les calories/).click();
  await wait(400);
  await p.goto(base + '#/recettes');
  await p.locator('.rcard').first().waitFor();
  check(!/kcal/.test(await p.locator('.rcard').first().innerText()), 'kcal masquées');
  await p.goto(base + '#/besoins');
  await p.getByText(/masqués/).waitFor({ timeout: 5000 });
  { const t = await p.locator('main').innerText(); check(/masqués/.test(t), 'besoins masqués : ' + t.slice(0, 500)); }

  // second membre puis sélecteur « Qui regarde ? »
  await p.goto(base + '#/reglages');
  await p.getByText('Ajouter une personne qui mange avec moi').click();
  await p.getByPlaceholder('Votre prénom').nth(1).waitFor();
  await p.getByPlaceholder('Votre prénom').nth(1).fill('Inès');
  await wait(500);
  await p.locator('.who-btn').click();
  await p.locator('.choice', { hasText: 'Inès' }).click();
  await p.goto(base + '#/besoins');
  await p.getByText('Besoins de Inès').waitFor({ timeout: 5000 });
  check(/Besoins de Inès/.test(await p.locator('main').innerText()), 'profil actif changé');
  { const t = await p.locator('main').innerText(); check(/kcal/.test(t) && !/masqués/.test(t), 'chiffres visibles pour Inès : ' + t.slice(0, 600)); }
  check(!A.errors.length, A.errors.join('\n'));
  await A.ctx.close();
}
