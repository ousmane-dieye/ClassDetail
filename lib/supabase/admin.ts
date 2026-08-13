import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Client "service role" — BYPASS RLS.
// ⚠️ Ne jamais importer ce fichier dans un composant client.
// Réservé aux Route Handlers serveur protégés (ex: cron sécurisé par CRON_SECRET).
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
