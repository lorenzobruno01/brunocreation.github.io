import { useEffect } from 'react';
import { FEATURES } from '../cloud/config';
import { stravaImport } from '../cloud/remote';
import { db } from '../db/db';
import { saveProfiles } from './Household';
import { patchProfile } from './ProfileFields';
import { SPORTS } from '../config/targets';
import { DAY_LETTERS } from './ProfileFields';
import { useToast } from './ui';

let handled = false;

/** Retour d'autorisation Strava (?code=…&state=strava) : résumé des séances, appliqué après accord */
export function StravaReturn() {
  const toast = useToast();
  useEffect(() => {
    if (!FEATURES.strava) return;
    const params = new URLSearchParams(location.search);
    if (handled || params.get('state') !== 'strava' || !params.get('code')) return;
    handled = true;
    const code = params.get('code')!;
    history.replaceState(null, '', location.pathname + location.hash);
    (async () => {
      try {
        const s = await stravaImport(code);
        const profiles = await db.profiles.toArray();
        const id = sessionStorage.getItem('cuisine.stravaFor');
        const p = profiles.find((x) => x.id === id) ?? profiles[0];
        if (!p) return;
        const days = s.trainingDays.map((d) => DAY_LETTERS[d]).join(' ');
        if (confirm(`Strava : ${s.activities} activités en 4 semaines, soit ${s.sessions} séance(s) par semaine de ${s.minutes} min (${SPORTS[s.type].label.toLowerCase()})${days ? `, surtout ${days}` : ''}.\n\nMettre à jour le profil de ${p.name} ?`)) {
          await saveProfiles(profiles.map((x) => (x.id === p.id ? patchProfile(x, { sport: { sessions: Math.min(6, s.sessions), type: s.type, minutes: s.minutes }, trainingDays: s.trainingDays }) : x)));
          toast('Profil mis à jour depuis Strava 🟧');
        }
      } catch (e) {
        toast(`Strava : ${(e as Error).message}`);
      }
    })();
  }, [toast]);
  return null;
}
