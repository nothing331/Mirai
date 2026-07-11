# Agent Guide

## Product

This repository is an editable AI image editor. The v0.1 workflow is:

```text
Upload → select → edit → compare → undo or accept → export
```

The application must preserve what the user did not select and represent accepted changes as reversible operations and immutable image versions.

## Current state

The repository contains a browser-only Next.js editor with image upload, pan and zoom, source-space brush strokes, erasing, deterministic recoloring, and in-memory accepted operations. Generative editing, durable history, persistence, and export are not implemented yet. Confirm current behavior in source code and tests rather than relying only on this summary.

Use the smallest relevant source for the task:

| Need | Read |
|---|---|
| Durable repository rules | `AGENTS.md` |
| Existing behavior | Relevant source code and tests |
| Product scope, architecture, data flow, or decisions | Relevant section of `PROJECT.md` |
| Current milestone, build order, or deliverables | Relevant section of `LOCAL_DEVELOPMENT_PLAN.md` |
| Setup and canonical commands | `README.md` and package scripts |

Do not load every document for routine changes. Small localized tasks should begin with the relevant code and tests. Read project documents only when the task depends on their context.

## Non-negotiable rules

- Preserve the original image asset; never overwrite it.
- Store processing masks in source-image coordinates and dimensions.
- Preserve exact input pixels outside the effective edit mask.
- Route every accepted edit through the shared edit pipeline.
- Represent every accepted change as an `EditOperation` and immutable image version.
- Prefer deterministic local processing when an edit does not require invented pixels.
- Keep provider SDK types and credentials behind a server-side application interface.
- UI components must not call image providers or write history directly.
- Export the accepted current version without calling the image model again.
- Keep v0.1 history linear.
- Avoid premature microservices, queues, cloud storage, and generalized abstractions.

## Code clarity

- Prefer descriptive domain names and strong types over explanatory comments.
- Comment only non-obvious constraints, reasons, formulas, provider limitations, and workarounds.
- Do not add comments that merely restate a function name or syntax.
- Document important public contracts with concise JSDoc when misuse would be costly.
- Encode required behavior in tests rather than relying on comments.
- Avoid generic dumping grounds such as `utils.ts`, `helpers.ts`, and `manager.ts`.

## Required invariants to test

- Display coordinates convert correctly to source-image coordinates.
- Processing masks match their input image dimensions.
- Pixels outside the effective mask remain unchanged.
- Failed or discarded edits do not advance history.
- Accepting one edit creates exactly one operation and one version.
- Undo and redo select the correct immutable versions.
- Export preserves the selected dimensions and performs no model call.

Update `PROJECT.md` only when project-wide architecture, scope, or decisions change. Update `LOCAL_DEVELOPMENT_PLAN.md` when milestone status, build order, or deliverables change. Generated code graphs are optional derived indexes and are never the source of truth.
