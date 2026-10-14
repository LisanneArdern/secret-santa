import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

const getSession = vi.fn();
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession } }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import WelcomePage from "./page";

describe("WelcomePage", () => {
  beforeEach(() => {
    push.mockReset();
    getSession.mockReset();
    fetchMock.mockReset();
    searchParams = new URLSearchParams({ next: "/rounds/round-1" });
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  });

  it("saves the name and continues to `next` on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ displayName: "Bob" }) });
    const user = userEvent.setup();
    render(<WelcomePage />);

    await user.type(screen.getByLabelText("Your name"), "Bob");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ display_name: "Bob" }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/rounds/round-1");
  });

  it("shows a plain-language error for an empty name", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "empty" }) });
    const user = userEvent.setup();
    render(<WelcomePage />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your name");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a plain-language error for a name that's too long", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "too_long", maxLength: 60 }) });
    const user = userEvent.setup();
    render(<WelcomePage />);

    await user.type(screen.getByLabelText("Your name"), "a".repeat(61));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("too long");
  });
});
