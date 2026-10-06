// ─────────────────────────────────────────────────────────────
// Import facultatif des séances Strava. Le secret d'application
// (STRAVA_CLIENT_SECRET) et les jetons de chaque personne restent côté
// serveur (table strava_tokens, inaccessible au navigateur).
// action « exchange » : code OAuth → jetons ; « summary » : résumé des
// 4 dernières semaines (séances/semaine, durée, type, jours habituels).
// ─────────────────────────────────────────────────────────────
import { admin, cors, currentUser, json } from '../_shared/auth.ts';

type Tokens = { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number } };

async function oauth(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: Deno.env.get('STRAVA_CLIENT_ID'), client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'), ...params }),
  });
  if (!res.ok) throw new Error(`Strava a refusé l’autorisation (${res.status}).`);
  return res.json();
}

const TYPE: Record<string, 'musculation' | 'course' | 'collectif' | 'autre'> = {
  WeightTraining: 'musculation',
  Crossfit: 'musculation',
  Workout: 'musculation',
  Run: 'course',
  TrailRun: 'course',
  Ride: 'course',
  VirtualRide: 'course',
  Swim: 'course',
  Rowing: 'course',
  Soccer: 'collectif',
  Basketball: 'collectif',
  Tennis: 'collectif',
  Badminton: 'collectif',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!Deno.env.get('STRAVA_CLIENT_SECRET')) return json({ error: 'Strava non configuré sur le serveur.' }, 503);
  const user = await currentUser(req);
  if (!user) return json({ error: 'Connectez-vous pour relier Strava.' }, 401);
  const db = admin();
  try {
    const { action, code } = await req.json().catch(() => ({}));
    let tok: Tokens | null = null;
    if (action === 'exchange') {
      tok = await oauth({ code, grant_type: 'authorization_code' });
      await db.from('strava_tokens').upsert({ user_id: user.id, athlete_id: tok.athlete?.id, access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_at, updated_at: new Date().toISOString() });
    } else {
      const { data } = await db.from('strava_tokens').select('*').eq('user_id', user.id).maybeSingle();
      if (!data) return json({ error: 'Strava n’est pas encore relié.' }, 404);
      tok = data as Tokens;
      if (tok.expires_at * 1000 < Date.now() + 60000) {
        tok = await oauth({ refresh_token: tok.refresh_token, grant_type: 'refresh_token' });
        await db.from('strava_tokens').update({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_at, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      }
    }
    const after = Math.floor(Date.now() / 1000) - 28 * 86400;
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`, { headers: { Authorization: `Bearer ${tok!.access_token}` } });
    if (!res.ok) return json({ error: `Lecture des activités impossible (${res.status}).` }, 502);
    const acts: Array<{ type: string; sport_type?: string; moving_time: number; start_date_local: string }> = await res.json();
    const count = new Map<string, number>();
    const days = new Map<number, number>();
    let minutes = 0;
    for (const a of acts) {
      const t = TYPE[a.sport_type ?? a.type] ?? 'autre';
      count.set(t, (count.get(t) ?? 0) + 1);
      minutes += a.moving_time / 60;
      const wd = (new Date(a.start_date_local).getUTCDay() + 6) % 7;
      days.set(wd, (days.get(wd) ?? 0) + 1);
    }
    const sessions = Math.round(acts.length / 4);
    const type = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'autre';
    const trainingDays = [...days].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, sessions)).map(([d]) => d).sort();
    return json({ sessions, minutes: acts.length ? Math.round(minutes / acts.length / 15) * 15 : 60, type, trainingDays, activities: acts.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
