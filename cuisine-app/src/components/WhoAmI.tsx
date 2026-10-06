import { useState } from 'react';
import { useCloud, myProfileId, setMyProfile } from '../cloud/sync';
import { useStoredProfiles } from '../hooks/library';
import { setActiveProfile } from '../hooks/activeProfile';
import { newProfile } from '../domain/profile';
import type { NutritionProfile } from '../domain/micronutrients';
import { saveProfiles } from './Household';
import { IdentityFields, ObjectiveFields, ActivityFields, patchProfile } from './ProfileFields';
import { Sheet } from './ui';

/** Libellé d'une personne du foyer : vous, a son propre compte, sans compte */
export function useWhoLabel() {
  const cloud = useCloud();
  const stored = useStoredProfiles() ?? [];
  const meId = cloud.userId ? stored.find((p) => p.userId === cloud.userId)?.id : (myProfileId() ?? stored[0]?.id);
  return (p: NutritionProfile): { mine: boolean; tag: string } => {
    if (p.id === meId) return { mine: true, tag: 'vous' };
    if (p.userId) return { mine: false, tag: `a son compte${cloud.members?.find((m) => m.userId === p.userId) ? ` (${cloud.members.find((m) => m.userId === p.userId)!.name})` : ''}` };
    return { mine: false, tag: cloud.email ? 'sans compte' : '' };
  };
}

/**
 * « Qui êtes-vous ? » : affiché quand on est connecté à un foyer sans profil
 * relié à son compte (après avoir rejoint un foyer), ou à la demande.
 */
export function WhoAmI({ forced, onClose }: { forced?: boolean; onClose?: () => void }) {
  const cloud = useCloud();
  const stored = useStoredProfiles();
  const [later, setLater] = useState(false);
  const [creating, setCreating] = useState<NutritionProfile | null>(null);
  if (!stored || !cloud.userId || !cloud.household || cloud.status === 'syncing') return null;
  const linked = stored.some((p) => p.userId === cloud.userId);
  if (!forced && (linked || later || cloud.legacy)) return null;
  const close = () => (onClose ? onClose() : setLater(true));
  const memberName = (uid: string) => cloud.members?.find((m) => m.userId === uid)?.name ?? 'un autre membre';
  const choose = async (id: string) => {
    await setMyProfile(id);
    setActiveProfile(id);
    close();
  };

  if (creating)
    return (
      <Sheet
        title="🧍 Votre profil"
        onClose={close}
        footer={
          <button
            className="btn primary lg"
            style={{ width: '100%' }}
            disabled={!creating.name.trim()}
            onClick={async () => {
              await saveProfiles([...stored, { ...creating, userId: cloud.userId }]);
              await choose(creating.id);
            }}
          >
            ✅ Enregistrer
          </button>
        }
      >
        <div className="stack">
          <IdentityFields p={creating} set={(x) => setCreating(patchProfile(creating, x))} />
          <ActivityFields p={{ ...creating, daily: creating.daily ?? 'leger' }} set={(x) => setCreating(patchProfile(creating, x))} />
          <ObjectiveFields p={creating} set={(x) => setCreating(patchProfile(creating, x))} />
        </div>
      </Sheet>
    );

  return (
    <Sheet title={`👋 Qui êtes-vous dans « ${cloud.household.name} » ?`} onClose={close}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Choisissez votre profil : vos besoins, votre part de chaque plat et vos avis y seront reliés, sur tous vos appareils.
        </p>
        <div className="choice-list">
          {stored.map((p) => {
            const taken = !!p.userId && p.userId !== cloud.userId;
            return (
              <button key={p.id} className={`choice ${p.userId === cloud.userId ? 'on' : ''}`} disabled={taken} style={taken ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => choose(p.id)}>
                <span className="ce">{p.sex === 'homme' ? '👨' : '👩'}</span>
                <span>
                  <strong>{p.name || 'Sans prénom'}</strong>
                  <span className="ch">{taken ? `Indisponible : c’est le profil de ${memberName(p.userId!)}` : p.userId === cloud.userId ? 'C’est vous' : 'Disponible : profil créé dans le foyer, sans compte'}</span>
                </span>
              </button>
            );
          })}
          {(cloud.carry ?? []).map((p) => (
            <button
              key={`carry-${p.id}`}
              className="choice"
              onClick={async () => {
                await saveProfiles([...stored, { ...p, userId: cloud.userId }]);
                await choose(p.id);
              }}
            >
              <span className="ce">📱</span>
              <span>
                <strong>{p.name || 'Mon profil'}</strong>
                <span className="ch">Le profil que j’avais créé sur ce téléphone (l’ajouter au foyer)</span>
              </span>
            </button>
          ))}
          <button className="choice" onClick={() => setCreating(newProfile({ name: '', userId: cloud.userId }))}>
            <span className="ce">➕</span>
            <span>
              <strong>Une autre personne</strong>
              <span className="ch">Créer mon profil</span>
            </span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
