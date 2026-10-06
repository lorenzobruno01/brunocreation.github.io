// Deux personnes, objectifs différents : parts différentes dans le planning,
// quantités à cuisiner = somme des parts, « Ma journée », « Ma semaine ».
import { check, generateWeek, idb, onboard, phone, wait } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const A = await phone(browser, null, 'couple');
  const p = A.p;
  await onboard(A, base, 'Lorenzo');
  // profils précis : lui prise de muscle avec 4 séances, elle maintien
  await p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('cuisine-foyer');
        r.onsuccess = () => {
          const tx = r.result.transaction(['profiles', 'settings'], 'readwrite');
          const st = tx.objectStore('profiles');
          const now = new Date().toISOString();
          st.clear();
          st.put({ id: 'lo', name: 'Lorenzo', sex: 'homme', age: 30, height: 182, weight: 76, kcal: 3000, proteinPerKg: 1.8, daily: 'sedentaire', sport: { sessions: 4, type: 'musculation', minutes: 60 }, trainingDays: [0, 1, 3, 4], objective: 'prise-de-muscle', createdAt: now });
          st.put({ id: 'ines', name: 'Inès', sex: 'femme', age: 29, height: 164, weight: 56, kcal: 2000, proteinPerKg: 1.2, daily: 'leger', objective: 'maintien', createdAt: now + '1' });
          const s = tx.objectStore('settings');
          const g = s.get('settings');
          g.onsuccess = () => s.put({ ...g.result, planFor: 'nous', defaultServings: 2 });
          tx.oncomplete = () => res();
        };
      }),
  );
  await p.reload();
  await wait(500);
  await generateWeek(A, base);
  const plan = await idb(p, 'plan');
  check(plan.length >= 21, `semaine générée (${plan.length})`);

  // fiche d'un créneau : part de chacun
  await p.locator('.slot-name').first().click();
  const sheet = await p.locator('.sheet').innerText();
  check(/Lorenzo : [\d,]+ portion/.test(sheet) && /Inès : [\d,]+ portion/.test(sheet), 'part de chacun affichée : ' + sheet.slice(0, 400));
  const parts = [...sheet.matchAll(/(Lorenzo|Inès) : ([\d,]+) portion/g)].map((m) => Number(m[2].replace(',', '.')));
  check(parts[0] > parts[1], `la part de Lorenzo est plus grande (${parts.join(' / ')})`);
  const cook = Number((/À cuisiner : ([\d,]+) portions/.exec(sheet)?.[1] ?? '0').replace(',', '.'));
  check(cook >= parts[0] + parts[1] - 0.001 && cook - (parts[0] + parts[1]) < 0.5, `quantité cuisinée = somme des parts (${cook})`);
  await p.keyboard.press('Escape');

  // Ma journée (profil actif : Lorenzo)
  await p.goto(base + '#/ma-journee');
  await p.getByText('Mon bilan du jour').waitFor({ timeout: 10000 });
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/day.png', fullPage: true });
  const day = await p.locator('main').innerText();
  check(/Ma part : [\d,]+ portion/.test(day), 'ma part affichée');
  check(/À cuisiner pour/.test(day), 'quantité totale rappelée');
  check(!/whey|poudre/i.test(day), 'jamais de poudre de protéines');

  // Ma semaine
  await p.goto(base + '#/ma-semaine');
  await p.getByText('Le détail').waitFor({ timeout: 10000 });
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/week.png', fullPage: true });
  const week = await p.locator('main').innerText();
  const cov = Number(/(\d+) %\s*couverture moyenne/.exec(week)?.[1] ?? 0);
  check(cov >= 85, `couverture de la semaine (${cov} %)`);
  check(/Ce qui manque|Tout est couvert/.test(week), 'manques ou couverture totale');
  // changer de personne
  await p.locator('.chip', { hasText: 'Inès' }).click();
  await wait(300);
  check(/Inès/.test(await p.locator('.chip.on').innerText()), 'semaine d’Inès');
  check(!A.errors.length, A.errors.join('\n'));
  await A.ctx.close();
}
