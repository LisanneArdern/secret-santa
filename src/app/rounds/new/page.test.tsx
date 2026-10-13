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

import CreateRoundPage from "./page";

describe("CreateRoundPage", () => {
  beforeEach(() => {
    push.mockReset();
    getSession.mockReset();
    fetchMock.mockReset();
  });

  it("redirects to sign-in when there's no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<CreateRoundPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in?next=/rounds/new"));
  });

  it("validates a missing name before calling the API", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    const user = userEvent.setup();
    render(<CreateRoundPage />);

    await screen.findByText("Create a round");
    await user.type(screen.getByLabelText("Signup deadline"), "2026-12-01");
    await user.click(screen.getByRole("button", { name: "Create round" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("name");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a round and redirects to it", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ round: { id: "round-1" } }),
    });
    const user = userEvent.setup();
    render(<CreateRoundPage />);

    await screen.findByText("Create a round");
    await user.type(screen.getByLabelText("Round name"), "Family Christmas");
    await user.type(screen.getByLabelText("Signup deadline"), "2026-12-01");
    await user.click(screen.getByRole("button", { name: "Create round" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rounds",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/rounds/round-1");
  });

  it("shows a plain-language error when the API rejects the dates", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "signup_deadline_in_past" }),
    });
    const user = userEvent.setup();
    render(<CreateRoundPage />);

    await screen.findByText("Create a round");
    await user.type(screen.getByLabelText("Round name"), "Family Christmas");
    await user.type(screen.getByLabelText("Signup deadline"), "2020-01-01");
    await user.click(screen.getByRole("button", { name: "Create round" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("can't be in the past");
  });
});
