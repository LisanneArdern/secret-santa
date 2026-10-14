import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: "round-1" }),
}));

const getSession = vi.fn();
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession } }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import RoundPage from "./page";

const baseRound = {
  id: "round-1",
  name: "Family Christmas",
  budget_amount: "20.00",
  budget_currency: "GBP",
  signup_deadline: "2026-12-01T00:00:00.000Z",
  exchange_date: "2026-12-25T00:00:00.000Z",
  exchange_place: "Grandma's",
  wishes_required: false,
  organiser_participates: true,
  state: "open",
};

function mockFetchSequence(responses: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) => {
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return { ok: true, status: 200, json: async () => body };
      }
    }
    throw new Error(`Unmocked fetch: ${url}`);
  });
}

describe("RoundPage", () => {
  beforeEach(() => {
    push.mockReset();
    getSession.mockReset();
    fetchMock.mockReset();
  });

  it("redirects to sign-in when there's no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<RoundPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in?next=/rounds/round-1"));
  });

  it("shows the settings summary and invite form for the organiser", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mockFetchSequence({
      "/api/rounds/round-1/invitations": { invitations: [] },
      "/api/rounds/round-1": { round: baseRound, isOrganiser: true },
    });
    render(<RoundPage />);

    expect(await screen.findByRole("heading", { name: "Family Christmas" })).toBeInTheDocument();
    expect(screen.getByText(/20.00 GBP/)).toBeInTheDocument();
    expect(screen.getByText("Grandma's")).toBeInTheDocument();
    expect(screen.getByText("Nobody invited yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draw names" })).toBeInTheDocument();
  });

  it("does not show organiser controls to a participant", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mockFetchSequence({ "/api/rounds/round-1": { round: baseRound, isOrganiser: false } });
    render(<RoundPage />);

    await screen.findByRole("heading", { name: "Family Christmas" });
    expect(screen.queryByRole("button", { name: "Draw names" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nobody invited yet.")).not.toBeInTheDocument();
  });

  it("shows an error for a round the viewer can't access", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "not_found" }) });
    render(<RoundPage />);

    expect(await screen.findByText(/don't have access/)).toBeInTheDocument();
  });

  it("invites someone by email and adds them to the list", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mockFetchSequence({
      "/api/rounds/round-1/invitations": { invitations: [] },
      "/api/rounds/round-1": { round: baseRound, isOrganiser: true },
    });
    render(<RoundPage />);
    await screen.findByText("Nobody invited yet.");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invitation: { id: "inv-1", email: "friend@example.com", status: "invited", token: "tok123" } }),
    });

    fireEvent.change(screen.getByLabelText(/Invite by email/), {
      target: { value: "friend@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByText(/friend@example.com/)).toBeInTheDocument();
  });

  it("draws names and shows the drawn status", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mockFetchSequence({
      "/api/rounds/round-1/invitations": { invitations: [] },
      "/api/rounds/round-1": { round: baseRound, isOrganiser: true },
    });
    render(<RoundPage />);
    await screen.findByRole("button", { name: "Draw names" });

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ drawVersion: 1 }) });

    fireEvent.click(screen.getByRole("button", { name: "Draw names" }));

    expect(await screen.findByText("Names have been drawn.")).toBeInTheDocument();
  });

  it("shows the wishes form pre-filled for a participant, and saves changes", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mockFetchSequence({
      "/api/rounds/round-1/invitations": { invitations: [] },
      "/api/rounds/round-1": {
        round: baseRound,
        isOrganiser: false,
        participant: { id: "p1", status: "joined", wishes: "Books", notes: "Size M" },
      },
    });
    render(<RoundPage />);

    const wishesField = await screen.findByLabelText(/What would you like/);
    expect(wishesField).toHaveValue("Books");
    expect(screen.getByLabelText(/Sizes, allergies/)).toHaveValue("Size M");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    fireEvent.change(wishesField, { target: { value: "Board games" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my wishes" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rounds/round-1/wishes",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ wishes: "Board games", notes: "Size M" }),
      }),
    );
  });

  it("does not show the wishes form to a non-participating viewer", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mockFetchSequence({
      "/api/rounds/round-1/invitations": { invitations: [] },
      "/api/rounds/round-1": { round: baseRound, isOrganiser: true, participant: null },
    });
    render(<RoundPage />);

    await screen.findByRole("heading", { name: "Family Christmas" });
    expect(screen.queryByText("My wishes")).not.toBeInTheDocument();
  });

  it("shows a plain-language error when saving wishes fails", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mockFetchSequence({
      "/api/rounds/round-1/invitations": { invitations: [] },
      "/api/rounds/round-1": {
        round: baseRound,
        isOrganiser: false,
        participant: { id: "p1", status: "joined", wishes: null, notes: null },
      },
    });
    render(<RoundPage />);
    const wishesField = await screen.findByLabelText(/What would you like/);

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "too_long" }) });
    fireEvent.change(wishesField, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my wishes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("too long");
  });

  it("shows a plain-language error when the draw is blocked", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mockFetchSequence({
      "/api/rounds/round-1/invitations": { invitations: [] },
      "/api/rounds/round-1": { round: baseRound, isOrganiser: true },
    });
    render(<RoundPage />);
    await screen.findByRole("button", { name: "Draw names" });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ kind: "too_few_participants", minimumRequired: 3 }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Draw names" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("At least 3 people");
  });
});
