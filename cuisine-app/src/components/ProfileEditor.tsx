import type { NutritionProfile } from '../domain/micronutrients';
import { ActivityFields, IdentityFields, NeedsSummary, ObjectiveFields, patchProfile, TasteFields } from './ProfileFields';

/** Fiche complète d'une personne : données, activité, objectif, goûts → besoins */
export function ProfileEditor({ value, onChange, onRemove }: { value: NutritionProfile; onChange: (p: NutritionProfile) => void; onRemove?: () => void }) {
  const p = value;
  const set = (patch: Partial<NutritionProfile>) => onChange(patchProfile(p, patch));
  return (
    <div className="card pad stack" style={{ boxShadow: 'none' }}>
      <IdentityFields p={p} set={set} />
      <details className="profile-section">
        <summary>🏃 Activité et sport</summary>
        <ActivityFields p={p} set={set} />
      </details>
      <details className="profile-section">
        <summary>🎯 Objectif</summary>
        <ObjectiveFields p={p} set={set} />
      </details>
      <details className="profile-section">
        <summary>😋 Goûts, allergies, intolérances</summary>
        <TasteFields p={p} set={set} />
      </details>
      <NeedsSummary p={p} />
      {onRemove && (
        <div>
          <button className="btn ghost sm danger" onClick={onRemove}>
            Retirer cette personne
          </button>
        </div>
      )}
    </div>
  );
}
