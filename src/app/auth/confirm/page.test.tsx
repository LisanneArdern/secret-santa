import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const setSession = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { setSession } }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import ConfirmPage from "./page";

describe("ConfirmPage", () => {
  beforeEach(() => {
    push.mockReset();
    setSession.mockReset();
    fetchMock.mockReset();
    searchParams = new URLSearchParams({
      token_hash: "abc123",
      type: "email",
      next: "/my-rounds",
    });
  });

  it("[AC-EDGE-09] never calls the confirm API on render — only on the button press", () => {
    render(<ConfirmPage />);
    expect(screen.getByRole("button", { name: "Confirm sign-in" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirms, sets the session, and redirects to `next` on button press", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        userId: "user-1",
        email: "alice@example.com",
      }),
    });
    const user = userEvent.setup();
    render(<ConfirmPage />);

    await user.click(screen.getByRole("button", { name: "Confirm sign-in" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token_hash: "abc123", type: "email" }),
      }),
    );
    expect(setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(push).toHaveBeenCalledWith("/my-rounds");
  });

  it("redirects to /welcome, carrying `next` along, for a first-time user with no display name yet", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        userId: "user-1",
        email: "alice@example.com",
        needsDisplayName: true,
      }),
    });
    const user = userEvent.setup();
    render(<ConfirmPage />);

    await user.click(screen.getByRole("button", { name: "Confirm sign-in" }));

    expect(push).toHaveBeenCalledWith("/welcome?next=%2Fmy-rounds");
  });

  it("shows a plain-language error if the token is invalid or already used", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<ConfirmPage />);

    await user.click(screen.getByRole("button", { name: "Confirm sign-in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("expired or was already used");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a plain message when the link is missing required params", () => {
    searchParams = new URLSearchParams();
    render(<ConfirmPage />);
    expect(screen.getByText(/missing some information/)).toBeInTheDocument();
  });
});
