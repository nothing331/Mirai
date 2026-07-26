# Editable AI Image Editor — Project Reference

## Product thesis

Most AI image tools replace an image with another generated result. This product treats AI as an editor: the user selects a region, makes a localized change, preserves the rest of the image, and can undo or compare every accepted change.

The v0.1 promise is:

> Upload an image, select a region, edit only that selection, preserve everything else, and export the result.

The project initially targets normal users rather than professional design workflows.

## Current state

The editor supports PNG/JPEG upload, pan and zoom, conservatively cleaned closed-contour selection, brush and eraser refinement, on-canvas edit instructions, deterministic recoloring, and localized generative Remove/Restyle operations. Generative editing uses a provider-neutral server boundary, a deterministic fake provider by default, and an optional OpenAI adapter. All provider candidates pass through authoritative compositing before preview. Each generative request also creates a local, reproducible diagnostic bundle containing its processing timeline, masks, provider artifacts, prompts, and final preview. Accepted operations, versions, and masks form linear immutable history with undo/redo, and projects can be saved to local SQLite metadata plus immutable filesystem assets, reopened, and exported as PNG or JPEG.

## v0.1 scope

The first complete vertical slice is:

```text
Upload → canvas → manual mask → local recolor → generative edit → history → export
```

### Included

- PNG and JPEG upload
- image canvas with pan and zoom
- conservative closed-contour cleanup with diagnostics, brush, and eraser mask refinement
- on-canvas edit instructions synchronized with the inspector
- deterministic recoloring
- localized generative removal or restyling
- exact preservation outside the effective mask
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
│   ├── masking/          Brush, eraser, and mask serialization
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
- Local and generative processors converge on the same preview, compositing, acceptance, and history flow.
- The original asset and every accepted output asset are immutable.
- Diagnostics observe the edit pipeline but cannot create operations, versions, or provider requests.
- Diagnostic failures never change the result or status of the edit they observe.
- Shared code remains small and cannot become a generic utility directory.

## Core concepts

### Project

References the original asset, current accepted version, operations, masks, and project metadata.

### Image asset

An immutable stored image with its width, height, media type, storage key, and checksum.

### Mask asset

A mask associated with an input asset. Processing masks always use the input image's dimensions and source-image coordinate system.

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
- parameters
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
Authoritative compositing
    ↓
Preview
    ├── Discard → no accepted version
    └── Accept → immutable asset and version
```

### Routing

| Operation | Engine |
|---|---|
| Recolor | Local processing |
| Brightness or contrast | Local processing |
| Blur | Local processing |
| Background isolation | Segmentation and compositing |
| Remove object | Generative image editing |
| Replace object | Generative image editing |
| Change material | Generative image editing |
| Generate missing content | Generative image editing |

For v0.1, the user selects the operation explicitly. Automatic natural-language classification is deferred.

### Generative input

Send the provider:

- the complete current image
- a same-size edit mask
- the focused edit instruction
- preservation-oriented context

Do not send only an isolated object in the initial implementation. The surrounding image supplies lighting, texture, perspective, and boundary context.

### Authoritative compositing

The provider result is a candidate, not the final authority. Construct the preview using exact input pixels outside the effective mask:

```text
preview = candidate × effectiveMask + input × (1 - effectiveMask)
```

The application may intentionally feather or slightly dilate the mask, but this must be controlled by explicit processing parameters.

### Reproducible request diagnostics

Generative requests carry application-owned project and request IDs through the browser, route, provider, and diagnostic bundle. The bundle preserves the source input, original selection mask, effective mask, provider-sized inputs, raw and normalized candidates, constructed prompt, sanitized provider response, and final browser-composited preview when each artifact exists.

Diagnostic metadata is indexed in local SQLite for the UI, while ordinary PNG and JSON files remain directly inspectable under `.local-edit/diagnostics/<project-id>/<request-id>/`. The newest ten completed unpinned bundles are retained globally; pinned bundles are never automatically pruned. These files contain personal images and exact prompts, remain Git-ignored, and are intended only for a locally bound development server.

### Preview and acceptance

A preview does not advance history. Accepting it performs one logical operation:

1. Save the composite as an immutable asset.
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

Build order, milestone status, concrete deliverables, and verification gates live in [LOCAL_DEVELOPMENT_PLAN.md](./LOCAL_DEVELOPMENT_PLAN.md). This separation keeps architecture stable while allowing the execution plan to change frequently.

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

Keep `PROJECT.md` as the project-wide product and architecture reference. Keep `LOCAL_DEVELOPMENT_PLAN.md` as the execution reference because it changes at a different rate. Introduce additional documents only when a section has independent ownership or becomes too large for targeted reading.

If a generated code graph is added later, treat it as a derived navigation index. Source code and tests remain authoritative for implemented behavior; this file remains authoritative for planned behavior.
