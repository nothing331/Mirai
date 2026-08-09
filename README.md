# Editable AI Image Editor

An image editor where users select a region, apply a localized AI or deterministic edit, preserve everything outside the selection, and retain reversible history.

## Status

The editor supports one-result AI creation for icon/logo marks, complete images, and whole-image transformations, plus Lasso-based AI editing, direct color painting with draft-only erasing, local recoloring, generative Remove/Replace/Restyle previews, immutable linear undo/redo, durable local projects, diagnostics, and original-resolution PNG/JPEG export. Deterministic fake providers are enabled by default, so every workflow runs without an API key.

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

Mirai keeps direct canvas tools in the left rail and shows only the active workflow in the adjacent inspector. Lasso owns Draw/Add/Subtract selection and all selection-based generation. Brush paints a temporary color layer; Eraser removes only that pending paint; Apply records the complete paint session as one reversible edit. Apply before saving or reloading because pending paint is not persisted. Hand pans the image and hides the inspector because it has no settings. Use `L`, `B`, `E`, and `H` for those tools, and `Cmd/Ctrl + Z` or `Cmd/Ctrl + Shift + Z` for undo and redo.

From the empty canvas or sparkle button in the tool rail, **Create with AI** opens three modes. **Mark** collects a structured icon/logo brief and removes its constrained matte locally. **Image** creates a complete image from text. **Transform** accepts one temporary PNG/JPEG reference and preserves its unrequested content while applying a whole-image instruction. Image and Transform support 1024 × 1024, 1536 × 1024, and 1024 × 1536. Every mode makes one low-quality request for one result. Using it opens and auto-saves a new project original with zero edit operations; closing the dialog discards the temporary result and transform reference.

## Request diagnostics

Every generative edit creates a local evidence bundle under:

```text
.local-edit/diagnostics/<project-id>/<request-id>/
```

Open **Diagnostics** in the editor to compare the source image, selection and provider-focus masks, planner views, provider inputs, raw and normalized candidates, scope change map, and final preview. Replace requests record the intent-planner and image-editor calls separately, including both OpenAI request IDs, models, timings, usage, the structured edit plan, candidate analysis, and sanitized responses. Use **Copy for coding agent** to copy the IDs and absolute `manifest.json` path needed to investigate a strange result.

The newest ten completed unpinned bundles are retained globally. Pin an important request before further testing to prevent automatic pruning. Pinned bundles have no automatic size limit.

Diagnostic bundles contain exact prompts and copies of personal images. They are excluded from Git, but the diagnostic APIs have no authentication and must only be used through a locally bound development server.

## Image provider

Copy `.env.example` to `.env.local` when provider configuration is needed. The default is:

```bash
IMAGE_EDIT_PROVIDER=fake
ASSET_GENERATION_PROVIDER=fake
```

For an optional real OpenAI smoke test, set `IMAGE_EDIT_PROVIDER=openai` and provide `OPENAI_API_KEY` in `.env.local`. Keys are read only by the server route and must never be committed.

Real popup creation is configured separately with `ASSET_GENERATION_PROVIDER=openai`. It defaults to `gpt-image-2`, always uses low quality, returns one result, and allows two confirmed requests per browser session. Configure the model and request limit with `OPENAI_ASSET_GENERATION_MODEL` and `OPENAI_ASSET_MAX_BATCHES_PER_SESSION`. Transform uses the Images edit endpoint with one high-fidelity source; Mark uses the generation endpoint and derives transparency locally without a second background-removal service.

Replace operations first use `gpt-5-nano-2025-08-07` to interpret the selected scene and turn short instructions into a structured physical placement plan. The planner is configured with `OPENAI_EDIT_PLANNER_MODEL`, uses two derived highlighted views, and does not generate pixels. If planning fails, the image request is not sent.

Balanced image defaults are `gpt-image-2`, medium quality, a 1536px maximum provider-input edge, one candidate, manual retries, and three confirmed image calls per uploaded project. Planner calls do not consume that image-call budget. Opening or replacing the image resets the project budget. Configure image generation with `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `OPENAI_IMAGE_MAX_EDGE`, and `OPENAI_MAX_REQUESTS_PER_SESSION`. For minimum cost, use low quality and a 1024px edge. Provider candidates are scaled back to source dimensions and shown intact by default; **Protect outside selection** enables the legacy exact-mask composite. The adapter intentionally omits `input_fidelity` because the current GPT Image 2 snapshot rejects that parameter on image edits.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` to verify the application. The browser workflow test is available through `npm run test:e2e` after installing Playwright Chromium with `npx playwright install chromium`.
