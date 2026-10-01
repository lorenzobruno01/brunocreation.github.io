import { useState } from 'react';
import type { GeneratedCandidate } from '../ai/claude';
import { CUISINES, DIFFICULTIES } from '../domain/labels';
import { ingredientLine } from '../domain/units';
import { useLibrary } from '../hooks/library';
import { formatDuration } from './format';

const STATUS: Record<GeneratedCandidate['status'], { label: string; cls: string }> = {
  ok: { label: '✅ Nouvelle & conforme', cls: 'ok' },
  proche: { label: '⚠️ Proche d’une recette existante', cls: 'warn' },
  doublon: { label: '⛔ Doublon', cls: 'warn' },
  invalide: { label: '⛔ Non conforme', cls: 'warn' },
};

export function CandidatePreview({
  c,
  selected,
  onToggle,
}: {
  c: GeneratedCandidate;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const { lookup } = useLibrary();
  const [open, setOpen] = useState(false);
  const r = c.indexed;
  const st = STATUS[c.status];
  return (
    <div className="card pad" style={{ opacity: c.status === 'ok' || selected ? 1 : 0.75 }}>
      <div className="row nowrap" style={{ alignItems: 'flex-start' }}>
        {onToggle && (
          <button className={`checkbox ${selected ? 'on' : ''}`} onClick={onToggle} aria-label="Sélectionner" style={{ cursor: 'pointer', marginTop: 4 }}>
            {selected ? '✓' : ''}
          </button>
        )}
        <div className="grow">
          <div className="row between">
            <strong style={{ fontFamily: 'var(--font-title)', fontSize: '1.08rem' }}>
              {r.emoji} {r.name}
            </strong>
            <span className={`tag ${st.cls}`}>{st.label}</span>
          </div>
          <div className="small muted">
            {CUISINES[r.cuisine]?.emoji} {CUISINES[r.cuisine]?.label} · ⏱ {formatDuration(r.totalTime)} · {DIFFICULTIES[r.difficulty]?.label} · 🔥 {r.nutrition.kcal} kcal · 🥩 {r.nutrition.protein} g
          </div>
          <p className="small" style={{ margin: '6px 0' }}>
            {r.description}
          </p>
          {c.closest && c.closest.score >= 0.5 && (
            <div className="small muted">
              Plus proche : « {c.closest.name} » ({Math.round(c.closest.score * 100)} %{c.closest.reasons.length ? ` — ${c.closest.reasons.join(', ')}` : ''})
            </div>
          )}
          {c.issues.length > 0 && (
            <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--warn)' }}>
              {c.issues.map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
            </ul>
          )}
          <button className="btn ghost sm" onClick={() => setOpen(!open)} style={{ marginTop: 4, paddingLeft: 0 }}>
            {open ? '▲ Masquer le détail' : '▼ Voir ingrédients et étapes'}
          </button>
          {open && (
            <div className="small">
              <ul>
                {r.ingredients.map((ri, i) => {
                  const ing = lookup(ri.id);
                  return ing ? (
                    <li key={i}>
                      {ingredientLine(ri.qty, ri.unit, ing)}
                      {ri.note ? ` — ${ri.note}` : ''}
                    </li>
                  ) : null;
                })}
              </ul>
              <ol>
                {r.steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
