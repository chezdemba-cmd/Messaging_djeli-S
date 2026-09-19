import { createClient, SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;
let browserClient: SupabaseClient | null = null;

/**
 * Client Supabase avec la clé de rôle de service (Service Role Key).
 * Réservé EXCLUSIVEMENT au code serveur / API backend.
 * Contourne le RLS pour orchestrer les tables d'authentification, clés API, logs et messages.
 */
export function getServiceSupabase(): SupabaseClient | null {
  if (serverClient) {
    return serverClient;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://ziqnoebceensrtudpnep.supabase.co";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  serverClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serverClient;
}

/**
 * Client Supabase public pour le frontend (avec clé anon).
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://ziqnoebceensrtudpnep.supabase.co";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  browserClient = createClient(supabaseUrl, anonKey);
  return browserClient;
}
