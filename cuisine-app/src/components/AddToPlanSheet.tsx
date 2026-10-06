import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sheet, useToast } from './ui';
import { db } from '../db/db';
import { DAY_NAMES, mondayOf, weekDates } from '../domain/season';
import type { IndexedRecipe, Slot } from '../domain/types';
import { useLibrary } from '../hooks/library';

export const SLOT_LABELS: Record<Slot, string> = { matin: '🌅 Matin', midi: '☀️ Midi', collation: '🍎 Collation', soir: '🌙 Soir' };

export function AddToPlanSheet({ recipe, servings, onClose }: { recipe: IndexedRecipe; servings: number; onClose: () => void }) {
  const [offset, setOffset] = useState(0);
  const toast = useToast();
  const { byId } = useLibrary();
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offset * 7);
  const dates = weekDates(monday);
  const plan = useLiveQuery(() => db.plan.where('date').between(dates[0], dates[6], true, true).toArray(), [dates[0]]) ?? [];
  const slots: Slot[] = [
    ...(recipe.mealTypes.includes('petit-dejeuner') ? (['matin'] as Slot[]) : []),
    ...(recipe.mealTypes.includes('dejeuner') || recipe.mealTypes.includes('diner') ? (['midi', 'soir'] as Slot[]) : []),
    ...(recipe.mealTypes.includes('collation') || recipe.mealTypes.includes('dessert') ? (['collation'] as Slot[]) : []),
  ];

  const add = async (date: string, slot: Slot) => {
    await db.plan.put({ key: `${date}|${slot}`, date, slot, recipeId: recipe.id, servings, createdAt: new Date().toISOString() });
    toast(`Ajoutée au ${new Date(date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long' })} ${slot}`);
    onClose();
  };

  return (
    <Sheet title="📅 Ajouter au planning" onClose={onClose}>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={offset === 0 ? 'on' : ''} onClick={() => setOffset(0)}>
          Cette semaine
        </button>
        <button className={offset === 1 ? 'on' : ''} onClick={() => setOffset(1)}>
          Semaine prochaine
        </button>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {dates.map((d, i) => (
          <div key={d} className="row nowrap">
            <strong style={{ width: 92 }}>{DAY_NAMES[i]}</strong>
            <div className="row grow">
              {slots.map((s) => {
                const cur = plan.find((p) => p.key === `${d}|${s}`);
                return (
                  <button key={s} className="btn sm grow" onClick={() => add(d, s)} title={cur ? `Remplacer : ${byId.get(cur.recipeId)?.name}` : ''}>
                    {SLOT_LABELS[s]} {cur ? '↺' : '+'}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        ↺ = remplace le plat déjà prévu.
      </p>
    </Sheet>
  );
}
