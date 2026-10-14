import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/domain/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          setupFiles: ["./tests/setup/component.ts"],
          include: ["src/app/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.{test,spec}.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
          // These hit one shared local Postgres/GoTrue instance; running
          // every file in its own parallel worker occasionally starved the
          // concurrency-sensitive draw/redraw tests under load. Integration
          // tests are a small share of the suite (SPEC.md's test-layer
          // table), so serializing files costs little and removes that
          // source of flakiness.
          fileParallelism: false,
          // Fixed values baked into every fresh local Supabase project
          // (same JWT_SECRET default everywhere `supabase init` hasn't
          // overridden it, which ours hasn't) — not secrets, and identical
          // on every machine and in CI. Route handlers under test read
          // these the same way they would real env vars in production.
          env: {
            NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
            NEXT_PUBLIC_SUPABASE_ANON_KEY:
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
            SUPABASE_SERVICE_ROLE_KEY:
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
            // Only used to authorize the cron routes under
            // src/app/api/cron/ — not a real secret, just needs to match
            // what tests send as the bearer token.
            CRON_SECRET: "test-cron-secret",
          },
        },
      },
    ],
  },
});
