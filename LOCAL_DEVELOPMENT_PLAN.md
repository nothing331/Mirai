# v0.1 Local Development Plan

## Purpose

This document answers:

- What should be built next?
- In what order should it be built?
- What is the deliverable for each milestone?
- How do we verify that a milestone is complete?

For product scope, architecture, data flow, and project decisions, read [PROJECT.md](./PROJECT.md). Do not duplicate those details here.

## Target vertical slice

```text
Upload → canvas → manual mask → local recolor → generative edit → history → export
```

The first usable result is not a dashboard or complete product. It is one dependable localized editing loop.

## Working rhythm

The plan assumes approximately 1–2 hours per day. Complete and verify one milestone before expanding the next. If a milestone takes longer than its estimated week, preserve scope and move the schedule rather than adding shortcuts that break the core invariants.

## Milestone status

| Milestone | Status | Deliverable |
|---|---|---|
| 0. Documentation and scope | Complete | Agent rules, architecture reference, and development plan |
| 1. Application shell | Complete | Local app with image upload and editor layout |
| 2. Canvas foundation | Complete | Rendering, stable pan/zoom, reset view, coordinate conversion, and dimension-preserving browser export |
| 3. Manual masking | Complete | Closed-contour filling with source-space brush and eraser refinement |
| 4. Deterministic editing | Complete | Luminance-preserving recolor, controlled feathering, exact preservation, and preview comparison |
| 5. Generative editing | Complete | Fake and optional OpenAI Remove/Restyle editing with retry, preview, and exact preservation |
| 6. Version history | Complete | Accept, discard, linear undo/redo, branch truncation, and comparison |
| 7. Persistence and export | Complete | SQLite project metadata, immutable local assets, reopening, and PNG/JPEG export |
| 8. v0.1 validation | Complete | Invariant, provider, history, persistence, export, and browser workflow verification |
| 9. Selection feedback improvements | Complete | Conservative lasso cleanup, mask diagnostics, and selection-anchored edit instructions |
| 10. Reproducible request diagnostics | Complete | Correlated request IDs, persistent processing bundles, artifact comparison, retention, pinning, and agent handoff |
| 11. Context-aware Replace planning | Complete | Multimodal structured planning, planner failure isolation, two-call diagnostics, and history correlation |

Update this table whenever a milestone begins or completes.

## Milestone 1: Application shell

### Build

- initialize a Next.js TypeScript application
- choose and record the package manager
- add Tailwind CSS
- create the main editor page
- add local PNG and JPEG upload
- display basic file errors
- define canonical development and verification scripts

### Deliverable

A user can start the local application, upload a supported image, and see it in the editor shell.

### Completion gate

- setup works from a clean dependency installation
- `README.md` contains real commands
- unsupported files fail clearly
- no provider key is required for this milestone

## Milestone 2: Canvas foundation

### Build

- render the uploaded image on the canvas
- retain the source width and height separately from display dimensions
- fit the image into the viewport
- add pan, zoom, and reset-view controls
- implement display-to-source coordinate conversion

### Deliverable

The image can be navigated without losing its authoritative source dimensions.

### Completion gate

- coordinate-conversion tests cover scaling and translation
- tests include non-square images
- zoom and pan do not alter persisted source coordinates
- exporting the untouched image retains its intended dimensions

## Milestone 3: Manual masking

### Build

- add a closed-contour lasso that fills its enclosed region
- add brush and eraser modes
- add brush-size control
- render a translucent selection overlay
- add clear-selection behavior
- rasterize the selection in source-image space
- serialize a full-resolution processing mask

### Deliverable

A user can draw around an area, see the enclosed region filled, refine it with a brush or eraser, and produce a mask aligned with the source image.

### Completion gate

- mask width and height equal input-image dimensions
- closed contours select their interior rather than only their outline
- brush placement remains correct after pan and zoom
- empty masks are detected
- mask tests cover image edges and different aspect ratios

## Milestone 4: Deterministic editing

### Build

- add an explicit Recolor operation
- preserve useful luminance and texture within the selection
- implement authoritative masked compositing
- feather mask boundaries through controlled parameters
- show original-versus-result comparison

### Deliverable

A user can select part of an image, recolor it locally, and confirm that unselected pixels have not changed.

### Completion gate

- no AI API is called
- every pixel outside the effective mask is preserved
- output dimensions equal input dimensions
- boundary behavior has automated tests

## Milestone 5: Generative editing

### Build

- define the application-owned image-provider interface
- create a fake provider for UI and pipeline tests
- implement processing, success, failure, and retry states
- support explicit Remove and Replace/Restyle operations
- connect one real image-edit provider server-side
- send the full current image, same-size mask, and focused prompt
- composite the provider candidate through the same authoritative mask boundary

### Deliverable

A user can preview a localized generative edit without committing it to history.

### Completion gate

- provider credentials never enter browser code
- tests can run with the fake provider
- provider changes outside the effective mask are discarded
- failed calls leave the accepted project state unchanged
- the user can accept, discard, or retry a preview

## Milestone 6: Version history

### Build

- define `EditOperation` and immutable `ImageVersion` persistence shapes
- accept a preview as one operation and one version
- add linear undo and redo
- add original-versus-current and previous-versus-current comparison
- define behavior when accepting a new edit after undo

### Deliverable

Accepted edits form a dependable linear history that the user can navigate.

### Completion gate

- accepting one preview creates exactly one operation and version
- discarded and failed previews create no accepted version
- undo and redo select the correct assets
- the original asset remains unchanged

## Milestone 7: Persistence and export

### Build

- add SQLite metadata persistence
- add local filesystem asset and mask storage
- save and reopen projects
- export PNG and JPEG
- preserve original resolution by default
- add cleanup rules for abandoned preview assets

### Deliverable

A user can close the application, reopen a project, continue editing, and export the accepted current version.

### Completion gate

- reopened projects restore the correct current version
- masks and version relationships remain valid
- export does not call the image provider
- export does not overwrite the original asset
- export dimensions are explicit and tested

## Milestone 8: v0.1 validation

### Build and test

- test coordinate and mask edge cases
- test provider failures and duplicate submissions
- add loading, empty, and error states
- conduct task-based testing with several users
- measure time to first successful edit
- fix issues that prevent completion of the core workflow

### Release checklist

- upload works for supported image formats
- pan and zoom remain stable
- brush and eraser selection is understandable
- deterministic recoloring works
- at least one generative edit works
- pixels outside the selection remain preserved
- preview, accept, discard, undo, redo, and compare work
- projects reopen correctly
- original-resolution export works
- setup and verification commands are documented

## Next development sessions

The v0.1 engineering milestones, context-aware Replace planner, and reproducible diagnostic workflow are complete. When an image result looks wrong, pin its request in the diagnostics drawer and use “Copy for coding agent” before changing the pipeline. Future work should begin from that evidence and the deferred scope in `PROJECT.md`, without weakening the accepted-version and exact-preservation invariants.

## Plan maintenance

- Keep this document focused on order, status, deliverables, and completion gates.
- Keep architectural explanations and product decisions in `PROJECT.md`.
- Update milestone status as work progresses.
- Change completion gates only when the product requirement changes, not merely because implementation is difficult.
- Add later milestones only after the v0.1 vertical slice remains coherent.
