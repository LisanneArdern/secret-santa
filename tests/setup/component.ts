import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library's auto-cleanup only registers itself when it detects
// Jest-style test globals; we don't enable `test.globals` in vitest.config
// (prefer explicit imports), so it has to be wired up by hand.
afterEach(() => {
  cleanup();
});
