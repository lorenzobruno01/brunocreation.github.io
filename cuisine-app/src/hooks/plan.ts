// Planning d'une période + analyse par personne (parts, couverture, manques)
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { NutritionProfile } from '../domain/micronutrients';
import type { PlanEntry, Settings } from '../domain/types';
import { analyzeWeek, type PersonWeek } from '../domain/week';
import { useLibrary, useProfiles, useUserData } from './library';

/** Personnes pour qui le planning est fait (« Nous » = tout le foyer) */
export function planProfiles(profiles: NutritionProfile[], settings: Settings): NutritionProfile[] {
  const planFor = settings.planFor ?? (profiles.length > 1 ? 'nous' : profiles[0].id);
  if (planFor === 'nous') return profiles;
  return [profiles.find((p) => p.id === planFor) ?? profiles[0]];
}

export function usePlanAnalysis(dates: string[]): { plan: PlanEntry[]; weeks: PersonWeek[]; eaters: NutritionProfile[]; loaded: boolean } {
  const { byId, lookup } = useLibrary();
  const { settings } = useUserData();
  const profiles = useProfiles();
  const eaters = planProfiles(profiles, settings);
  const rows = useLiveQuery(() => db.plan.where('date').between(dates[0], dates[dates.length - 1], true, true).toArray(), [dates[0], dates[dates.length - 1]]);
  const plan = useMemo(() => rows ?? [], [rows]);
  const weeks = useMemo(() => analyzeWeek(plan, byId, eaters, lookup), [plan, byId, lookup, JSON.stringify(eaters)]); // eslint-disable-line react-hooks/exhaustive-deps
  return { plan, weeks, eaters, loaded: rows !== undefined };
}
