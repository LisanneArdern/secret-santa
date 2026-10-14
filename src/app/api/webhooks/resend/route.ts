import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// SPEC.md edge case: "Invite email bounces" -> "Invitation is marked as
// undeliverable and the organiser sees a warning" (AC-EDGE-08). Resend
// delivers webhooks signed the same way Svix signs its own (Resend uses
// Svix under the hood), so verification is the standard Svix recipe:
// read the raw body (the signature is computed over the exact bytes sent,
// so this must run before any JSON parsing), then verify against the
// three svix-* headers before trusting anything in the payload.
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "missing_headers" }, { status: 400 });
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    new Webhook(secret).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type !== "email.bounced") {
    // Other event types (delivered, opened, ...) aren't relevant here.
    return NextResponse.json({ ok: true });
  }

  const recipients = Array.isArray(event.data.to) ? (event.data.to as string[]) : [];
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const admin = getSupabaseAdminClient();
  await admin
    .from("invitations")
    .update({ status: "undeliverable" })
    .in("email", recipients)
    .eq("status", "invited");

  return NextResponse.json({ ok: true });
}
