import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * The browser's own Supabase client — persists the session in
 * localStorage (the default), unlike the server-side clients in
 * src/lib/supabase-admin.ts and supabase-request-client.ts, which
 * deliberately don't.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "getSupabaseBrowserClient: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  cachedClient = createClient(url, anonKey);
  return cachedClient;
}
