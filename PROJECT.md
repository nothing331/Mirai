# Editable AI Image Editor — Project Reference

## Product thesis

Most AI image tools replace an image with another generated result. This product treats AI as an editor: the user either indicates where a localized edit should focus or intentionally transforms the complete image, reviews the proposal, and can undo or compare every accepted change. Localized edits can opt into an exact protected boundary when preservation is more important than natural generative blending.

The v0.1 promise is:

> Upload an image, make a focused edit or transform the complete image, review the proposal, accept or undo it, and export the chosen version.

The project initially targets normal users rather than professional design workflows.

## Current state

The editor supports PNG/JPEG upload, pan and zoom, conservatively cleaned Lasso selection with internal Add/Subtract refinement, direct non-destructive paint drafts, live source-space Crop/Resize/Rotate/Flip drafts, draggable text and watermark overlays, deterministic selection recoloring, generative Remove/Replace/Restyle operations, preset-driven full-image Transform, and dimension-changing Smart Extend. The image-first workspace gives each canvas tool one job: Lasso owns selection edits and generation, Brush paints, Eraser corrects pending paint, Hand pans without an inspector, Size & position owns deterministic geometry, Text and Watermark own movable overlays, and the image-wide Transform and Extend workflows occupy the contextual inspector as first-class rail actions. Rail icons reveal their full names on hover or keyboard focus. Direct deterministic drafts update the ordinary canvas immediately and use Apply/Discard without comparison; Apply routes through shared immutable acceptance. Replace requests use a low-cost multimodal intent planner to turn short instructions into scene-aware structured plans before image generation. Generative Transform uses a separate source-content planner, deterministic recipe construction, maskless image editing, and post-generation semantic fidelity validation. Extend separates cached semantic scene analysis from deterministic crop/placement, previews its target frame before generation, and restores the retained source core after low-quality outpainting. Generative editing uses provider-neutral server boundaries, deterministic fake implementations by default, and optional OpenAI adapters. The complete normalized provider candidate is the default review preview for ordinary generative edits; protected localized edits and Extend apply application-owned exact compositing. Each request creates a reproducible diagnostic bundle with its timeline, masks, provider calls, prompts, plans or recipe configuration, candidate analysis, Transform fidelity assessment, change map, and final preview. Accepted operations, versions, masks, and referenced overlay assets form linear immutable history whose versions may have different dimensions, and projects can be saved to local SQLite metadata plus immutable filesystem assets, reopened, and exported as PNG or JPEG.

## v0.1 scope

The first complete vertical slice is:

```text
Upload → canvas → manual mask → local recolor → generative edit → history → export
```

### Included

- PNG and JPEG upload
- image canvas with pan and zoom
- conservative closed-contour cleanup with diagnostics and Lasso-owned Add/Subtract refinement
- direct color painting with draft-only erasing and one-step Apply/Discard
- compact on-canvas selection feedback with edit configuration in the contextual inspector
- deterministic recoloring
- localized generative removal or restyling
- full-image Monochrome, Sketch, Old Cartoon, Cinematic, Anime Theme, and custom transformations
- complete generative candidate review with optional exact protected masking
- preview acceptance and discard
- linear undo, redo, and comparison
- local project persistence
- original-resolution PNG or JPEG export

### Deferred

- authentication and payments
- collaboration
- cloud storage and background queues
- microservices
- multiple AI providers
- arbitrary independent layers
- automatic LLM prompt routing
- batch editing
- mobile applications
- text-to-image generation
- automatic object selection, unless the core milestones finish early

## Technology

- Next.js and TypeScript
- Tailwind CSS
- React Konva for canvas interaction
- Zustand for temporary editor state
- Next.js server routes
- Sharp for server-side provider input normalization
- SQLite via the portable `sql.js` runtime for local metadata
- local filesystem asset storage during development
- one image-edit provider behind an application-owned interface

This starts as a feature-oriented modular monolith. A small Python segmentation service may be introduced later if automatic object selection requires it.

## Planned structure

```text
src/
├── app/                  Pages and API entry points
├── features/
│   ├── canvas/           Rendering and coordinate conversion
│   ├── masking/          Lasso selection refinement and mask serialization
│   ├── editing/          Operations, routing, and orchestration
│   ├── diagnostics/      Request evidence browser and API client
│   ├── history/          Versions, undo, redo, and compare
│   └── projects/         Project metadata and persistence
├── server/
│   ├── ai/               Provider interface and adapter
│   ├── diagnostics/      Local request manifests, artifacts, and index
│   ├── image/            Local transforms, compositing, and export
│   └── storage/          Asset storage implementation
└── shared/               Small cross-boundary contracts and validation
```

Directories should be introduced with their first real behavior. Do not create speculative empty modules.

## Architectural boundaries

- Routes parse requests and delegate behavior; they do not contain image-processing logic.
- UI components depend on feature contracts, not provider SDKs or persistence clients.
- Every edit enters through the editing feature.
- Provider credentials, SDK calls, and response normalization remain server-side.
- Generated proposals and explicitly reviewable local operations use preview comparison. Directly manipulated deterministic drafts bypass comparison but converge with previews at the same accepted-operation, mask, immutable-version, and history transition.
- The original asset and every accepted output asset are immutable.
- Diagnostics observe the edit pipeline but cannot create operations, versions, or provider requests.
- Diagnostic failures never change the result or status of the edit they observe.
- Shared code remains small and cannot become a generic utility directory.

### Workspace UI boundary

The workspace shell separates global commands, direct canvas tools, contextual configuration, and supporting drawers. Presentation phases are derived from authoritative editor state rather than persisted separately: empty, ready, selected, processing, preview, and failed. The tool rail owns interaction-mode selection; Lasso owns selection editing and every generative action; Brush and Eraser share a temporary paint session; Hand owns navigation and automatically removes the inspector. Canvas components own display interaction and review, while header commands own project-wide actions. Changing tools cannot commit history or call a provider.

Future UI features enter through an explicit canvas tool, inspector panel, global command, dialog, or drawer. Use TypeScript unions and exhaustive rendering instead of a generalized plugin registry until independently developed extensions require one. Image-wide operations may eventually require an explicit image-versus-selection operation scope, but that persisted contract should evolve with the first real image-wide feature rather than speculatively.

## Core concepts

### Project

References the original asset, current accepted version, operations, masks, and project metadata.

### Image asset

An immutable stored image with its width, height, media type, storage key, and checksum.

### Mask asset

A mask associated with an input asset. A generative mask records the user's approximate focus unless the operation selected protected mode. Processing masks always use the input image's dimensions and source-image coordinate system.

### Edit operation

```text
EditOperation
- id
- projectId
- inputVersionId
- outputVersionId, after acceptance
- maskAssetId
- type
- prompt, when applicable
- parameters, including generative boundary policy and candidate diagnosis
- method: local | generative
- status: draft | processing | preview | accepted | discarded | failed
```

### Image version

An immutable accepted image linked to its parent version and the operation that produced it.

## Coordinate systems

The editor has two coordinate spaces:

1. Display space: the zoomed and panned canvas visible to the user.
2. Source space: the actual pixels of the current input image.

Pointer input must be transformed into source space before mask persistence or processing:

```text
display point
    ↓ inverse viewport transformation
source-image point
    ↓ rasterization
full-resolution mask
```

This behavior requires focused automated tests because incorrect coordinate conversion can silently edit the wrong pixels.

## Edit pipeline

Every edit follows one lifecycle:

```text
User action
    ↓
Draft EditOperation
    ↓
Validate image, mask, and parameters
    ↓
Edit router
    ├── Local processor
    └── Generative provider
    ↓
Candidate result
    ↓
Candidate policy
    ├── Review → complete normalized candidate
    └── Protected → exact masked composite
    ↓
Preview
    ├── Discard → no accepted version
    └── Accept → immutable asset and version
```

### Routing

| Operation | Engine |
|---|---|
| Recolor | Local processing |
| Direct paint | Local source-space compositing |
| Brightness or contrast | Local processing |
| Blur | Local processing |
| Background isolation | Segmentation and compositing |
| Remove object | Generative image editing |
| Replace object | Generative image editing |
| Change material | Generative image editing |
| Plain monochrome conversion | Local processing |
| Full-image visual transformation | Generative image editing with a versioned preset recipe |
| Generate missing content | Generative image editing |

For v0.1, the user selects the operation explicitly. Replace performs contextual interpretation inside that chosen operation; automatic classification between operations remains deferred.

Direct paint uses a short-lived RGBA layer rather than a selection mask. Brush adds color, Eraser removes only that layer's alpha, and Apply flattens all pending gestures into one local operation and immutable version. This keeps undo meaningful and prevents Eraser from destroying accepted image pixels, at the cost of not retaining editable paint strokes after Apply.

### Generative input

Send the provider:

- the complete current image
- a same-size approximate focus mask
- the focused edit instruction
- preservation-oriented context

Do not send only an isolated object in the initial implementation. The surrounding image supplies lighting, texture, perspective, and boundary context.

### Context-aware Replace planning

Replace sends a highlighted full-scene view, a highlighted selection detail, and the user's short instruction to an application-owned text-and-vision planner. The planner returns a validated representation, target, integration rules, constraints, exclusions, confidence, and diagnostic rationale. The application deterministically converts that plan into the image-editor instruction; rationale is never sent to image generation.

The planner is text-only and cannot create image pixels. Planner failure stops the pipeline before the more expensive image request. Remove and Restyle continue directly to the image provider.

### Full-image Transform

Transform is an explicit global operation rather than a Lasso submode. It captures a versioned preset, optional user refinement, and a Faithful/Balanced/Imaginative preservation level, defaulting to Faithful. A Transform-specific vision planner describes the source subjects and composition without choosing a style; the server combines that plan with the resolved recipe to construct the image-editor instruction. The application creates a source-sized full-image effective mask for immutable history and diagnostics but intentionally omits an inpainting mask from the complete-image provider request.

Plain Monochrome uses deterministic luminance conversion because it requires no invented pixels. Adding creative Monochrome direction routes through generation. Every generative Transform requests an explicit source-aligned output aspect, preserves the complete normalized candidate for review, records its resolved instruction and recipe version, and consumes one confirmed image request. A post-generation vision call compares source and candidate semantics. Faithful and Balanced block acceptance on semantic failure or unavailable validation while retaining the proposal for comparison and diagnostics; Imaginative remains manually reviewable.

### Candidate authority and protected compositing

The normalized provider result is an immutable edit proposal. Review mode shows it without post-generation clipping so the application cannot damage complete subjects, text, shadows, reflections, or blending that cross the approximate selection.

Protected mode is explicit and constructs the preview using exact input pixels outside the effective mask:

```text
preview = candidate × effectiveMask + input × (1 - effectiveMask)
```

Candidate diagnosis compares source, selection hint, and normalized result to produce warnings and a change map. Diagnosis is observational and must never rewrite preview pixels. The application may feather or slightly dilate protected masks, but this must be controlled by explicit processing parameters.

### Reproducible request diagnostics

Generative requests carry application-owned project and request IDs through the browser, route, providers, accepted operation, and diagnostic bundle. One user attempt remains one bundle even when Replace makes two provider calls. Schema-v3 manifests preserve the boundary policy, preview source, candidate analysis, change map, ordered provider calls, highlighted planning views, structured plan, source and focus masks, raw and normalized candidates, constructed prompt, sanitized responses, and final preview. Older bundles remain readable and normalize to their historical protected behavior.

Diagnostic metadata is indexed in local SQLite for the UI, while ordinary PNG and JSON files remain directly inspectable under `.local-edit/diagnostics/<project-id>/<request-id>/`. The newest ten completed unpinned bundles are retained globally; pinned bundles are never automatically pruned. These files contain personal images and exact prompts, remain Git-ignored, and are intended only for a locally bound development server.

### Preview and acceptance

A preview does not advance history. A direct local draft also does not advance history. Accepting a preview or applying a direct draft performs one logical operation:

1. Save the complete candidate or protected composite as an immutable asset.
2. Create one version linked to its input version.
3. Mark the edit operation accepted.
4. Advance the project's current-version pointer.

Failure or discard creates no accepted version and does not move the current pointer.

### Export

Export reads the accepted current image version. It does not call the generative provider, replay edit history, or overwrite the original asset.

## History model

v0.1 uses linear immutable history:

```text
V0 Original
  ↓ Operation A
V1
  ↓ Operation B
V2
```

Undo and redo move the current-version pointer. Arbitrary operation toggling and dependency graphs are deferred because later edits depend on earlier pixels.

## Implementation plan

Implemented feature behavior, ownership, and verification references live in [FEATURE_CONTEXT.md](./FEATURE_CONTEXT.md). Build order, milestone status, concrete deliverables, and verification gates live in [LOCAL_DEVELOPMENT_PLAN.md](./LOCAL_DEVELOPMENT_PLAN.md). This separation keeps architecture stable while allowing feature context and the execution plan to change at their appropriate rates.

## Current decisions

These decisions are intentionally kept here until the project becomes large enough to justify separate architecture decision records.

| Decision | Choice | Status |
|---|---|---|
| Application shape | Feature-oriented modular monolith | Accepted |
| Mask coordinates | Source-image coordinate system | Accepted |
| History | Linear immutable versions | Provisional |
| Edit routing | Prefer deterministic local processing | Accepted |
| AI integration | Application-owned provider interface | Provisional |
| Development storage | SQLite and local filesystem | Provisional |
| Request diagnostics | Structured local manifests plus directly inspectable artifacts | Accepted |
| Replace intent planning | Structured multimodal plan before image generation | Accepted |
| Generative selection semantics | Approximate focus by default; explicit protected boundary available | Accepted |

## Code documentation policy

Prefer clear names, cohesive modules, strong TypeScript types, and behavior-focused tests over extensive comments.

Add comments only for information that is not obvious from the code, including:

- coordinate-system assumptions
- image-processing formulas
- preservation constraints
- performance tradeoffs
- external provider limitations
- browser or library workarounds
- reasons an apparently unnecessary step is required

Use concise JSDoc for important public contracts when misuse would be costly. Do not comment functions merely to repeat their names or describe obvious syntax.

Required behavior belongs in automated tests. High-priority tests include:

- display-to-source coordinate conversion
- mask and input dimension equality
- exact outside-mask pixel preservation
- local-versus-generative routing
- failed and discarded edit behavior
- one accepted operation producing exactly one version
- undo and redo version selection
- export without an additional provider call
- diagnostic mask dimensions and artifact integrity
- logging failures not affecting edit behavior or accepted history

## v0.1 completion criteria

The release is complete when a user can:

1. Upload an image.
2. Draw a closed contour to select its interior, then refine it with a brush and eraser.
3. Apply a deterministic recolor.
4. Apply a localized generative removal or restyle.
5. Confirm that unselected pixels remain unchanged.
6. Preview, accept, discard, undo, redo, and compare edits.
7. Close and reopen the local project.
8. Export the accepted image at its original resolution.

## Documentation growth policy

Keep `PROJECT.md` as the project-wide product and architecture reference. Keep `FEATURE_CONTEXT.md` as the implemented-feature reference and update it with every affected feature pull request. Keep `LOCAL_DEVELOPMENT_PLAN.md` as the execution reference because it changes at a different rate. Introduce other documents only when a section has independent ownership or becomes too large for targeted reading.

If a generated code graph is added later, treat it as a derived navigation index. Source code and tests remain authoritative for implemented behavior; this file remains authoritative for planned behavior.
