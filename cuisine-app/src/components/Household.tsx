import { db, saveSettings } from '../db/db';
import type { NutritionProfile } from '../domain/micronutrients';
import { newProfile } from '../domain/profile';
import { ProfileEditor } from './ProfileEditor';

/** Enregistre la liste des membres (ajouts, modifications, retraits) */
export async function saveProfiles(next: NutritionProfile[]) {
  const now = new Date().toISOString();
  const keep = new Set(next.map((p) => p.id));
  await db.transaction('rw', db.profiles, async () => {
    const cur = await db.profiles.toArray();
    await db.profiles.bulkDelete(cur.filter((p) => !keep.has(p.id)).map((p) => p.id));
    const byId = new Map(cur.map((p) => [p.id, JSON.stringify(p)]));
    const changed = next.filter((p) => byId.get(p.id) !== JSON.stringify(p));
    await db.profiles.bulkPut(changed.map((p) => ({ ...p, createdAt: p.createdAt ?? now, updatedAt: now })));
  });
}

export function HouseholdEditor({ profiles, onChange }: { profiles: NutritionProfile[]; onChange?: (p: NutritionProfile[]) => void }) {
  const save =
    onChange ??
    ((p: NutritionProfile[]) => {
      saveProfiles(p);
      saveSettings({ defaultServings: Math.max(1, p.length) });
    });
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
