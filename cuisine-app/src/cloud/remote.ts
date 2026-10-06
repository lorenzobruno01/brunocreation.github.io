// ─────────────────────────────────────────────────────────────
// Appels aux fonctions serveur facultatives (Supabase Edge Functions).
// Aucun secret ici : la clé Anthropic et le secret Strava sont des
// variables d'environnement des fonctions, jamais envoyées au navigateur.
// ─────────────────────────────────────────────────────────────
import { supabase } from './sync';
import { FEATURES, STRAVA_CLIENT_ID } from './config';
import type { NutritionProfile } from '../domain/micronutrients';

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

/** Question à l'assistant IA (quota quotidien par personne, fixé côté serveur) */
export function askAssistant(question: string, context: Record<string, unknown>): Promise<{ answer: string; remaining: number }> {
  if (!FEATURES.ai) return Promise.reject(new Error('Assistant non activé'));
  return invoke('assistant', { question, context });
}

export interface StravaSummary {
  sessions: number;
  minutes: number;
  type: NonNullable<NutritionProfile['sport']>['type'];
  trainingDays: number[];
  activities: number;
}

/** Adresse d'autorisation Strava (retour sur le site avec ?code=…&state=strava) */
export function stravaAuthorizeUrl(): string {
  const redirect = location.origin + location.pathname;
  return `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(STRAVA_CLIENT_ID)}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&approval_prompt=auto&scope=activity:read&state=strava`;
}

/** Échange le code (côté serveur) puis résume les 4 dernières semaines */
export function stravaImport(code?: string): Promise<StravaSummary> {
  if (!FEATURES.strava) return Promise.reject(new Error('Strava non activé'));
  return invoke('strava', code ? { action: 'exchange', code } : { action: 'summary' });
}
