import { render, screen, waitFor } from "@testing-library/react";
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

import MyGifteePage from "./page";

describe("MyGifteePage", () => {
  beforeEach(() => {
    push.mockReset();
    getSession.mockReset();
    fetchMock.mockReset();
  });

  it("redirects to sign-in when there's no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<MyGifteePage />);

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/sign-in?next=/rounds/round-1/giftee"),
    );
  });

  it("shows a message before the draw has happened", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ drawn: false, round: {} }),
    });
    render(<MyGifteePage />);

    expect(await screen.findByText(/draw hasn't happened yet/)).toBeInTheDocument();
  });

  it("[AC-PRIV-03] shows the giftee's name, wishes, and notes with no giver information anywhere", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        drawn: true,
        round: { budgetAmount: "25.00", budgetCurrency: "GBP", exchangeDate: null, exchangePlace: "Grandma's" },
        giftee: { displayName: "Bob", wishes: "Warm socks", notes: "Allergic to wool" },
      }),
    });
    render(<MyGifteePage />);

    expect(await screen.findByText(/Bob/)).toBeInTheDocument();
    expect(screen.getByText("Warm socks")).toBeInTheDocument();
    expect(screen.getByText("Allergic to wool")).toBeInTheDocument();
    expect(screen.getByText(/25.00 GBP/)).toBeInTheDocument();
    expect(screen.getByText("Grandma's")).toBeInTheDocument();
    expect(screen.queryByText(/drew|giver/i)).not.toBeInTheDocument();
  });

  it("shows a plain message when the giftee hasn't added wishes", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        drawn: true,
        round: {},
        giftee: { displayName: "Bob", wishes: null, notes: null },
      }),
    });
    render(<MyGifteePage />);

    expect(await screen.findByText(/haven't added any wishes yet/)).toBeInTheDocument();
  });

  it("shows an error for someone who isn't a participant", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    render(<MyGifteePage />);

    expect(await screen.findByText(/not part of this round/)).toBeInTheDocument();
  });
});
