# Mirai Frontend Design Guide

This document is the durable design contract for Mirai's editor interface. Read it before changing layout, styling, interaction patterns, responsive behavior, or user-facing copy. Feature behavior remains authoritative in `FEATURE_CONTEXT.md`; implementation remains authoritative in source code and tests.

## Design thesis

Mirai is an **industrial editorial image workstation** for ordinary users. It should feel focused and capable without resembling a professional suite full of floating palettes. The image is always the visual anchor; controls form a quiet, precise frame around it.

The memorable visual signature is warm paper and near-black structure interrupted by one sharp acid-lime action color. The interface is compact, square-edged, typographically disciplined, and visibly stateful.

When making a design decision, prefer:

1. Image prominence over interface decoration.
2. One clear responsibility per surface.
3. Visible state over explanatory prose.
4. Borders, contrast, and spacing over floating cards.
5. Reversible review before commitment.
6. Familiar interaction behavior with a distinctive visual treatment.

## Product interaction model

The primary workflow is:

```text
Open image → choose tool → configure in inspector → act on canvas or generate → review → accept or discard
```

The shell has five stable regions:

| Region | Role | Current measure |
|---|---|---|
| Header | Project commands, save, diagnostics, export | 56px high |
| Tool rail | Select one editing workflow | 48px wide on desktop |
| Contextual inspector | Options for the selected workflow | 208px content beside the rail; 256px total sidebar |
| Canvas | Image interaction and proposal comparison | Receives all remaining space |
| Canvas status | Dimensions, zoom, active mode, history count | 28px high |

The rail chooses the workflow; the inspector configures it; the canvas performs or reviews it. Do not place the same primary action in multiple regions merely for visibility.

### Tool behavior

- Lasso owns selection construction and selection-based edits.
- Brush owns pending paint.
- Eraser corrects pending paint only.
- Hand owns navigation and removes the inspector because it has no settings.
- Transform is image-wide but behaves as a first-class rail selection; its presets and controls live in the inspector.
- Every icon-only rail control must reveal its full name on hover and keyboard focus. Show its shortcut when one exists.
- Selecting a tool must not generate pixels, accept history, or trigger an external request by itself.

### Surface selection

Use the contextual inspector for persistent options belonging to a tool. Use the canvas for direct manipulation and review controls. Use the header only for project-wide commands. Use a drawer for supporting evidence such as diagnostics. Reserve a modal for a short, genuinely blocking decision that cannot coexist with the canvas; do not use a modal as a substitute for an inspector.

## Visual language

### Color

The canonical semantic tokens live in `src/app/globals.css`.

| Token | Value | Purpose |
|---|---:|---|
| `ink` | `#171714` | Primary text, selected tools, strongest actions |
| `paper` | `#f2f0e8` | Main interface surface |
| `line` | `#b9b5a9` | Dividers and control boundaries |
| `muted` | `#656259` | Secondary text and inactive icons |
| `accent` | `#ef4b32` | Errors, destructive emphasis, serious warnings |
| `acid` | `#d8f441` | Primary action, successful readiness, active highlight |

Supporting neutrals already used by the shell:

- `#e8e5dc` / `#e9e7df`: recessed controls and rail surfaces.
- `#cfcdc5`: canvas surround.
- `#151513`: canvas and review stage.
- Pale acid (`#edf5c4`): selected or ready informational state.
- Pale coral (`#ffd5cc`): error and blocked state.

Rules:

- Acid is scarce. Use it for the next meaningful action, active focus, or confirmed readiness—not as decoration.
- Coral communicates a problem or destructive consequence. Never use it as a neutral brand accent.
- Prefer semantic Tailwind tokens (`bg-ink`, `text-muted`) over new raw hex values.
- Add a global token only when a color has a repeated semantic role. A feature-specific image swatch may remain local.
- Do not introduce gradients into the application chrome. Gradients are acceptable inside image/style previews where they represent visual content.

### Typography

- **Manrope** is the interface and heading face.
- **DM Mono** is for metadata, shortcuts, IDs, counts, statuses, and compact uppercase labels.
- Headings are compact, bold, and slightly tightly tracked.
- Eyebrows and metadata use uppercase mono text with generous letter spacing.
- Sentence case is the default for buttons, labels, and explanations.

Typical scale:

| Use | Size |
|---|---:|
| Micro metadata / eyebrow | 7–9px mono |
| Supporting label | 9–10px |
| Control and body copy | 10–12px |
| Inspector heading | 14px bold |
| Product mark / major compact heading | 16px+ bold |

Small type is appropriate only for short interface metadata. Explanations, errors, and instructions must remain readable and use comfortable line height.

### Shape, depth, and texture

- Default to square corners. Rounded pills and generic rounded cards do not belong in the editor chrome.
- Use 1px borders and adjoining surfaces to establish structure.
- Use hard offset shadows sparingly for elevated, consequential layers such as loading states or tooltips.
- Avoid soft, diffuse card shadows, glassmorphism, decorative blur, and purple/blue SaaS gradients.
- The image or generated result supplies visual richness. The surrounding interface should remain controlled.

### Spacing and sizing

Use a compact 4px-based rhythm. Common values are 4, 8, 12, 16, and 24px.

- Rail target: 44 × 44px inside a 48px rail.
- Header icon target: 32 × 32px.
- Primary inspector action: 40px high and full width.
- Compact segmented control: 32–36px high.
- Inspector horizontal padding: 16px.
- Separate inspector groups with a top border and 12–16px vertical padding.

Maintain comfortable pointer targets even when the visible icon is 16–18px.

## Component patterns

### Tool rail

- Inactive: muted icon on the warm neutral rail.
- Hover: lighter surface and ink icon.
- Selected: ink surface with acid icon.
- Disabled: reduced opacity but retain the hover label so users can identify the control.
- Tooltip: ink background, paper text, optional acid shortcut, hard acid-tinted offset shadow.
- Do not show two tools as selected. An image-wide workflow may preserve an underlying canvas mode internally, but only the visible workflow is highlighted.

### Contextual inspector

- Use a sticky heading followed by vertically stacked sections.
- Each section has a small mono label and is separated by a border, not a card container.
- Keep the primary action in a fixed footer so it remains available while options scroll.
- Keep configuration visible during processing and review, but prevent competing requests.
- Switching tools replaces the inspector content; do not accumulate permanent panels.
- Retain meaningful draft inputs through review and Adjust flows.

### Buttons

| Priority | Treatment |
|---|---|
| Primary | Ink or acid fill, bold label, explicit hover inversion |
| Secondary | Transparent or paper surface, ink/muted text, visible hover surface |
| Destructive | Coral-tinted context; require an explicit text label |
| Icon-only | Fixed square target, accessible name, tooltip, focus ring |

Use verbs that describe the immediate result: “Generate preview,” “Apply paint,” “Accept edit,” “Discard.” Avoid vague labels such as “Continue” or “Done.”

### Inputs and option groups

- Use recessed neutral surfaces for text fields and selects.
- Use a visible accent focus ring.
- Use radio semantics for mutually exclusive presets and segmented controls.
- Selected options should change both contrast and structure; do not rely on color alone.
- Placeholder copy should demonstrate the expected input without becoming an instruction manual.

### Status and feedback

- Processing: keep layout stable, replace the action label, and show restrained motion.
- Ready/success: acid or pale-acid state.
- Warning: warm amber/brown text where the action may proceed.
- Error/block: coral edge or surface with an actionable recovery message.
- Disabled controls must explain themselves through nearby state, tooltip, or error text.
- Never advance history on failure or discard.

### Review

Review is a distinct dark stage owned by the canvas. Show the comparison at the largest practical size. Accept, Discard, and feature-specific adjustment controls live with the preview. Fidelity or scope warnings must remain adjacent to those decisions.

## Motion

Motion communicates a state transition; it is not ambient decoration.

- Inspector entry: short fade with a 6px horizontal shift, approximately 160ms.
- Preview entry: subtle fade/scale, approximately 180ms.
- Loading: rotation or pulse only on the element communicating progress.
- Hover transitions: approximately 140ms for color, border, and opacity.
- Avoid springy movement, bouncing controls, and large parallax effects in the editor shell.
- Respect `prefers-reduced-motion`; global fallbacks already exist in `globals.css`.

## Responsive behavior

Desktop prioritizes a vertical rail, contextual inspector, and maximum canvas area. On narrow screens, the tool rail becomes horizontal below the canvas and the inspector occupies a bounded lower region.

- Preserve the same tool order and names across breakpoints.
- Tooltips move above horizontal rail icons and to the right of vertical rail icons.
- Never allow the inspector to push the canvas entirely off-screen.
- Keep primary review actions reachable without horizontal scrolling.
- Hide low-priority metadata before shrinking essential controls below usable sizes.
- Test both an empty workspace and an image-loaded workspace at mobile and desktop widths when changing shell geometry.

## Accessibility

- Every control needs an accessible name; icon-only controls also need a visible hover/focus label.
- Use native buttons, inputs, selects, and textareas whenever possible.
- Use `role="radio"` with `aria-checked` for custom exclusive choices.
- Focus indication must be visible against both paper and dark canvas surfaces.
- Do not encode selection, warning, or failure with color alone.
- Keep keyboard shortcuts inactive while the user types in an input, textarea, select, or editable region.
- Preserve logical tab order when visual layout changes responsively.
- Announce asynchronous processing and errors with appropriate status or alert semantics.

## Voice and copy

Mirai is direct, calm, and concrete.

- Name the object and outcome: “Transform the complete image.”
- Explain irreversible-looking actions in terms of the actual reversible model: “Review before history changes.”
- State provider cost or request implications before generation.
- Keep labels short; place nuance in one nearby sentence.
- Avoid hype, magic language, and unexplained AI terminology.
- Use “image,” “selection,” “preview,” “version,” and “history” consistently.

## Frontend architecture boundaries

- UI components collect intent and request domain transitions. They do not call image providers or write history directly.
- Authoritative editor state stays in the editor store; transient disclosure state may stay local to the owning component.
- Derive presentation phases from domain state instead of persisting duplicate UI state.
- Keep feature controls near their owning workflow component. Avoid generalized component registries until independent extension requires one.
- Reuse established components and interaction patterns before creating a new abstraction.
- Keep `data-testid` attributes on stable user outcomes, not styling details.

## Anti-patterns

Do not introduce:

- A duplicate entry point for the same primary workflow.
- A modal for controls that belong in the contextual inspector.
- Floating rounded cards for every section.
- New colors without a semantic purpose.
- Icon-only actions without full-name hover/focus labels.
- Permanent side panels for occasional supporting information.
- UI that hides the source or proposal when the user must make a visual decision.
- Animation that delays input or masks processing state.
- A visual redesign bundled into an unrelated feature.

## Frontend change workflow

Before implementation:

1. Read this guide, the affected `FEATURE_CONTEXT.md` entry, and the owning components/tests.
2. Identify the surface that owns the interaction: header, rail, inspector, canvas, drawer, or exceptional modal.
3. State any proposed departure from this guide and obtain approval if it changes the product's design direction.

During implementation:

1. Use existing tokens and sizing patterns.
2. Implement complete ready, hover, focus, disabled, processing, failure, and review states that apply.
3. Check desktop and narrow layouts.
4. Preserve domain and history boundaries.

Before delivery:

1. Run focused tests plus `npm run typecheck`, `npm run lint`, and `npm run build`.
2. Run the relevant Playwright workflow for user-visible interaction changes.
3. Verify accessible names and keyboard behavior.
4. Update this document only when the reusable design system changes; update `FEATURE_CONTEXT.md` when feature behavior changes.
5. Include design tradeoffs and known limitations in the handoff.

## Evolving the guide

This guide describes the implemented system, not a speculative redesign. Add a rule only after it is approved and represented in the product, or when it formalizes a clearly repeated existing pattern. When a deliberate new pattern supersedes an old one, update the guide and the relevant source in the same delivery unit.
