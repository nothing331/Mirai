# Editable AI Image Editor

An image editor where users select a region, apply a localized AI or deterministic edit, preserve everything outside the selection, and retain reversible history.

## Status

The first browser-only milestone is implemented: upload a PNG/JPEG, draw a closed contour to select its interior, refine the filled mask with a brush or eraser, preview and accept a luminance-preserving recolor, and export at source dimensions.

Documentation:

- [PROJECT.md](./PROJECT.md): product scope, architecture, editing pipeline, and decisions
- [LOCAL_DEVELOPMENT_PLAN.md](./LOCAL_DEVELOPMENT_PLAN.md): build order, milestones, and deliverables
- [AGENTS.md](./AGENTS.md): rules and context routing for coding agents

## Local setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Session data is intentionally browser-only and is cleared on refresh.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` to verify the application. The browser smoke test is available through `npm run test:e2e` after installing Playwright Chromium.
