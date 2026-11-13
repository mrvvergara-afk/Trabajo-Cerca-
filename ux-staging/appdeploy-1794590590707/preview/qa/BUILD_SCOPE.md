# Full frontend compilation, isolated (no production SDK)

This directory is reconstructed from AppDeploy live snapshot `1794590590707`,
with the four UX files overlaid from PR #60.

Run in CI (never use for production):
```bash
npm install --no-audit --no-fund
npm run build -- --config vite.qa.config.ts
```

`vite.qa.config.ts` resolves `@appdeploy/client` to `qa/appdeploy-client-stub.ts`.
The mock never contacts the backend and returns an empty feed.
This verifies import graph, React JSX/CSS, Vite code splitting, assets referenced by source.
It is **not** a real SDK integration test, app deployment or live catalog test.

A successful build means only that the frontend dependency graph compiles.
Run real SDK build, live application smoke tests, mobile visual QA and
catalog preservation checks before requesting authorization to deploy.
Missing binary icons in this reconstruction may generate warnings; they
are inherited deployment assets, not source code changes.
