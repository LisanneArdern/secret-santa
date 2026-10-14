import { createClient, type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// Deliberately exports only POST, no GET: the magic-link email (see
// supabase/templates/magic_link.html) points at a page carrying
// `token_hash` and `type` as query params, and that page's confirm button
// is what calls this endpoint — never the page load itself. An email
// security scanner pre-fetching the link only ever triggers a GET, which
// this route doesn't handle, so the token is never consumed before the
// real user presses the button (AC-EDGE-09).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { token_hash?: string; type?: string }
    | null;
  const tokenHash = body?.token_hash;
  const type = body?.type;

  if (!tokenHash || !type) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error || !data.session) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 401 });
  }

  // Magic-link sign-in never collects a display name, so this is the one
  // signal that sends a first-time user through the one-time /welcome
  // step before continuing wherever they were headed.
  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("display_name")
    .eq("id", data.session.user.id)
    .maybeSingle();

  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: data.session.user.id,
    email: data.session.user.email,
    needsDisplayName: !profile?.display_name,
  });
}
