import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, saveSettings } from '../db/db';
import { cloudEnabled, ME_KEY, useCloud } from '../cloud/sync';
import { newProfile } from '../domain/profile';
import type { NutritionProfile } from '../domain/micronutrients';
import { EXPLAIN } from '../config/targets';
import { saveProfiles } from './Household';
import { ActivityFields, IdentityFields, NeedsSummary, ObjectiveFields, patchProfile, TasteFields } from './ProfileFields';
import { setActiveProfile } from '../hooks/activeProfile';
import { Sheet } from './ui';

const STEPS = [
  { key: 'identite', title: '🧍 Vous', other: '🧍 Qui mange avec vous ?' },
  { key: 'activite', title: '🏃 Votre activité', other: '🏃 Son activité' },
  { key: 'objectif', title: '🎯 Votre objectif', other: '🎯 Son objectif' },
  { key: 'gouts', title: '😋 Vos goûts', other: '😋 Ses goûts' },
  { key: 'besoins', title: '✅ Vos besoins', other: '✅ Les besoins de chacun' },
] as const;

/** Premier lancement : qui mange, avec quels besoins ; ou connexion à un compte existant */
export function Onboarding() {
  const row = useLiveQuery(async () => (await db.settings.get('settings')) ?? null, []);
  const stored = useLiveQuery(() => db.profiles.toArray(), []);
  const cloud = useCloud();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [later, setLater] = useState(false);
  const [step, setStep] = useState(cloud.email ? 0 : -1);
  const [list, setList] = useState<NutritionProfile[] | null>(null);
  const [idx, setIdx] = useState(0);
  // connecté avec un profil créé sur un autre appareil : l'accueil est terminé
  useEffect(() => {
    document.querySelector('.sheet-body')?.scrollTo(0, 0);
  }, [step, idx]);
  useEffect(() => {
    if (cloud.email && row && !row.onboarded && stored?.length) saveSettings({ onboarded: true });
  }, [cloud.email, row, stored]);

  if (row === undefined || row?.onboarded || later || pathname === '/compte' || pathname.startsWith('/rejoindre') || cloud.status === 'syncing') return null;
  if (stored === undefined || (cloud.email && stored.length)) return null;
  const people = list ?? (stored.length ? stored.map((p) => newProfile({ ...p })) : [newProfile({ name: '', userId: cloud.userId })]);
  const p = people[idx] ?? people[0];
  const set = (patch: Partial<NutritionProfile>) => setList(people.map((x, k) => (k === idx ? patchProfile(x, patch) : x)));

  const finish = async () => {
    const clean = people.map((x, i) => ({ ...x, name: x.name.trim() || (i === 0 ? 'Moi' : `Personne ${i + 1}`) }));
    await saveProfiles(clean);
    await saveSettings({ onboarded: true, defaultServings: Math.max(1, clean.length), planFor: clean.length > 1 ? 'nous' : clean[0].id });
    setActiveProfile(clean[0].id);
    try {
      localStorage.setItem(ME_KEY, clean[0].id);
    } catch {
      /* indisponible */
    }
  };

  if (step < 0)
    return (
      <Sheet title="👋 Bienvenue dans Notre Cuisine" onClose={() => setLater(true)}>
        <div className="stack">
          <p style={{ margin: 0 }}>
            L’application compose pour vous une semaine de repas qui couvre <strong>100 % de vos besoins</strong> en vitamines, minéraux et protéines, avec des recettes que vous aimez. Quelques questions suffisent (moins de 2 minutes).
          </p>
          <button className="btn primary lg" onClick={() => setStep(0)}>
            Créer mon profil
          </button>
          {cloudEnabled && !cloud.email && (
            <button
              className="btn"
              onClick={() => {
                setLater(true);
                navigate('/compte');
              }}
            >
              🔑 J’ai déjà un compte : me connecter
            </button>
          )}
          <button className="btn ghost sm" onClick={() => setLater(true)}>
            Plus tard
          </button>
        </div>
      </Sheet>
    );

  const s = STEPS[step];
  const who = idx === 0 || s.key === 'identite' || s.key === 'besoins' ? '' : p.name ? ` (${p.name})` : '';
  const next = () => setStep(step + 1);
  return (
    <Sheet
      title={`${idx === 0 ? s.title : s.other}${who}`}
      onClose={() => setLater(true)}
      footer={
        <div className="stack" style={{ gap: 8 }}>
          <div className="wizard-dots" aria-label={`Étape ${step + 1} sur ${STEPS.length}`}>
            {STEPS.map((x, i) => (
              <span key={x.key} className={i === step ? 'on' : ''} />
            ))}
          </div>
          <div className="row nowrap" style={{ gap: 8 }}>
            {step > 0 && (
              <button className="btn" onClick={() => setStep(step - 1)}>
                ‹ Retour
              </button>
            )}
            {s.key === 'gouts' && (
              <button className="btn ghost" onClick={next}>
                Passer
              </button>
            )}
            {s.key !== 'besoins' ? (
              <button className="btn primary grow" onClick={next} disabled={s.key === 'identite' && !p.name.trim()}>
                Suivant ›
              </button>
            ) : (
              <button
                className="btn primary grow"
                onClick={async () => {
                  await finish();
                  if (cloudEnabled && !cloud.email && confirm('Profil enregistré ✅\n\nCréer un compte gratuit pour retrouver vos données sur tous vos appareils et les partager avec votre foyer ?')) navigate('/compte');
                }}
              >
                ✅ C’est parti
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="stack">
        {s.key === 'identite' && <IdentityFields p={p} set={set} />}
        {s.key === 'activite' && <ActivityFields p={{ ...p, daily: p.daily ?? 'leger' }} set={set} />}
        {s.key === 'objectif' && <ObjectiveFields p={p} set={set} />}
        {s.key === 'gouts' && (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              Facultatif : l’appli écarte ce qui ne vous convient pas et met en avant ce que vous aimez.
            </p>
            <TasteFields p={p} set={set} />
          </>
        )}
        {s.key === 'besoins' && (
          <>
            {people.map((x) => (
              <div key={x.id} className="stack" style={{ gap: 4 }}>
                <strong>
                  {x.sex === 'homme' ? '👨' : '👩'} {x.name || 'Vous'}
                </strong>
                <NeedsSummary p={x} link={false} />
              </div>
            ))}
            <button
              className="btn"
              onClick={() => {
                const np = newProfile({ sex: people[0]?.sex === 'homme' ? 'femme' : 'homme' });
                setList([...people, np]);
                setIdx(people.length);
                setStep(0);
              }}
            >
              ➕ Quelqu’un mange avec moi
            </button>
            <p className="small muted" style={{ margin: 0 }}>
              Une personne qui a son propre téléphone peut aussi rejoindre votre foyer plus tard avec un lien d’invitation (Mon compte).
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              ⚕️ {EXPLAIN.disclaimer}
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
