import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * A Supabase client scoped to the caller's own access token, so RLS
 * evaluates every query as that user — the same mechanism the integration
 * tests use (tests/factories/supabase-clients.ts). Returns null if the
 * request carries no bearer token.
 *
 * Bearer-token auth (rather than cookies) keeps route handlers plain,
 * directly importable functions with no Next.js request-scoped context
 * dependency, so they're testable without a running server. The browser
 * UI (Phase 5) forwards its session's access token the same way.
 */
export function getRequestScopedSupabaseClient(request: Request): SupabaseClient | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "getRequestScopedSupabaseClient: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

export async function getAuthenticatedUser(client: SupabaseClient): Promise<User | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
