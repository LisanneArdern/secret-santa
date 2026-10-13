import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Fixed values baked into every fresh local Supabase project (same
// JWT_SECRET default everywhere `supabase init` hasn't overridden it, which
// ours hasn't) — not secrets, and identical on this machine and in CI.
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const noPersistAuth = { auth: { autoRefreshToken: false, persistSession: false } };

/** Bypasses RLS entirely — for test setup/teardown, never for assertions. */
export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, noPersistAuth);
}

export interface TestUser {
  userId: string;
  email: string;
  accessToken: string;
  /** Authenticated as this user — every assertion about RLS uses this. */
  client: SupabaseClient;
}

/**
 * Creates a real auth.users row (via the admin API) and a client
 * authenticated as that user. Sign-in is by password rather than a magic
 * link purely to keep most test setup simple — RLS only cares that the
 * resulting JWT's `sub` is the user's id, not how they signed in. Pass an
 * explicit `email` when a test needs to control it (e.g. matching an
 * email-bound invitation).
 */
export async function createTestUser(admin: SupabaseClient, email?: string): Promise<TestUser> {
  // crypto.randomUUID() rather than a counter: multiple test files run as
  // separate parallel workers, so a per-module counter can collide across
  // files and silently produce a duplicate email, which the public.users
  // unique index then rejects deep inside GoTrue's own user-creation flow.
  const resolvedEmail = email ?? `rls-test-${crypto.randomUUID()}@example.com`;
  const password = "Test-Password-123!";

  const { data, error } = await admin.auth.admin.createUser({
    email: resolvedEmail,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createTestUser: failed to create user — ${error?.message}`);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, noPersistAuth);
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
    email: resolvedEmail,
    password,
  });
  if (signInError || !signInData.session) {
    throw new Error(`createTestUser: failed to sign in — ${signInError?.message}`);
  }

  return {
    userId: data.user.id,
    email: resolvedEmail,
    accessToken: signInData.session.access_token,
    client,
  };
}
