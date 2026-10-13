import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import * as confirmRoute from "../../src/app/api/auth/confirm/route";
import { getLatestMagicLinkParams } from "../factories/mailpit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function postConfirm(body: unknown) {
  return confirmRoute.POST(
    new Request("http://localhost/api/auth/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/auth/confirm", () => {
  it("[AC-EDGE-09] exports no GET handler, so a plain link open can never consume the token", () => {
    expect((confirmRoute as Record<string, unknown>).GET).toBeUndefined();
  });

  it("[AC-INV-04] verifies a real magic link once, and rejects reuse", async () => {
    const email = `confirm-test-${Date.now()}@example.com`;
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: otpError } = await anon.auth.signInWithOtp({ email });
    expect(otpError).toBeNull();

    const { tokenHash, type } = await getLatestMagicLinkParams(email);

    const firstResponse = await postConfirm({ token_hash: tokenHash, type });
    expect(firstResponse.status).toBe(200);
    const firstBody = await firstResponse.json();
    expect(firstBody.userId).toBeDefined();
    expect(firstBody.accessToken).toBeDefined();

    const secondResponse = await postConfirm({ token_hash: tokenHash, type });
    expect(secondResponse.status).toBe(401);
  });

  it("rejects a request missing token_hash or type", async () => {
    const response = await postConfirm({ token_hash: "whatever" });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid token_hash", async () => {
    const response = await postConfirm({ token_hash: "not-a-real-token", type: "email" });
    expect(response.status).toBe(401);
  });
});
