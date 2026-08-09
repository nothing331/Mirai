# Editable AI Image Editor

An image editor where users can make focused local edits or transform the complete image, review every proposal, and retain reversible history.

## Status

The finished v0.1 editor supports Lasso-based selection and AI editing, direct color painting with draft-only erasing, local recoloring, generative Remove/Replace/Restyle previews, preset-driven full-image Transform, immutable linear undo/redo, durable local projects, diagnostics, and original-resolution PNG/JPEG export. A deterministic fake provider is enabled by default, so the complete workflow runs without an API key.

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

Choose **Transform** in the left tool rail, or press `T`, to open its options in the extended sidebar and reinterpret the complete image without drawing a selection. Choose Monochrome, Sketch, Old Cartoon, Cinematic, Anime Theme, or a custom direction, optionally refine it with a prompt, and select a preservation level. Faithful is the default. Plain Monochrome is processed locally without a provider call; other transformations use source planning, one image request, and post-generation semantic validation. Hover or focus any rail icon to see its full tool name and shortcut.

## Request diagnostics

Every generative edit creates a local evidence bundle under:

```text
.local-edit/diagnostics/<project-id>/<request-id>/
```

Open **Diagnostics** in the editor to compare the source image, effective masks, planner views, provider inputs, raw and normalized candidates, scope change map, and final preview. Replace requests record the intent-planner and image-editor calls separately, including both OpenAI request IDs, models, timings, usage, the structured edit plan, candidate analysis, and sanitized responses. Transform requests record their source preservation plan, recipe version, preservation level, resolved instruction, application-owned full-image mask, maskless image-editor call, candidate fidelity assessment, and validator evidence. Extend records separate planning and generation requests with its scene analysis, adaptive solver decision, frozen Smart Reframe geometry, provider canvas, provider mask, raw output, dimension-normalized complete proposal, and full-output mask. Use **Copy for coding agent** to copy the IDs and absolute `manifest.json` path needed to investigate a strange result.

The newest ten completed unpinned bundles are retained globally. Pin an important request before further testing to prevent automatic pruning. Pinned bundles have no automatic size limit.

Diagnostic bundles contain exact prompts and copies of personal images. They are excluded from Git, but the diagnostic APIs have no authentication and must only be used through a locally bound development server.

## Image provider

Copy `.env.example` to `.env.local` when provider configuration is needed. The default is:

```bash
IMAGE_EDIT_PROVIDER=fake
```

For an optional real OpenAI smoke test, set `IMAGE_EDIT_PROVIDER=openai` and provide `OPENAI_API_KEY` in `.env.local`. Keys are read only by the server route and must never be committed.

Replace operations first use `gpt-5-nano-2025-08-07` to interpret the selected scene and turn short instructions into a structured physical placement plan. Transform uses the same configurable vision model before generation to lock source content and after generation to assess semantic fidelity. The vision model is configured with `OPENAI_EDIT_PLANNER_MODEL` and does not generate pixels. If source planning fails, the image request is not sent; if Transform validation fails afterward, the candidate is preserved but Faithful and Balanced acceptance fails closed.

Balanced image defaults are `gpt-image-2`, medium quality, a 1536px maximum provider-input edge, one candidate, manual retries, and three confirmed image calls per uploaded project. Planning and validation calls do not consume that image-call budget. Opening or replacing the image resets the project budget. Configure image generation with `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `OPENAI_IMAGE_MAX_EDGE`, and `OPENAI_MAX_REQUESTS_PER_SESSION`. For minimum cost, use low quality and a 1024px edge. Localized provider candidates are scaled back to source dimensions and shown intact by default; **Protect outside selection** enables the legacy exact-mask composite. Transform requests an explicit source-aligned output size and rejects material aspect mismatches instead of stretching them. Smart Extend uses a cached `gpt-5.6-luna` scene analysis, deterministic crop/placement, and a separate `gpt-image-2` edit that is always low quality; configure its model names and provider working edge with `OPENAI_EXTEND_PLANNER_MODEL`, `OPENAI_EXTEND_IMAGE_MODEL`, and `OPENAI_EXTEND_PROVIDER_MAX_EDGE`. The adapter intentionally omits `input_fidelity` because GPT Image 2 handles high-fidelity image input automatically and does not accept that option.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` to verify the application. The browser workflow test is available through `npm run test:e2e` after installing Playwright Chromium with `npx playwright install chromium`.
