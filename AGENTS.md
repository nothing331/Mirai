# Agent Guide

## Product

This repository is an editable AI image editor. The v0.1 workflow is:

```text
Upload → select → edit → compare → undo or accept → export
```

For generative edits, the selection is an approximate focus hint by default; the complete provider proposal is shown for review. Exact preservation outside the selection is an explicit protected mode. Every accepted change remains a reversible operation and immutable image version.

## Current state

The repository contains a browser-only Next.js editor with image upload, pan and zoom, source-space selections, deterministic and generative edits, comparison, linear immutable history, local persistence, export, context-aware Replace planning, and reproducible request diagnostics. Confirm current behavior in source code and tests rather than relying only on this summary.

Use the smallest relevant source for the task:

| Need | Read |
|---|---|
| Durable repository rules | `AGENTS.md` |
| Existing behavior | Relevant source code and tests |
| Product scope, architecture, data flow, or decisions | Relevant section of `PROJECT.md` |
| Current milestone, build order, or deliverables | Relevant section of `LOCAL_DEVELOPMENT_PLAN.md` |
| Setup and canonical commands | `README.md` and package scripts |

Do not load every document for routine changes. Small localized tasks should begin with the relevant code and tests. Read project documents only when the task depends on their context.

## Collaboration and learning

This is a learning project as well as a product. Work as a collaborative technical partner, not as a silent code generator. The user should come away understanding both what changed and how the solution works.

- Before substantial implementation, explain the current behavior, the proposed approach, and why it fits the repository.
- While working, share concise progress updates and call out important discoveries, assumptions, and changes in direction.
- Explain meaningful technical decisions in plain language, including the alternatives considered.
- For each significant tradeoff, describe what is gained, what is given up, the risks it introduces, and how those risks can be reduced or revisited later.
- Connect implementation details to broader engineering concepts when that helps the user build transferable knowledge.
- Invite discussion at genuine decision points. Ask before proceeding when a choice would materially affect architecture, user experience, scope, or long-term maintenance.
- Do not block routine, reversible work with unnecessary questions. Make a reasonable assumption, state it, and continue.
- When finishing a task, summarize the behavior added or changed, walk through the important code paths, report verification performed, and identify remaining limitations or useful next steps.
- Answer follow-up questions candidly and welcome alternative ideas. Healthy disagreement and back-and-forth are part of the work.
- Match explanation depth to the task: keep trivial edits concise, but give architectural, unfamiliar, or high-impact work enough detail to be educational.

## Non-negotiable rules

- Preserve the original image asset; never overwrite it.
- Store selection hints and protected processing masks in source-image coordinates and dimensions.
- Preserve the complete normalized provider candidate in generative review mode; diagnostics may analyze it but must not alter it.
- Preserve exact input pixels outside the effective edit mask in protected mode and deterministic local operations.
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
- Review-mode generative previews retain candidate changes outside the approximate selection.
- Protected-mode and deterministic edits preserve pixels outside their effective masks.
- Failed or discarded edits do not advance history.
- Accepting one edit creates exactly one operation and one version.
- Undo and redo select the correct immutable versions.
- Export preserves the selected dimensions and performs no model call.

Update `PROJECT.md` only when project-wide architecture, scope, or decisions change. Update `LOCAL_DEVELOPMENT_PLAN.md` when milestone status, build order, or deliverables change. Generated code graphs are optional derived indexes and are never the source of truth.
