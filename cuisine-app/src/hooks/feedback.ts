// Repas récents sans avis de la personne : planning des 3 derniers jours
// (et repas déjà passés aujourd'hui) + plats marqués « cuisinés ».
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { isoDate } from '../domain/season';
import type { Slot } from '../domain/types';

export interface PendingMeal {
  cookedId: string;
  recipeId: string;
  date: string;
  slot?: Slot;
}

/** Heure après laquelle on considère le repas comme mangé */
const SLOT_HOUR: Record<Slot, number> = { matin: 10, midi: 14, collation: 17, soir: 21 };

export function pendingMeals(
  plan: Array<{ key: string; date: string; slot: Slot; recipeId: string }>,
  cooking: Array<{ id: string; recipeId: string; date: string }>,
  feedbackIds: Set<string>,
  profileId: string,
  now = new Date(),
): PendingMeal[] {
  const today = isoDate(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 3);
  const start = isoDate(from);
  const out: PendingMeal[] = [];
  const seen = new Set<string>();
  for (const c of cooking) {
    const d = c.date.slice(0, 10);
    if (d < start || d > today) continue;
    seen.add(`${d}|${c.recipeId}`);
    if (!feedbackIds.has(`${c.id}|${profileId}`)) out.push({ cookedId: c.id, recipeId: c.recipeId, date: d });
  }
  for (const e of plan) {
    if (e.date < start || e.date > today) continue;
    if (e.date === today && now.getHours() < SLOT_HOUR[e.slot]) continue;
    if (seen.has(`${e.date}|${e.recipeId}`)) continue;
    const cookedId = `plan:${e.key}`;
    if (!feedbackIds.has(`${cookedId}|${profileId}`)) out.push({ cookedId, recipeId: e.recipeId, date: e.date, slot: e.slot });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function usePendingFeedback(profileId: string): PendingMeal[] {
  const data = useLiveQuery(async () => {
    const from = new Date();
    from.setDate(from.getDate() - 3);
    const start = isoDate(from);
    const [plan, cooking, feedback] = await Promise.all([db.plan.where('date').aboveOrEqual(start).toArray(), db.cooking.where('date').aboveOrEqual(start).toArray(), db.feedback.where('date').aboveOrEqual(start).toArray()]);
    return { plan, cooking, ids: new Set(feedback.map((f) => f.id)) };
  }, []);
  return useMemo(() => (data ? pendingMeals(data.plan, data.cooking, data.ids, profileId) : []), [data, profileId]);
}
