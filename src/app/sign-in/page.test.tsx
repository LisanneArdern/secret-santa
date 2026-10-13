import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithOtp } }),
}));

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import SignInPage from "./page";

describe("SignInPage", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    searchParams = new URLSearchParams();
  });

  it("shows a validation error for an invalid email without calling Supabase", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send sign-in link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("valid email");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends the magic link to the origin when no `next` is given, and shows a confirmation", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText("Email address"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await waitFor(() =>
      expect(signInWithOtp).toHaveBeenCalledWith({
        email: "alice@example.com",
        options: { emailRedirectTo: `${window.location.origin}/` },
      }),
    );
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
  });

  it("forwards `next` into emailRedirectTo when arriving from the invite page", async () => {
    searchParams = new URLSearchParams({ next: "/invite/abc123" });
    signInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText("Email address"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await waitFor(() =>
      expect(signInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { emailRedirectTo: `${window.location.origin}/invite/abc123` },
        }),
      ),
    );
  });

  it("pre-fills the email address when given", () => {
    searchParams = new URLSearchParams({ email: "bound@example.com" });
    render(<SignInPage />);
    expect(screen.getByLabelText("Email address")).toHaveValue("bound@example.com");
  });

  it("shows a plain-language error if sending fails", async () => {
    signInWithOtp.mockResolvedValue({ error: { message: "rate limited" } });
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText("Email address"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Send sign-in link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't send the link");
  });
});
