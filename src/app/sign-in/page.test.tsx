import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithOtp } }),
}));

import SignInPage from "./page";

describe("SignInPage", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
  });

  it("shows a validation error for an invalid email without calling Supabase", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send sign-in link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("valid email");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends the magic link and shows a confirmation", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(screen.getByLabelText("Email address"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "alice@example.com" }),
    ));
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
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
