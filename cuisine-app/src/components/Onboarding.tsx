import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, saveSettings } from '../db/db';
import { cloudEnabled, useCloud } from '../cloud/sync';
import { newProfile } from '../domain/profile';
import type { NutritionProfile } from '../domain/micronutrients';
import { HouseholdEditor } from './Household';
import { Sheet } from './ui';

/** Premier lancement : qui mange, avec quels besoins ; ou connexion à un compte existant */
export function Onboarding() {
  const row = useLiveQuery(async () => (await db.settings.get('settings')) ?? null, []);
  const cloud = useCloud();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [later, setLater] = useState(false);
  const [step, setStep] = useState<'hello' | 'profile'>(cloud.email ? 'profile' : 'hello');
  const [profiles, setProfiles] = useState<NutritionProfile[] | null>(null);
  // connecté avec un profil créé sur un autre appareil : l'accueil est terminé
  useEffect(() => {
    if (cloud.email && row && !row.onboarded && row.profiles?.length) saveSettings({ onboarded: true });
  }, [cloud.email, row]);

  if (row === undefined || row?.onboarded || later || pathname === '/compte' || cloud.status === 'syncing') return null;
  if (cloud.email && row?.profiles?.length) return null;
  const list = profiles ?? (row?.profiles?.length ? row.profiles.map((p) => newProfile({ ...p })) : [newProfile({ name: '' })]);

  const finish = async () => {
    const clean = list.map((p, i) => ({ ...p, name: p.name.trim() || (i === 0 ? 'Moi' : `Personne ${i + 1}`) }));
    await saveSettings({ profiles: clean, onboarded: true, defaultServings: Math.max(1, clean.length), planFor: clean.length > 1 ? 'nous' : clean[0].id });
  };

  return (
    <Sheet title={step === 'hello' ? '👋 Bienvenue dans Notre Cuisine' : '🧍 Votre profil'} onClose={() => setLater(true)}>
      {step === 'hello' ? (
        <div className="stack">
          <p style={{ margin: 0 }}>
            L’application calcule pour vous une semaine de repas qui couvre <strong>100 % de vos besoins</strong> en vitamines, minéraux et protéines. Pour cela, elle a besoin de connaître votre taille, votre poids, votre activité et votre objectif.
          </p>
          <button className="btn primary lg" onClick={() => setStep('profile')}>
            Créer mon profil (1 minute)
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
      ) : (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            Vos besoins (calories, protéines, vitamines, minéraux) sont calculés à partir de ces informations et servent au planning de la semaine et aux pourcentages affichés sur chaque recette. Vous pourrez les modifier à tout moment dans Réglages.
          </p>
          <HouseholdEditor profiles={list} onChange={setProfiles} />
          <button
            className="btn primary lg"
            onClick={async () => {
              await finish();
              if (cloudEnabled && !cloud.email && confirm('Profil enregistré ✅\n\nCréer un compte gratuit pour retrouver vos données sur tous vos appareils ?')) navigate('/compte');
            }}
          >
            ✅ Enregistrer
          </button>
        </div>
      )}
    </Sheet>
  );
}
