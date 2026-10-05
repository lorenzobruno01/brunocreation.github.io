// ─────────────────────────────────────────────────────────────
// Comptes et synchronisation en ligne (Supabase, offre gratuite).
// Ces deux valeurs sont PUBLIQUES par conception : la clé « anon /
// publishable » ne donne accès qu'aux données de l'utilisateur
// connecté, grâce aux règles de sécurité (RLS) de la table.
// Mise en place : docs/COMPTES.md
// ─────────────────────────────────────────────────────────────
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || '';
