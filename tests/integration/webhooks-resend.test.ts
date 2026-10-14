import { Webhook } from "svix";
import { describe, expect, it } from "vitest";
import * as webhook from "../../src/app/api/webhooks/resend/route";
import { createAdminClient, createTestUser } from "../factories/supabase-clients";
import { createInvitation, createRound } from "../factories/round";

const TEST_WEBHOOK_SECRET = `whsec_${Buffer.from("test-secret-for-resend-webhook-signing").toString("base64")}`;

function signedRequest(body: unknown) {
  const payload = JSON.stringify(body);
  const id = `msg_${Date.now()}`;
  const timestamp = new Date();
  const signature = new Webhook(TEST_WEBHOOK_SECRET).sign(id, timestamp, payload);

  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
    body: payload,
  });
}

describe("POST /api/webhooks/resend", () => {
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

  it("[AC-EDGE-08] marks a bounced invite's invitation as undeliverable", async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    try {
      const admin = createAdminClient();
      const organiser = await createTestUser(admin);
      const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
      const invitation = await createInvitation(admin, { roundId: round.id, email: "bounced@example.com" });

      const response = await webhook.POST(
        signedRequest({ type: "email.bounced", data: { to: ["bounced@example.com"] } }),
      );
      expect(response.status).toBe(200);

      const { data: updated } = await admin.from("invitations").select("status").eq("id", invitation.id).single();
      expect(updated?.status).toBe("undeliverable");
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("ignores non-bounce events", async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    try {
      const admin = createAdminClient();
      const organiser = await createTestUser(admin);
      const round = await createRound(admin, { organiserId: organiser.userId, state: "open", currentDrawVersion: null });
      const invitation = await createInvitation(admin, { roundId: round.id, email: "delivered@example.com" });

      const response = await webhook.POST(
        signedRequest({ type: "email.delivered", data: { to: ["delivered@example.com"] } }),
      );
      expect(response.status).toBe(200);

      const { data: unchanged } = await admin.from("invitations").select("status").eq("id", invitation.id).single();
      expect(unchanged?.status).toBe("invited");
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("rejects a request with an invalid signature", async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    try {
      const request = new Request("http://localhost/api/webhooks/resend", {
        method: "POST",
        headers: {
          "svix-id": "msg_fake",
          "svix-timestamp": Math.floor(Date.now() / 1000).toString(),
          "svix-signature": "v1,not-a-real-signature",
        },
        body: JSON.stringify({ type: "email.bounced", data: { to: ["x@example.com"] } }),
      });

      const response = await webhook.POST(request);
      expect(response.status).toBe(400);
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("rejects a request missing svix headers", async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    try {
      const request = new Request("http://localhost/api/webhooks/resend", {
        method: "POST",
        body: JSON.stringify({ type: "email.bounced", data: {} }),
      });
      const response = await webhook.POST(request);
      expect(response.status).toBe(400);
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });
});
