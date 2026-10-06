import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Feedback } from '../domain/types';
import { useLibrary, useStoredProfiles } from '../hooks/library';
import { useActiveProfile } from '../hooks/activeProfile';
import { Sheet } from './ui';

const DIGESTION: Array<[NonNullable<Feedback['digestion']>, string]> = [
  ['bien', '😌 Bien digéré'],
  ['lourd', '😮‍💨 Un peu lourd'],
  ['inconfort', '😣 Inconfort'],
];
const AGAIN: Array<[NonNullable<Feedback['again']>, string]> = [
  ['oui', '👍 À refaire'],
  ['peut-etre', '🤷 Pourquoi pas'],
  ['non', '👎 Plus jamais'],
];

/** « Comment c'était ? » — un avis par personne, enregistré à chaque toucher */
export function FeedbackSheet({ cookedId, recipeId, date, onClose }: { cookedId: string; recipeId: string; date: string; onClose: () => void }) {
  const { byId } = useLibrary();
  const stored = useStoredProfiles();
  const profiles = stored ?? [];
  const active = useActiveProfile(profiles);
  // tant que les profils chargent, on suit le profil actif (jamais un profil d'exemple)
  const [picked, setWho] = useState<string | null>(null);
  const who = picked ?? active.id;
  const existing = useLiveQuery(() => db.feedback.where('recipeId').equals(recipeId).toArray(), [recipeId]) ?? [];
  const r = byId.get(recipeId);
  const id = `${cookedId}|${who}`;
  const f: Feedback = existing.find((x) => x.id === id) ?? { id, cookedId, recipeId, profileId: who, date };
  const save = (patch: Partial<Feedback>) => db.feedback.put({ ...f, ...patch, date: f.date || date });
  const done = (pid: string) => existing.some((x) => x.id === `${cookedId}|${pid}`);
  if (!stored) return null;
  return (
    <Sheet
      title={`💬 Comment c’était ?`}
      onClose={onClose}
      footer={
        <button className="btn primary lg" style={{ width: '100%' }} onClick={onClose}>
          Terminé
        </button>
      }
    >
      <div className="stack">
        <strong>
          {r?.emoji} {r?.name}
        </strong>
        {profiles.length > 1 && (
          <div className="chips">
            {profiles.map((p) => (
              <button key={p.id} className={`chip ${who === p.id ? 'on' : ''}`} onClick={() => setWho(p.id)}>
                {p.sex === 'homme' ? '👨' : '👩'} {p.name}
                {done(p.id) ? ' ✓' : ''}
              </button>
            ))}
          </div>
        )}
        <div className="field">
          <label>Goût</label>
          <div className="segmented" role="group" aria-label="Note de goût">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={f.taste === n ? 'on' : ''} aria-label={`${n} sur 5`} onClick={() => save({ taste: n })}>
                {n <= (f.taste ?? 0) ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Digestion</label>
          <div className="chips">
            {DIGESTION.map(([k, l]) => (
              <button key={k} className={`chip ${f.digestion === k ? 'on' : ''}`} onClick={() => save({ digestion: k })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>On le refait ?</label>
          <div className="chips">
            {AGAIN.map(([k, l]) => (
              <button key={k} className={`chip ${f.again === k ? 'on' : ''}`} onClick={() => save({ again: k })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Une remarque ?</label>
          <input className="input" defaultValue={f.note ?? ''} key={id} placeholder="ex. plus de citron, trop salé…" onBlur={(e) => e.target.value !== (f.note ?? '') && save({ note: e.target.value || undefined })} />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Ces avis servent à proposer plus souvent ce que vous aimez, à écarter ce que vous ne voulez plus et à repérer un ingrédient qui passe mal.
        </p>
      </div>
    </Sheet>
  );
}
