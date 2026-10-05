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
