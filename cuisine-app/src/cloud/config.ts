// ─────────────────────────────────────────────────────────────
// Comptes et synchronisation en ligne (Supabase, offre gratuite).
// Ces deux valeurs sont PUBLIQUES par conception : la clé « anon /
// publishable » ne donne accès qu'aux données de l'utilisateur
// connecté, grâce aux règles de sécurité (RLS) de la table.
// Mise en place : docs/COMPTES.md
// ─────────────────────────────────────────────────────────────
const RAW_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://qjtlbelxragbagfoncrh.supabase.co';
/** adresse racine du projet (sans /rest/v1/ éventuellement collé à la fin) */
export const SUPABASE_URL = RAW_URL.replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/$/, '');
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_tNdEVQPno2HFofYkyakXlQ_dSJQlOzr';

/**
 * Options facultatives, DÉSACTIVÉES par défaut (gratuité, aucun secret
 * côté navigateur). Pour les activer : déployer les fonctions serveur
 * (supabase/functions) puis construire le site avec ces variables à 1.
 * Voir docs/SUPABASE.md, section 6.
 */
export const FEATURES = {
  /** assistant IA (clé Anthropic gardée par la fonction serveur, quota par jour) */
  ai: import.meta.env.VITE_FEATURE_AI === '1',
  /** import des séances Strava */
  strava: import.meta.env.VITE_FEATURE_STRAVA === '1',
  /** bouton « Continuer avec Google » */
  google: import.meta.env.VITE_FEATURE_GOOGLE === '1',
};
/** identifiant d'application Strava : public (le secret reste dans la fonction serveur) */
export const STRAVA_CLIENT_ID: string = import.meta.env.VITE_STRAVA_CLIENT_ID || '';
