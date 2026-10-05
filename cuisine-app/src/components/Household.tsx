import { saveSettings } from '../db/db';
import { DEFAULT_PROFILES, type NutritionProfile } from '../domain/micronutrients';
import { newProfile } from '../domain/profile';
import { ProfileEditor } from './ProfileEditor';

/** Les personnes qui mangent ensemble, chacune avec ses besoins */
export function useHouseholdProfiles(settingsProfiles?: NutritionProfile[]): NutritionProfile[] {
  return settingsProfiles?.length ? settingsProfiles : DEFAULT_PROFILES;
}

export function HouseholdEditor({ profiles, onChange }: { profiles: NutritionProfile[]; onChange?: (p: NutritionProfile[]) => void }) {
  const save = onChange ?? ((p: NutritionProfile[]) => saveSettings({ profiles: p, defaultServings: Math.max(1, p.length) }));
  return (
    <div className="stack">
      {profiles.map((p, i) => (
        <div key={p.id} className="stack" style={{ gap: 6 }}>
          <strong>
            {p.sex === 'homme' ? '👨' : '👩'} {i === 0 ? 'Vous' : p.name || `Personne ${i + 1}`}
          </strong>
          <ProfileEditor value={p} onChange={(np) => save(profiles.map((x, k) => (k === i ? np : x)))} onRemove={profiles.length > 1 ? () => save(profiles.filter((_, k) => k !== i)) : undefined} />
        </div>
      ))}
      <div>
        <button className="btn" onClick={() => save([...profiles, newProfile({ sex: profiles[0]?.sex === 'homme' ? 'femme' : 'homme' })])}>
          ➕ Ajouter une personne qui mange avec moi
        </button>
      </div>
    </div>
  );
}
