import { afterEach, beforeEach } from "vitest";
import { setEmailSenderForTesting } from "@/lib/email/get-email-sender";
import { FakeEmailSender } from "../factories/fake-email-sender";

// Most integration tests don't care about email at all — without this,
// every route that sends a notification would hit the real
// ResendEmailSender and throw on a missing RESEND_API_KEY. Tests that do
// care about email (tests/integration/notifications.test.ts) construct
// their own FakeEmailSender and call setEmailSenderForTesting again in
// their own beforeEach, which runs after this one and overrides it.
beforeEach(() => {
  setEmailSenderForTesting(new FakeEmailSender());
});

afterEach(() => {
  setEmailSenderForTesting(null);
});
