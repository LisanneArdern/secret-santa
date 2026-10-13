import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InvitationSummary } from "@/lib/invitation-summary";

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({}),
}));

vi.mock("./join-round-button", () => ({
  JoinRoundButton: () => <button type="button">Join round</button>,
}));

const getInvitationSummary = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invitation-summary", () => ({ getInvitationSummary }));

import InvitePage from "./page";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

function baseInvitation(overrides: Partial<InvitationSummary> = {}): InvitationSummary {
  return {
    id: "inv-1",
    email: null,
    expiresAt: future,
    revokedAt: null,
    status: "invited",
    round: {
      name: "Family Christmas",
      budgetAmount: "25.00",
      budgetCurrency: "GBP",
      exchangeDate: "2026-12-25T00:00:00.000Z",
      exchangePlace: "Grandma's house",
      organiserDisplayName: "Alice",
    },
    ...overrides,
  };
}

describe("InvitePage", () => {
  it("renders the round summary and join button for a valid invite", async () => {
    getInvitationSummary.mockResolvedValue(baseInvitation());
    const element = await InvitePage({ params: Promise.resolve({ token: "tok123" }) });
    render(element);

    expect(screen.getByRole("heading", { name: "Family Christmas" })).toBeInTheDocument();
    expect(screen.getByText(/Alice invited you/)).toBeInTheDocument();
    expect(screen.getByText(/25.00 GBP/)).toBeInTheDocument();
    expect(screen.getByText("Grandma's house")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join round" })).toBeInTheDocument();
  });

  it("shows a plain-language message for a revoked invite, with no join button", async () => {
    getInvitationSummary.mockResolvedValue(
      baseInvitation({ revokedAt: new Date().toISOString() }),
    );
    const element = await InvitePage({ params: Promise.resolve({ token: "tok123" }) });
    render(element);

    expect(screen.getByText(/turned off by the organiser/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join round" })).not.toBeInTheDocument();
  });

  it("shows a plain-language message for an expired invite", async () => {
    getInvitationSummary.mockResolvedValue(baseInvitation({ expiresAt: past }));
    const element = await InvitePage({ params: Promise.resolve({ token: "tok123" }) });
    render(element);

    expect(screen.getByText(/expired/)).toBeInTheDocument();
  });

  it("renders Next's not-found flow for an unknown token", async () => {
    getInvitationSummary.mockResolvedValue(null);
    await expect(
      InvitePage({ params: Promise.resolve({ token: "unknown" }) }),
    ).rejects.toThrow();
  });
});
