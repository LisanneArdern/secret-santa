import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const getSession = vi.fn();
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession } }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { JoinRoundButton } from "./join-round-button";

describe("JoinRoundButton", () => {
  beforeEach(() => {
    push.mockReset();
    getSession.mockReset();
    fetchMock.mockReset();
  });

  it("offers to sign in first when there's no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<JoinRoundButton token="tok123" invitationEmail={null} />);

    const signInButton = await screen.findByRole("button", { name: "Sign in to join" });
    await userEvent.setup().click(signInButton);

    expect(push).toHaveBeenCalledWith("/sign-in?next=%2Finvite%2Ftok123");
  });

  it("includes the invitation's bound email when redirecting to sign in", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<JoinRoundButton token="tok123" invitationEmail="bound@example.com" />);

    const signInButton = await screen.findByRole("button", { name: "Sign in to join" });
    await userEvent.setup().click(signInButton);

    const [[url]] = push.mock.calls;
    expect(new URLSearchParams(url.split("?")[1]).get("email")).toBe("bound@example.com");
  });

  it("joins the round when a session exists", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "token-abc" } } });
    fetchMock.mockResolvedValue({ ok: true });
    render(<JoinRoundButton token="tok123" invitationEmail={null} />);

    const joinButton = await screen.findByRole("button", { name: "Join round" });
    await userEvent.setup().click(joinButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/invitations/tok123/accept",
        expect.objectContaining({
          method: "POST",
          headers: { authorization: "Bearer token-abc" },
        }),
      ),
    );
    expect(await screen.findByText(/You're in/)).toBeInTheDocument();
  });

  it("shows a plain-language error for a rejected join", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "token-abc" } } });
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "email_mismatch" }) });
    render(<JoinRoundButton token="tok123" invitationEmail="bound@example.com" />);

    const joinButton = await screen.findByRole("button", { name: "Join round" });
    await userEvent.setup().click(joinButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("different email address");
  });
});
