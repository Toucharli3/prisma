// leaderboard-config.js — classement EN LIGNE partagé via Supabase.
// Renseigne ces 2 valeurs PUBLIQUES (Supabase -> Settings -> API) pour activer
// le classement en ligne sur le site. Tant qu'elles sont vides, le classement
// reste local (par navigateur).
//
// La clé "anon" est conçue pour être publique (la sécurité vient des règles RLS
// définies sur la table). Voir DEPLOY.md pour le SQL à coller.

export const SUPABASE_URL = ''; // ex: https://abcdxyz.supabase.co
export const SUPABASE_ANON_KEY = ''; // clé "anon public"
