# Santa Swap

A small web app for running a family and friends Secret Santa.

- [`SPEC.md`](./SPEC.md) — the product spec and acceptance criteria.
- [`ROADMAP.md`](./ROADMAP.md) — the phased implementation plan.
- [`docs/traceability.md`](./docs/traceability.md) — every acceptance criterion mapped to the phase that closes it and the test that proves it.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

| Command | What it runs |
| --- | --- |
| `npm run lint` | ESLint, including the rule keeping `src/domain/**` framework- and database-free |
| `npm run typecheck` | Next.js route types + `tsc --noEmit` |
| `npm run test:unit` | Vitest — pure domain logic (`src/domain/**`) |
| `npm run test:component` | Vitest + Testing Library — UI components (jsdom) |
| `npm run test:integration` | Vitest — API routes and database access against a local Supabase instance |
| `npm run test:e2e` | Playwright — end-to-end journeys, desktop + mobile viewport |
| `npm run test:a11y` | Playwright + axe — accessibility checks per screen |
| `npm run build` | Production build |

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request; a failing check blocks merge.
