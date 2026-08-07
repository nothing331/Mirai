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

**Outcome.** A user can transform the complete current image without drawing a selection. Transform is a first-class action in the left tool rail, also available with the `T` shortcut, and offers Monochrome, Sketch, Old Cartoon, Cinematic, and Anime Theme recipes, a custom prompt path, and Faithful/Balanced/Imaginative preservation levels.

**Working flow.** The Transform dialog captures a versioned preset, optional creative direction, and preservation level, defaulting to Faithful. Plain Monochrome uses deterministic browser processing and makes no provider call; creative Monochrome and all other treatments capture an immutable request snapshot and call the existing image-edit route. A Transform-specific vision planner inventories the source subjects, geometry, framing, spatial relationships, and background structure without choosing a style. The server combines that preservation plan with the resolved preset and user direction, then calls the image provider with the complete source image and no inpainting mask. Transform requests an explicit source-aligned output aspect ratio and rejects materially mismatched provider dimensions instead of stretching them. After normalization, a second vision call compares the source and complete candidate for semantic fidelity; pixel change coverage informs scrutiny but never determines the verdict by itself. The complete candidate and its assessment enter the shared comparison flow. Adjust discards only the proposal and reopens the retained controls; Accept creates one operation, one version, and one full-image mask asset.

**Ownership and rules.** Versioned recipes in `src/shared/transform-presets.ts` define the supported visual vocabulary; the planner describes source content but cannot select or expand the style. The server owns planning, recipe resolution, final instruction construction, provider output sizing, and post-generation fidelity assessment. The full-image effective mask remains application-owned for history and diagnostics and is intentionally not sent as an OpenAI inpainting mask. The editor store owns local Monochrome, immutable request snapshots, previews, assessments, and shared history transitions. Faithful and Balanced block acceptance when the validator reports semantic failure or validation is unavailable; Imaginative keeps such candidates manually reviewable. Transform never overwrites the original, never requires or consumes a user selection, never exposes protected-boundary behavior, and always preserves the complete provider proposal. Pending paint must be applied or discarded first; accepting Transform clears a potentially stale selection.

**Failures and recovery.** Unknown recipe versions, empty custom requests, invalid preservation levels, source-planner failures, provider errors, materially incorrect output aspect ratios, and session-budget exhaustion fail without advancing history. Validator failure occurs after image generation, so the complete candidate remains visible with an unavailable fail-closed assessment rather than being discarded. Semantic block verdicts preserve comparison and diagnostics but cannot advance Faithful or Balanced history. Retry reuses the exact client snapshot. Superseded responses are ignored. Local Monochrome remains available after the real-provider budget is exhausted.

**Dependencies and limits.** Generative Transform uses one image-provider request plus source-planning and candidate-validation vision calls, increasing latency and token cost in exchange for explicit content locks and post-generation evidence. The real-request session budget counts image generation calls; the surrounding vision calls are disclosed but do not consume that image-call allowance. Semantic assessment is model judgment rather than a pixel-identity guarantee. The feature produces one candidate at a time and does not accept style-reference images or user-created preset recipes. Image quality and maximum provider-input edge remain deployment configuration rather than preservation controls.

**Code and verification.** `src/features/editor/workspace/TransformDialog.tsx`, `src/features/editor/workspace/CanvasFrame.tsx`, `src/features/editor/EditorWorkspace.tsx`, `src/features/editor/store.ts`, `src/features/editor/monochrome.ts`, `src/shared/transform-presets.ts`, `src/shared/transform-fidelity.ts`, Transform planner/validator/provider adapters in `src/server/ai/`, `src/app/api/image-edits/route.ts`, their adjacent tests, and `e2e/editor.spec.ts`.

## Preview, comparison, and immutable history

**Outcome.** A user can compare an edit proposal with accepted images, accept or discard it, and navigate linear undo/redo history.

**Working flow.** A successful processor result creates a preview but does not advance history. Accepting saves one immutable output asset, creates exactly one `EditOperation` and one `ImageVersion`, and advances the current pointer. Discarding removes the pending proposal from the workflow. Undo/redo move the pointer among immutable versions; accepting after undo truncates the redo branch to preserve a linear model.

**Ownership and rules.** The editor store coordinates temporary preview and selected-version state through the shared edit flow. UI components may request transitions but must not write history directly. Failed or discarded attempts create no accepted version, and the original remains unchanged.

**Limitations.** v0.1 does not support branching history, arbitrary operation toggling, or independent layers.

**Code and verification.** `src/features/editor/store.ts`, `src/features/editor/types.ts`, `src/features/editor/workspace/CanvasFrame.tsx`, `src/features/editor/store.test.ts`, and `e2e/editor.spec.ts`.

## Request diagnostics

**Outcome.** A developer can inspect, compare, pin, retain, and hand off the evidence for a generative attempt without affecting its result.

**Working flow.** One application request ID follows an attempt through the client, route, optional Replace planner or Transform planning/validation calls, image-provider call, preview, and accepted operation. The diagnostic service writes a schema-versioned manifest and inspectable artifacts under `.local-edit/diagnostics/<project-id>/<request-id>/`, indexes metadata in SQLite, and exposes it through the diagnostics API/drawer. Retention keeps the newest ten completed unpinned bundles globally; pinned bundles are exempt.

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
