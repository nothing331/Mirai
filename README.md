# Editable AI Image Editor

An image editor where users select a region, apply a localized AI or deterministic edit, preserve everything outside the selection, and retain reversible history.

## Status

The finished v0.1 editor supports closed-region selection, local recoloring, generative Remove/Restyle previews, immutable linear undo/redo, original/previous comparison, durable local projects, and original-resolution PNG/JPEG export. A deterministic fake provider is enabled by default, so the complete workflow runs without an API key.

Documentation:

- [PROJECT.md](./PROJECT.md): product scope, architecture, editing pipeline, and decisions
- [LOCAL_DEVELOPMENT_PLAN.md](./LOCAL_DEVELOPMENT_PLAN.md): build order, milestones, and deliverables
- [AGENTS.md](./AGENTS.md): rules and context routing for coding agents

## Local setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Saved project metadata is stored in `.local-edit/projects.sqlite`; immutable accepted images and masks are stored under `.local-edit/assets/`. Add `.local-edit/` to backups if you want to retain local projects between machines.

## Request diagnostics

Every generative edit creates a local evidence bundle under:

```text
.local-edit/diagnostics/<project-id>/<request-id>/
```

Open **Diagnostics** in the editor to compare the source image, original and effective masks, provider inputs, raw and normalized candidates, and final composited preview. The drawer also shows prompts, processing stages, errors, timings, and provider configuration. Use **Copy for coding agent** to copy the IDs and absolute `manifest.json` path needed to investigate a strange result.

The newest ten completed unpinned bundles are retained globally. Pin an important request before further testing to prevent automatic pruning. Pinned bundles have no automatic size limit.

Diagnostic bundles contain exact prompts and copies of personal images. They are excluded from Git, but the diagnostic APIs have no authentication and must only be used through a locally bound development server.

## Image provider

Copy `.env.example` to `.env.local` when provider configuration is needed. The default is:

```bash
IMAGE_EDIT_PROVIDER=fake
```

For an optional real OpenAI smoke test, set `IMAGE_EDIT_PROVIDER=openai` and provide `OPENAI_API_KEY` in `.env.local`. Keys are read only by the server route and must never be committed.

Balanced defaults are `gpt-image-2`, medium quality, a 1536px maximum provider-input edge, one candidate, manual retries, and three confirmed real calls per uploaded project. Opening or replacing the image resets that project budget. Configure it with `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `OPENAI_IMAGE_MAX_EDGE`, and `OPENAI_MAX_REQUESTS_PER_SESSION`. For minimum cost, use low quality and a 1024px edge. Provider candidates are scaled back to source dimensions and still composited through the original full-resolution mask. The adapter intentionally omits `input_fidelity` because the current GPT Image 2 snapshot rejects that parameter on image edits.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` to verify the application. The browser workflow test is available through `npm run test:e2e` after installing Playwright Chromium with `npx playwright install chromium`.
