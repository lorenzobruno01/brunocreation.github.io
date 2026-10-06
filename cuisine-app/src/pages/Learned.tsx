import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useLibrary, useStoredProfiles } from '../hooks/library';
import { setActiveProfile, useActiveProfile } from '../hooks/activeProfile';
import { usePendingFeedback } from '../hooks/feedback';
import { recipeScores, suspectIngredients } from '../domain/learning';
import { saveProfiles } from '../components/Household';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { SLOT_LABELS } from '../components/AddToPlanSheet';
import { formatDateFr } from '../components/format';

/** « Ce que l'application a appris » : avis en attente, plats aimés, à éviter, ingrédients suspects */
export function Learned() {
  const { byId, lookup } = useLibrary();
  const profiles = useStoredProfiles() ?? [];
  const me = useActiveProfile(profiles);
  const feedback = useLiveQuery(() => db.feedback.toArray(), []) ?? [];
  const pending = usePendingFeedback(me.id);
  const [open, setOpen] = useState<{ cookedId: string; recipeId: string; date: string } | null>(null);
  const scores = useMemo(() => [...recipeScores(feedback, me.id).values()], [feedback, me.id]);
  const suspects = useMemo(() => suspectIngredients(feedback, me.id, (id) => byId.get(id), lookup, me.learnDismissed), [feedback, me.id, byId, lookup, me.learnDismissed]);
  const loved = scores.filter((s) => !s.never && s.score >= 2).sort((a, b) => b.score - a.score);
  const never = scores.filter((s) => s.never);
  const mine = feedback.filter((f) => f.profileId === me.id);
  const notes = mine.filter((f) => f.note).sort((a, b) => b.date.localeCompare(a.date));

  const updateMe = (patch: Partial<typeof me>) => saveProfiles(profiles.map((p) => (p.id === me.id ? { ...p, ...patch } : p)));
  const name = (id: string) => byId.get(id)?.name ?? 'Plat supprimé';

  return (
    <div className="page stack">
      <h1 style={{ margin: 0 }}>🧠 Ce que l’appli a appris</h1>
      {profiles.length > 1 && (
        <div className="chips">
          {profiles.map((p) => (
            <button key={p.id} className={`chip ${p.id === me.id ? 'on' : ''}`} onClick={() => setActiveProfile(p.id)}>
              {p.sex === 'homme' ? '👨' : '👩'} {p.name}
            </button>
          ))}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        D’après {mine.length} avis{profiles.length > 1 ? ` de ${me.name}` : ''}. Rien n’est écarté sans votre accord : l’appli propose plus souvent ce que vous aimez et vous signale ce qui semble mal passer.
      </p>

      {pending.length > 0 && (
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>💬 Comment c’était ?</h2>
          {pending.slice(0, 8).map((m) => (
            <button key={m.cookedId} className="row between nowrap" style={{ background: 'none', border: 'none', padding: '6px 0', textAlign: 'left', color: 'inherit', cursor: 'pointer', font: 'inherit' }} onClick={() => setOpen(m)}>
              <span>
                <strong>{name(m.recipeId)}</strong>
                <span className="small muted">
                  {' '}
                  · {formatDateFr(m.date, { weekday: 'long' })}
                  {m.slot ? ` ${SLOT_LABELS[m.slot].slice(3).toLowerCase()}` : ''}
                </span>
              </span>
              <span className="tag primary" style={{ whiteSpace: 'nowrap' }}>Mon avis</span>
            </button>
          ))}
        </section>
      )}

      {suspects.length > 0 && (
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>🔍 Ingrédients à surveiller</h2>
          {suspects.map((s) => (
            <div key={s.ingredient.id} className="stack" style={{ gap: 4, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <span>
                {s.ingredient.emoji} <strong>{s.ingredient.name}</strong> : présent dans {s.bad} des {s.meals} repas qui ont été lourds ou inconfortables ({Math.round(s.rate * 100)} %, contre {Math.round(s.baseline * 100)} % pour les autres repas).
              </span>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn sm" onClick={() => updateMe({ intolerances: [...(me.intolerances ?? []), s.ingredient.id] })}>
                  🚫 L’éviter
                </button>
                <button className="btn ghost sm" onClick={() => updateMe({ learnDismissed: [...(me.learnDismissed ?? []), s.ingredient.id] })}>
                  Ce n’est pas lui
                </button>
              </div>
            </div>
          ))}
          <p className="small muted" style={{ margin: 0 }}>
            Une corrélation n’est pas une preuve : en cas de troubles digestifs persistants, parlez-en à un médecin.
          </p>
        </section>
      )}

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>❤️ Vos plats préférés</h2>
        {loved.length ? (
          loved.slice(0, 12).map((s) => (
            <Link key={s.recipeId} to={`/recette/${s.recipeId}`} className="row between nowrap" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span>{name(s.recipeId)}</span>
              <span className="tag ok">{'★'.repeat(Math.max(1, Math.round((s.score + 5) / 2)))}</span>
            </Link>
          ))
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Donnez votre avis après quelques repas : vos plats préférés reviendront plus souvent.</p>
        )}
      </section>

      {never.length > 0 && (
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>👎 Plus proposés</h2>
          {never.map((s) => (
            <div key={s.recipeId} className="row between nowrap">
              <Link to={`/recette/${s.recipeId}`}>{name(s.recipeId)}</Link>
              <button
                className="btn ghost sm"
                onClick={async () => {
                  const rows = feedback.filter((f) => f.profileId === me.id && f.recipeId === s.recipeId && f.again === 'non');
                  await db.feedback.bulkPut(rows.map((f) => ({ ...f, again: 'peut-etre' as const })));
                }}
              >
                Redonner une chance
              </button>
            </div>
          ))}
        </section>
      )}

      {((me.intolerances ?? []).some((i) => lookup(i)) || (me.dislikes ?? []).length > 0) && (
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>🚫 Écartés à votre demande</h2>
          <div className="chips">
            {[...(me.intolerances ?? []).filter((i) => lookup(i)), ...(me.dislikes ?? [])].map((id) => (
              <button
                key={id}
                className="chip"
                title="Ne plus écarter"
                onClick={() => updateMe({ intolerances: (me.intolerances ?? []).filter((x) => x !== id), dislikes: (me.dislikes ?? []).filter((x) => x !== id) })}
              >
                {lookup(id)?.name ?? id} <span className="x">✕</span>
              </button>
            ))}
          </div>
          <Link to="/reglages" className="small">
            Modifier dans le profil ›
          </Link>
        </section>
      )}

      {notes.length > 0 && (
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>📝 Vos remarques</h2>
          {notes.slice(0, 10).map((f) => (
            <div key={f.id} className="small">
              <strong>{name(f.recipeId)}</strong> : {f.note}
            </div>
          ))}
        </section>
      )}

      {open && <FeedbackSheet cookedId={open.cookedId} recipeId={open.recipeId} date={open.date} onClose={() => setOpen(null)} />}
    </div>
  );
}
