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
| Implemented feature behavior and ownership | Relevant entry in `FEATURE_CONTEXT.md` |
| Existing behavior | Relevant source code and tests |
| Frontend design, interaction, layout, styling, or copy | `FRONTEND_DESIGN.md`, then the owning components and tests |
| Product scope, architecture, data flow, or decisions | Relevant section of `PROJECT.md` |
| Current milestone, build order, or deliverables | Relevant section of `LOCAL_DEVELOPMENT_PLAN.md` |
| Setup and canonical commands | `README.md` and package scripts |

Do not load every document for routine changes. Small localized tasks should begin with the relevant code and tests. Read project documents only when the task depends on their context.

## Frontend design

`FRONTEND_DESIGN.md` is the durable visual and interaction contract for the editor. Every agent changing frontend layout, styling, controls, responsive behavior, motion, accessibility, or user-facing copy must read it before implementation.

- Follow its product shell, visual language, component patterns, and state requirements unless the user approves a design-direction change.
- Prefer existing tokens and patterns. Do not introduce a parallel visual system inside one feature.
- Update the guide when an approved change alters a reusable design rule; keep feature-specific behavior in `FEATURE_CONTEXT.md`.
- Verify relevant hover, focus, disabled, processing, failure, responsive, and review states rather than checking only the default appearance.

## Feature approval and delivery

A feature is a user-visible capability or a cohesive behavioral change. Bug fixes, refactors, and repository maintenance are not automatically features, but they must still follow the documentation and commit rules below when they change feature behavior.

- Do not begin implementing a proposed feature until the user has approved its scope. Exploration, diagnosis, and written proposals are allowed before approval; production implementation is not.
- Treat each approved feature as its own delivery unit and raise it in its own pull request. Do not combine unrelated features in one pull request.
- If implementation reveals a material change to product behavior, architecture, user experience, scope, or long-term maintenance, explain the choice and obtain renewed approval before expanding the feature.
- Keep incidental cleanup narrowly tied to the approved feature. Propose unrelated cleanup separately.
- A feature is ready for a pull request only after its implementation, focused tests, relevant broader verification, and documentation are complete.

## Feature context

`FEATURE_CONTEXT.md` is the living index of implemented product behavior. It explains how every feature works, where it is implemented, what state and boundaries it owns, how it fails, and how it is verified. Source code and tests remain authoritative when documentation and implementation disagree.

For every feature change:

1. Read the relevant `FEATURE_CONTEXT.md` entry before implementation.
2. Update that entry as the implementation evolves; add a new entry for a new feature.
3. Record behavior, end-to-end flow, important data/state, UI and server responsibilities, business rules, failure behavior, dependencies, limitations, and code/test references that actually apply.
4. Describe the final implemented behavior, not a diary of intermediate attempts.
5. Before raising a pull request, verify every affected entry against the final diff and tests. The feature-context update belongs in the same pull request as the behavior it documents.

Pure repository-only changes may state in the pull-request description that no feature context changed. This exception must not be used when user-visible behavior, an API contract, business rules, persistence, or a feature's failure modes changed.

Do not duplicate project-wide architecture or planning in the feature ledger. Update `PROJECT.md` for project-wide architecture, scope, data flow, or decisions, and `LOCAL_DEVELOPMENT_PLAN.md` for milestone state, build order, or deliverables.

## Commit and pull-request discipline

Commits must be small, coherent, independently understandable, and separated by both concern and feature. Use these concern boundaries:

- **UI:** components, interaction behavior, client presentation, and styling.
- **Server:** routes, provider adapters, storage implementations, and server integration.
- **Business logic:** domain contracts, edit rules, orchestration, validation, state transitions, and deterministic processing.
- **Repository:** tests and fixtures when they cannot accompany one concern cleanly, documentation, configuration, tooling, and CI.

Do not mix these concerns in one commit merely because they support the same feature. A cross-layer feature should normally be a short sequence of ordered commits, each leaving the repository in a valid state. A test should usually travel with the concern it verifies; use a separate repository/test commit only for cross-cutting suites or infrastructure.

Write each commit so another engineer can understand it without reading the full diff:

- Use an imperative subject in the form `<type>(<area>): <specific outcome>`, for example `feat(editor-ui): add protected-mode control`.
- Use `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, or `build` as the type.
- Add a commit body for every non-trivial commit. Explain why the change is needed, what behavior or contract changed, important implementation choices, and the verification performed.
- Explain meaningful tradeoffs or follow-up limitations in the body. Do not use vague subjects such as `fixes`, `updates`, or `changes`.
- Keep formatting-only or generated-file changes separate when practical.

Before committing, inspect the staged diff and confirm it contains one feature and one concern. Before raising a pull request, confirm the commit sequence is reviewable, the approved feature is the only feature in scope, `FEATURE_CONTEXT.md` is current, and the pull-request description explains the user outcome, layer-by-layer implementation, tradeoffs, verification, and known limitations.

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
