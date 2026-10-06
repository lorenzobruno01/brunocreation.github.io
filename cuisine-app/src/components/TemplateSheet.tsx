import { useState } from 'react';
import type { Slot, SlotMode } from '../domain/types';
import { DAY_NAMES } from '../domain/season';
import { SLOT_MODES, saveWeekTemplate, useWeekTemplate } from '../hooks/plan';
import { SLOT_LABELS } from './AddToPlanSheet';
import { Sheet } from './ui';

const SLOTS: Slot[] = ['matin', 'midi', 'collation', 'soir'];

/** Gabarit de la semaine type : temps disponible, repas dehors, restes, batch */
export function TemplateSheet({ onClose }: { onClose: () => void }) {
  const saved = useWeekTemplate();
  const [draft, setDraft] = useState<Record<string, SlotMode> | null>(null);
  const t = draft ?? saved;
  const set = (k: string, m: SlotMode) => setDraft({ ...t, [k]: m });
  return (
    <Sheet
      title="🗓 Ma semaine type"
      onClose={onClose}
      footer={
        <button
          className="btn primary lg"
          style={{ width: '100%' }}
          onClick={async () => {
            await saveWeekTemplate(t);
            onClose();
          }}
        >
          Enregistrer
        </button>
      }
    >
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Indiquez, pour chaque repas, le temps dont vous disposez, les repas pris dehors, ceux où vous mangez les restes de la veille et ceux préparés en batch cooking (le dimanche par exemple). Le générateur en tient compte, et les quantités à cuisiner incluent les restes.
        </p>
        <div className="template-grid">
          <span />
          {SLOTS.map((s) => (
            <span key={s} className="small muted" style={{ textAlign: 'center' }}>
              {SLOT_LABELS[s]}
            </span>
          ))}
          {DAY_NAMES.map((day, d) => (
            <div key={day} style={{ display: 'contents' }}>
              <strong className="small">{day.slice(0, 3)}</strong>
              {SLOTS.map((s) => {
                const k = `${d}|${s}`;
                const m = t[k] ?? 'libre';
                return (
                  <select key={k} className={`select tsel ${m !== 'libre' ? 'on' : ''}`} aria-label={`${day} ${SLOT_LABELS[s]}`} value={m} onChange={(e) => set(k, e.target.value as SlotMode)}>
                    {(Object.keys(SLOT_MODES) as SlotMode[]).map((x) => (
                      <option key={x} value={x}>
                        {x === 'libre' ? '—' : SLOT_MODES[x].short}
                      </option>
                    ))}
                  </select>
                );
              })}
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm ghost" onClick={() => setDraft({})}>
            Tout remettre à « — »
          </button>
          <button
            className="btn sm ghost"
            onClick={() => {
              const x: Record<string, SlotMode> = { ...t };
              for (let d = 0; d < 5; d++) {
                x[`${d}|soir`] = x[`${d}|soir`] && x[`${d}|soir`] !== 'libre' ? x[`${d}|soir`] : '30';
                x[`${d}|matin`] = x[`${d}|matin`] && x[`${d}|matin`] !== 'libre' ? x[`${d}|matin`] : '15';
              }
              setDraft(x);
            }}
          >
            Soirs de semaine rapides
          </button>
        </div>
      </div>
    </Sheet>
  );
}
