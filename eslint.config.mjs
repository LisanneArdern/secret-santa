import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Domain logic (the draw algorithm, lifecycle state machine, validation)
    // must stay framework- and database-free so it can be tested in isolation.
    // See SPEC.md "Tech stack" and ROADMAP.md Phase 1.
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "react",
            "react-dom",
            "next",
            "next/*",
            "@/db/*",
            "@/app/*",
            "@supabase/*",
            "drizzle-orm",
            "drizzle-orm/*",
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
