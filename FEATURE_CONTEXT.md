# Feature Context

## Purpose

This file is the living index of implemented product features. It gives an engineer or coding agent enough context to trace behavior before changing it and to review the consequences afterward. Source code and tests are authoritative for exact implementation; `PROJECT.md` remains authoritative for project-wide architecture and product decisions.

Update every affected entry in the same pull request as a feature change. Add a new entry when a new feature is approved and implemented. Before raising the pull request, verify the entry against the final diff and test results.

## Entry requirements

Each feature entry should cover:

- user outcome and entry points
- end-to-end working flow
- important state, data, and invariants
- UI, business-logic, and server responsibilities
- failures and recovery behavior
- dependencies, limitations, and deliberate exclusions
- primary implementation and test references

Keep entries focused on current behavior. Link to project-wide decisions instead of duplicating them.

## Image intake and project lifecycle

**Outcome.** A user can upload a PNG or JPEG, begin an editing project, persist it locally, reopen it, and retain the original as an immutable asset.

**Working flow.** The editor validates the selected browser file, reads its source dimensions, and initializes client editing state. Project API calls delegate persistence to the local repository, which stores metadata in SQLite and image assets on the filesystem. Reopening reconstructs accepted versions, operations, masks, and the current-version pointer without rewriting the original image.

**Ownership and rules.** `EditorWorkspace` coordinates project commands and provider authorization; the workspace header exposes upload, open, save, export, and identity controls. The editor store owns temporary browser state. The project route is the server boundary, and the repository owns durable metadata/assets. The original and all accepted version assets are immutable. Unsupported or invalid input fails without creating usable project history.

**Limitations.** Storage is local-development infrastructure; authentication, collaboration, and cloud storage are deferred.

**Code and verification.** `src/features/editor/EditorWorkspace.tsx`, `src/features/editor/project-client.ts`, `src/features/editor/store.ts`, `src/app/api/projects/route.ts`, `src/server/storage/project-repository.ts`, `src/features/editor/store.test.ts`, and `e2e/editor.spec.ts`.

## Canvas navigation and source-space coordinates

**Outcome.** A user can view, pan, zoom, and reset an image while selections continue to align with the source pixels.

**Working flow.** `EditorCanvas` renders the current image with React Konva and maintains the display transform. Pointer positions are inverse-transformed from the viewport into source-image coordinates before selection state or mask rasterization uses them.

**Ownership and rules.** Canvas components own display interaction; coordinate functions own conversion math. Source dimensions remain independent from rendered dimensions. Pan and zoom must never mutate persisted selection coordinates.

**Failures and limits.** Incorrect transforms can silently target the wrong pixels, so scaling, translation, aspect-ratio, and non-square-image cases require focused tests.

**Code and verification.** `src/features/editor/EditorCanvas.tsx`, `src/features/editor/coordinates.ts`, `src/features/editor/coordinates.test.ts`, and `e2e/editor.spec.ts`.

## Selection creation and refinement

**Outcome.** A user can outline a focus region, receive conservative closed-contour cleanup, refine the mask with Add or Subtract inside Lasso, clear it from the canvas, and configure a deterministic or generative selection edit in one inspector.

**Working flow.** Source-space pointer samples form selection geometry. Cleanup removes unreliable contour artifacts and reports diagnostics. Draw creates a closed region; Add and Subtract rasterize source-space refinement strokes into the same full-resolution mask. A compact canvas chip identifies and clears the selection; the Lasso inspector owns edit type, prompt, color, and preview controls.

**Ownership and rules.** Geometry and cleanup modules handle deterministic selection logic; mask modules own rasterization; UI components collect and display interaction. Persisted selection hints and processing masks always use source-image coordinates and input dimensions. Empty masks are rejected before processing.

**Failures and limits.** Cleanup is deliberately conservative and is not semantic object detection. Users remain responsible for refinement, especially at image edges and on ambiguous contours.

**Code and verification.** `src/features/editor/selection-geometry.ts`, `src/features/editor/mask-cleanup.ts`, `src/features/editor/mask.ts`, `src/features/editor/workspace/SelectionChip.tsx`, `src/features/editor/workspace/EditorInspector.tsx`, their adjacent tests, and `e2e/editor.spec.ts`.

## Direct paint and draft erasing

**Outcome.** A user can paint colors directly onto the image, correct that pending paint with Eraser, and apply several gestures as one reversible edit.

**Working flow.** Brush gestures rasterize into a source-resolution RGBA draft layer above the current accepted version. Eraser removes alpha only from that draft layer, so it cannot remove original or previously accepted pixels. The canvas shows the draft immediately. Apply composites it onto the current version and routes one local `paint` operation through shared acceptance; Discard removes the draft without changing history. Selection and generative actions are blocked until pending paint is applied or discarded.

**Ownership and rules.** The editor store owns the temporary paint session and history transition; paint helpers own deterministic rasterization and compositing; canvas and inspector components collect gestures and expose Apply/Discard. Tool changes preserve pending paint, while image replacement and history navigation clear it. Paint outside the draft alpha remains byte-identical to its input.

**Failures and limits.** Paint is a flattened edit rather than a persistent layer. An applied paint operation can be undone as a whole, but its individual strokes cannot be edited afterward. Applying an entirely erased draft creates no operation or version. Pending paint is temporary browser state and is not included when a project is saved or reopened.

**Code and verification.** `src/features/editor/paint.ts`, `src/features/editor/store.ts`, `src/features/editor/EditorCanvas.tsx`, `src/features/editor/workspace/EditorInspector.tsx`, adjacent unit tests, and `e2e/editor.spec.ts`.

## Direct size and position

**Outcome.** A user can crop, resize, rotate, or flip the current accepted image while seeing the result directly on the ordinary canvas. Crop exposes a source-space frame with a shield, grid, draggable body, and transform handles. These operations never open the proposal-comparison stage.

**Working flow.** Selecting Size & position creates one temporary local draft based on the current immutable version. Inspector fields and canvas gestures update the same discriminated draft. Leaving an unchanged draft clears it silently; leaving a changed draft opens a Save edit / Discard changes / Keep editing decision. Save runs the deterministic pixel processor once, creates an input-sized effective mask, and routes one accepted operation and one immutable output version through shared history acceptance. Discard clears the draft without changing history. A dimension-changing save resets the fitted viewport and selection dimensions.

**Ownership and rules.** Geometry and overlay parameters remain in source-image coordinates. `local-transforms.ts` owns pixel mapping; the store owns draft validity, processing, mask creation, and history; the canvas and inspector collect intent only. A pending paint or local draft must be applied or discarded before another editing workflow begins. Resize may resample the complete image; crop, rotate, and flip never call a provider.

**Failures and limits.** Invalid or stale drafts fail without advancing history. Crop is rectangular, rotation is limited to quarter turns, and resize is deterministic bitmap resampling rather than AI upscaling. Applied geometry is flattened into an immutable version and adjusted later through Undo or a new operation.

**Code and verification.** `src/features/editor/local-transforms.ts`, `src/features/editor/EditorCanvas.tsx`, `src/features/editor/workspace/SizePositionInspector.tsx`, `src/features/editor/store.ts`, `src/features/editor/local-transforms.test.ts`, `src/features/editor/store.test.ts`, and `e2e/editor.spec.ts`.

## Live text and watermark overlays

**Outcome.** Text appears on the image as the user types. Text and text/PNG watermarks can be dragged with a grab cursor, resized and rotated with canvas handles, nudged with arrow keys, positioned through watermark anchors, applied as one reversible edit, or discarded without history.

**Working flow.** Text and Watermark rail selections create a source-space local draft. Inspector changes update the Konva node immediately; pointer movement is visible inside Konva and commits source coordinates on gesture completion. Text includes a transparent hit surface across its full measured box so its visible area is draggable, while dragging an anchored watermark changes it to free positioning. Leaving a changed tool asks the user to save, discard, or keep editing. Save uses the shared overlay geometry and browser raster renderer, derives an exact changed-pixel mask, and creates one accepted operation/version without creating an `EditPreview`. Uploaded PNG watermark assets are persisted with the project so accepted operation references remain inspectable.

**Ownership and rules.** `TextOverlayParameters` and `WatermarkParameters` are application-owned contracts. UI code maps them explicitly to Konva properties rather than spreading provider- or renderer-specific attributes. The store validates the draft against its immutable input and owns Apply. Pixels outside the derived overlay mask remain byte-identical. Generated-edit comparison behavior is unaffected.

**Failures and limits.** Empty text and missing PNG assets cannot be applied. Direct drafts are temporary and are not saved independently; Apply flattens the overlay into an immutable image version. Repositioning an already applied overlay therefore requires Undo or another edit rather than persistent editable layers.

**Code and verification.** `src/features/editor/overlay-renderer.ts`, `src/features/editor/image-data.ts`, `src/features/editor/EditorCanvas.tsx`, `src/features/editor/workspace/TextInspector.tsx`, `src/features/editor/workspace/WatermarkInspector.tsx`, `src/features/editor/store.ts`, persistence clients/repository, `src/features/editor/store.test.ts`, and `e2e/editor.spec.ts`.

## Image-first workspace shell

**Outcome.** A user can operate Mirai as an image editor rather than a numbered form: direct tools remain in a compact rail, the active workflow occupies one contextual inspector, global commands stay in the header, and the canvas remains the visual anchor.

**Working flow.** The shell derives empty, ready, selected, processing, preview, and failed phases from editor state. Lasso exposes selection and AI/local selection operations, Brush and Eraser expose only paint controls, and Hand pans with the inspector automatically collapsed. The inspector can otherwise collapse without losing the active tool, selection, paint draft, prompt, preview, or history. Desktop uses a rail plus inspector, while narrow viewports place the rail and inspector beneath the canvas without page scrolling.

**Ownership and rules.** Workspace components own presentation and invoke existing store actions. `EditorWorkspace` retains project I/O and paid-provider authorization so relocated or future UI entry points cannot bypass identity restoration, confirmation, or request limits. Feature additions should use an explicit tool, inspector panel, command, dialog, or drawer; they must not append unrelated permanent sections or write history directly.

**Failures and recovery.** Processing, preview, and failure layouts are derived from the same request snapshot and preserve the current image and selection. Responsive layout changes and inspector collapse are observational and cannot change editing state.

**Code and verification.** `src/features/editor/EditorWorkspace.tsx`, `src/features/editor/workspace/`, `src/app/globals.css`, `src/features/editor/workspace/workspace-phase.test.ts`, and `e2e/editor.spec.ts`.

## Deterministic recolor and protected compositing

**Outcome.** A user can recolor a selected region locally while retaining luminance/texture and exact input pixels outside the effective mask.

**Working flow.** The local recolor processor transforms selected pixels deterministically. Controlled mask feathering defines the effective boundary, and compositing combines the result with the unchanged input. The result enters the same preview and acceptance flow as a generative candidate without making a provider call.

**Ownership and rules.** Recolor owns color transformation; composite owns pixel preservation. Deterministic operations and generative protected mode must preserve every input pixel outside the effective mask, keep source dimensions, and record explicit processing parameters.

**Failures and limits.** Local processing cannot invent missing content and must not be used for edits requiring scene generation.

**Code and verification.** `src/features/editor/recolor.ts`, `src/features/editor/composite.ts`, `src/features/editor/recolor.test.ts`, and `src/features/editor/composite.test.ts`.

## Generative Remove, Replace, and Restyle

**Outcome.** A user can request an AI Remove, Replace, or Restyle edit, review the provider's complete proposal by default, optionally enforce an exact protected boundary, and retry or discard failures without changing accepted history.

**Working flow.** The client sends the complete current image, same-size focus mask, operation, instruction, boundary policy, project ID, and request ID to the image-edit route. Server validation and application-owned contracts keep provider details out of the browser. Remove and Restyle call the image provider directly. Replace first builds a structured scene-aware plan, deterministically turns it into the generation instruction, and then calls the image provider. Replace planning treats subject instances intersecting the highlighted focus as authoritative, describes them spatially, protects similar unselected subjects, and forbids optional secondary edits. The normalized provider candidate is preserved as the review preview; protected mode composites it through the effective mask.

**Ownership and rules.** UI collects intent but never calls providers or writes history. The route parses and delegates. Planner/provider adapters and validation stay server-side. Diagnostics can analyze candidates but cannot modify them. A review-mode Replace candidate is classified as a scope mismatch when at least 25% of pixels outside the focus materially changed and at least 75% of all materially changed pixels are outside it. The complete candidate remains visible and diagnosable, but both the UI and shared acceptance transition block Accept and direct the user to discard/regenerate or use protected mode. Protected composites are not blocked because exact outside-mask restoration remains authoritative. Planner failure stops Replace before the image-generation call; any failed, discarded, or scope-blocked attempt leaves accepted state unchanged.

**Dependencies and limits.** Deterministic fake adapters are the default development/test path; optional OpenAI adapters require server credentials. Scope analysis is a conservative pixel heuristic rather than semantic image understanding, so a legitimate large replacement extending well beyond a small focus can require a larger selection or protected mode. Automatic operation classification and multiple providers are deferred.

**Code and verification.** `src/features/editor/generative-client.ts`, `src/app/api/image-edits/route.ts`, `src/server/ai/contracts.ts`, `src/server/ai/validate-request.ts`, planner/provider implementations in `src/server/ai/`, adjacent unit/route tests, and `e2e/editor.spec.ts`.

## Full-image Transform

**Outcome.** A user can transform the complete current image without drawing a selection. Transform is a first-class action in the left tool rail, also available with the `T` shortcut, and its expanded inspector offers Monochrome, Sketch, Old Cartoon, Cinematic, and Anime Theme recipes, a custom prompt path, and Faithful/Balanced/Imaginative preservation levels. Every rail icon exposes its full tool name on hover and keyboard focus.

**Working flow.** Selecting Transform expands the contextual sidebar and replaces the current canvas-tool inspector without changing the underlying canvas interaction mode. The inspector captures a versioned preset, optional creative direction, and preservation level, defaulting to Faithful. Plain Monochrome uses deterministic browser processing and makes no provider call; creative Monochrome and all other treatments capture an immutable request snapshot and call the existing image-edit route. A Transform-specific vision planner inventories the source subjects, geometry, framing, spatial relationships, and background structure without choosing a style. The server combines that preservation plan with the resolved preset and user direction, then calls the image provider with the complete source image and no inpainting mask. Transform requests an explicit source-aligned output aspect ratio and rejects materially mismatched provider dimensions instead of stretching them. After normalization, a second vision call compares the source and complete candidate for semantic fidelity; pixel change coverage informs scrutiny but never determines the verdict by itself. The complete candidate and its assessment enter the shared comparison flow. Adjust discards only the proposal and restores the retained Transform inspector; Accept creates one operation, one version, and one full-image mask asset.

**Ownership and rules.** Versioned recipes in `src/shared/transform-presets.ts` define the supported visual vocabulary; the planner describes source content but cannot select or expand the style. The server owns planning, recipe resolution, final instruction construction, provider output sizing, and post-generation fidelity assessment. The full-image effective mask remains application-owned for history and diagnostics and is intentionally not sent as an OpenAI inpainting mask. The editor store owns local Monochrome, immutable request snapshots, previews, assessments, and shared history transitions. Faithful and Balanced block acceptance when the validator reports semantic failure or validation is unavailable; Imaginative keeps such candidates manually reviewable. Transform never overwrites the original, never requires or consumes a user selection, never exposes protected-boundary behavior, and always preserves the complete provider proposal. Pending paint must be applied or discarded first; accepting Transform clears a potentially stale selection.

**Failures and recovery.** Unknown recipe versions, empty custom requests, invalid preservation levels, source-planner failures, provider errors, materially incorrect output aspect ratios, and session-budget exhaustion fail without advancing history. Validator failure occurs after image generation, so the complete candidate remains visible with an unavailable fail-closed assessment rather than being discarded. Semantic block verdicts preserve comparison and diagnostics but cannot advance Faithful or Balanced history. Retry reuses the exact client snapshot. Superseded responses are ignored. Local Monochrome remains available after the real-provider budget is exhausted.

**Dependencies and limits.** Generative Transform uses one image-provider request plus source-planning and candidate-validation vision calls, increasing latency and token cost in exchange for explicit content locks and post-generation evidence. The real-request session budget counts image generation calls; the surrounding vision calls are disclosed but do not consume that image-call allowance. Semantic assessment is model judgment rather than a pixel-identity guarantee. The feature produces one candidate at a time and does not accept style-reference images or user-created preset recipes. Image quality and maximum provider-input edge remain deployment configuration rather than preservation controls.

**Code and verification.** `src/features/editor/workspace/TransformInspector.tsx`, `src/features/editor/workspace/ToolRail.tsx`, `src/features/editor/workspace/CanvasFrame.tsx`, `src/features/editor/EditorWorkspace.tsx`, `src/features/editor/store.ts`, `src/features/editor/monochrome.ts`, `src/shared/transform-presets.ts`, `src/shared/transform-fidelity.ts`, Transform planner/validator/provider adapters in `src/server/ai/`, `src/app/api/image-edits/route.ts`, their adjacent tests, and `e2e/editor.spec.ts`.

## Smart Extend and aspect-ratio reframing

**Outcome.** A user can adapt the current image to YouTube, Instagram, Story/Reel, square, portrait, or landscape formats without drawing a selection or entering dimensions. Extend is a first-class rail tool with the `X` shortcut. Smart Reframe is the default and may conservatively trim low-value outer space; Keep full image forbids cropping. The proposed crop, source placement, output dimensions, and generated area are shown before the image request.

**Working flow.** The inspector captures a versioned target preset, Smart/Keep-full strategy, and optional direction. A separate planning request analyzes each immutable source version once, returning normalized subject, text, horizon, visual-center, negative-space, and edge-continuation evidence. The editor caches that evidence by version; subsequent preset, strategy, or direction changes solve locally without another image upload or planner request. Application-owned adaptive geometry compares the preferred crop with the minimum padded span required by must-preserve subjects and important text, evaluates safe origins against negative space and visual-center evidence, and records the chosen integer crop, unscaled source placement, target canvas, expansion insets, seam, candidate count, and fallback reason. It preserves the complete image only when requested, confidence is low, or protected content genuinely spans the crop axis. Generation validates the frozen v1-or-v2 plan, keeps the planned frame visible with staged progress, constructs an aligned transparent provider canvas and same-size alpha mask, and calls GPT Image 2 at fixed low quality. The server removes provider-only alignment padding and resizes the complete provider proposal to the planned output dimensions without pasting source pixels over it. The browser creates the full-output history mask directly, shows comparison as soon as decoding finishes, and uploads its diagnostic preview asynchronously. The review canvas always shows the immutable comparison source beside the complete generated proposal. Accept creates one dimension-changing version and one operation; undo/redo, persistence, and export follow each version's own dimensions.

**Ownership and rules.** Versioned presets and planning contracts live in `src/shared/`; the semantic planner identifies evidence but cannot choose final coordinates. The deterministic solver owns crop and placement, never scales retained source content, enforces padded containment of must-preserve subjects and important text, and keeps exact rational output dimensions. Solver v2 decision evidence makes adaptive crop expansion and preserve-all fallbacks inspectable; generation remains compatible with frozen v1 plans. Server routes own plan validation, provider-only scaling/alignment, prompt construction, mask conversion, and lossless-format candidate normalization. Normalization may crop provider padding and resize to the planned dimensions but cannot composite the source or otherwise alter provider content. UI components request planning/generation but never call OpenAI or write history. Diagnostic upload is observational and cannot delay or fail the usable preview. Extend does not consume the current selection, does not overwrite the original, and cannot accept a stale plan after the current version changes. Pending paint must be resolved first.

**Failures and recovery.** Planner, schema, plan-validation, provider, dimension, or normalization failures do not advance history. Planner confidence below the policy threshold produces a safe preserve-all plan. A failed semantic planning request can be retried or replaced with Keep full image after planning becomes available. Generation produces one reviewable candidate; Adjust returns to the retained plan, Discard removes only the proposal, and late results for a superseded input version are ignored. The real-provider session allowance counts generation but not frame planning.

**Dependencies and limits.** OpenAI planning defaults to `gpt-5.6-luna`; image generation is `gpt-image-2` with low quality fixed for Extend. Fake adapters provide deterministic local development. Adaptive solving removes avoidable preserve-all fallbacks and cached replanning is local, but the initial semantic analysis and image generation remain external latency. The UI reports honest stages without fabricated percentages. v1 has six maintained aspect presets, one candidate, automatic placement, and an optional text direction. Freeform handles, custom dimensions, manual source dragging, multiple variants, batch generation, reference images, automatic semantic post-validation, automatic planner-model selection, and exact platform export resolutions are deferred. The complete generated image is reviewable and may contain provider changes inside the supplied source region; the source remains available beside it for comparison.

**Code and verification.** `src/shared/extend-presets.ts`, `src/shared/extend-plan.ts`, `src/server/ai/extend-*`, `src/app/api/image-extends/`, `src/features/editor/extend-client.ts`, `src/features/editor/workspace/ExtendInspector.tsx`, `src/features/editor/workspace/CanvasFrame.tsx`, `src/features/editor/store.ts`, adjacent unit tests, and `e2e/editor.spec.ts`.

## Preview, comparison, and immutable history

**Outcome.** A user can compare an edit proposal with accepted images, accept or discard it, and navigate linear undo/redo history.

**Working flow.** A successful processor result creates a preview but does not advance history. Accepting saves one immutable output asset, creates exactly one `EditOperation` and one `ImageVersion`, and advances the current pointer. Discarding removes the pending proposal from the workflow. Undo/redo move the pointer among immutable versions; accepting after undo truncates the redo branch to preserve a linear model.

**Ownership and rules.** The editor store coordinates temporary preview and selected-version state through the shared edit flow. UI components may request transitions but must not write history directly. Failed or discarded attempts create no accepted version, and the original remains unchanged.

**Limitations.** v0.1 does not support branching history, arbitrary operation toggling, or independent layers.

**Code and verification.** `src/features/editor/store.ts`, `src/features/editor/types.ts`, `src/features/editor/workspace/CanvasFrame.tsx`, `src/features/editor/store.test.ts`, and `e2e/editor.spec.ts`.

## Request diagnostics

**Outcome.** A developer can inspect, compare, pin, retain, and hand off the evidence for a generative attempt without affecting its result.

**Working flow.** One application request ID follows an attempt through the client, route, optional Replace planner, Transform planning/validation, or Extend planning/generation call, image-provider call, preview, and accepted operation. Extend planning and generation are separate diagnostic requests; both preserve the shared scene analysis and frozen geometry plan. Solver-v2 planning records the crop axis, preferred size, minimum protected span, chosen size, candidate count, and fallback reason. Generation additionally records the padded provider input, provider mask, raw proposal, dimension-normalized complete proposal, output-sized effective mask, and asynchronously supplied output-sized browser preview. Other edit previews remain source-sized. The diagnostic service writes a schema-versioned manifest and inspectable artifacts under `.local-edit/diagnostics/<project-id>/<request-id>/`, indexes metadata in SQLite, and exposes it through the diagnostics API/drawer. Retention keeps the newest ten completed unpinned bundles globally; pinned bundles are exempt.

**Ownership and rules.** Diagnostics observe the pipeline. Diagnostic failure must never change edit status, preview pixels, history, or provider behavior. Stored artifacts include personal images and prompts and remain Git-ignored/local-only.

**Code and verification.** `src/features/diagnostics/`, `src/app/api/request-logs/route.ts`, `src/server/diagnostics/`, `src/shared/request-diagnostics.ts`, and adjacent repository tests.

## Export

**Outcome.** A user can export the currently selected accepted version as PNG or JPEG with explicit dimensions.

**Working flow.** Export reads the accepted current-version asset and encodes it in the chosen format. It does not replay operations, call an image provider, accept a pending preview, or overwrite the original.

**Ownership and rules.** The editor UI initiates export from accepted state; image/file handling preserves the selected dimensions. Provider-call absence and dimension preservation are required invariants.

**Code and verification.** `src/features/editor/workspace/WorkspaceHeader.tsx`, `src/features/editor/image-data.ts`, `src/server/storage/project-repository.ts`, and `e2e/editor.spec.ts`.

## Template for a new feature

Copy this structure after the feature is approved:

```markdown
## Feature name

**Outcome.** What the user can accomplish and where they enter the flow.

**Working flow.** The end-to-end path through UI, business logic, server, persistence, and external services as applicable.

**Ownership and rules.** State, contracts, invariants, and responsibility boundaries.

**Failures and recovery.** Expected failure states, user feedback, retries, and guarantees about unchanged state.

**Dependencies and limits.** External dependencies, deliberate exclusions, risks, and known limitations.

**Code and verification.** Primary implementation files and behavior-focused tests.
```
