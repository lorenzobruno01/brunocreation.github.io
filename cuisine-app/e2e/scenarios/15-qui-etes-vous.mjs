// Lorenzo crée son profil et celui d'Emma, l'invite ; Emma rejoint et choisit
// « Emma » (Lorenzo est indisponible : c'est son compte). Pas de doublon.
import { check, createMock, idb, phone, signup, wait, startProfile } from '../helpers.mjs';

export default async function ({ browser, base }) {
  const mock = createMock();
  const A = await phone(browser, mock, 'Lorenzo');
  const p = A.p;
  await p.goto(base + '#/');
  await startProfile(p);
  check(/🧍 Vous/.test(await p.locator('.sheet h2').innerText()), 'titre « Vous » pour soi');
  await p.getByPlaceholder('Votre prénom').fill('Lorenzo');
  for (let i = 0; i < 3; i++) await p.getByRole('button', { name: 'Suivant ›' }).click();
  await p.getByRole('button', { name: 'Passer' }).click();
  await p.getByRole('button', { name: /Quelqu’un mange avec moi/ }).click();
  const title2 = await p.locator('.sheet h2').innerText();
  check(!/Vous/.test(title2), `titre de la 2e personne sans « Vous » (${title2})`);
  await p.getByRole('button', { name: /Femme/ }).click();
  await p.getByPlaceholder('Votre prénom').fill('Emma');
  for (let i = 0; i < 3; i++) await p.getByRole('button', { name: 'Suivant ›' }).click();
  await p.getByRole('button', { name: 'Passer' }).click();
  p.once('dialog', (x) => x.dismiss());
  await p.getByRole('button', { name: '✅ C’est parti' }).click();
  await wait(400);
  await signup(A, base, 'lo@test.fr');
  await wait(1500);
  const profs = await idb(p, 'profiles');
  const lo = profs.find((x) => x.name === 'Lorenzo');
  const em = profs.find((x) => x.name === 'Emma');
  check(lo?.userId && !em?.userId, `le compte de Lorenzo est relié à Lorenzo, pas à Emma (${JSON.stringify(profs.map((x) => [x.name, !!x.userId]))})`);

  // étiquettes claires dans les réglages
  await p.goto(base + '#/reglages');
  await p.getByText('Mon profil et mon foyer').waitFor();
  const heads = await p.locator('.card strong').allInnerTexts();
  check(heads.some((h) => /Lorenzo\s*vous/.test(h)) && heads.some((h) => /Emma\s*sans compte/.test(h)), 'Lorenzo « vous », Emma « sans compte » : ' + heads.filter((h) => /Lorenzo|Emma/.test(h)).join(' / '));
  // modifier Emma ne touche pas Lorenzo
  await p.getByPlaceholder('Votre prénom').nth(1).fill('Emma B');
  await wait(600);
  const names = (await idb(p, 'profiles')).map((x) => x.name).sort();
  check(names.join(',') === 'Emma B,Lorenzo', `noms indépendants (${names})`);
  await p.getByPlaceholder('Votre prénom').nth(1).fill('Emma');
  await wait(600);

  // invitation
  await p.goto(base + '#/compte');
  await p.getByText('Inviter quelqu’un dans le foyer').click();
  const code = (await p.locator('strong', { hasText: /^[A-Z0-9]{8}$/ }).first().innerText()).trim();

  // Emma arrive directement par le lien, sans profil sur son téléphone
  const B = await phone(browser, mock, 'Emma');
  await signup(B, base, 'emma@test.fr', { from: `#/rejoindre/${code}` });
  await B.p.getByRole('button', { name: 'Rejoindre ce foyer' }).click();
  await B.p.getByText(/Qui êtes-vous/).waitFor({ timeout: 10000 });
  const lorenzoBtn = B.p.locator('.choice', { hasText: 'Lorenzo' });
  check(await lorenzoBtn.isDisabled(), 'Lorenzo indisponible');
  check(/Indisponible/.test(await lorenzoBtn.innerText()), 'raison affichée');
  await B.p.locator('.choice', { hasText: 'Emma' }).click();
  await wait(1500);
  const bp = await idb(B.p, 'profiles');
  check(bp.length === 2, `pas de doublon (${bp.map((x) => x.name)})`);
  check(bp.find((x) => x.name === 'Emma')?.userId && bp.find((x) => x.name === 'Emma').userId !== lo.userId, 'Emma reliée à son compte');
  check(!(await B.p.getByText(/Qui êtes-vous/).count()), 'la question ne revient pas');
  check(!A.errors.length && !B.errors.length, [...A.errors, ...B.errors].join('\n'));
  await A.ctx.close();
  await B.ctx.close();
}
