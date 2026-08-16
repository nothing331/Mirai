# AI Image Creation — Feature Specification

## Status

- **State:** Approved and implemented
- **Implementation:** Implemented on the AI asset-generation feature branch
- **Product area:** Create with AI popup
- **Primary outcome:** Extend the existing Logo Mark and Icon generator with general AI image creation while keeping the interface simple and recognizable.

This document records the approved product behavior. `FEATURE_CONTEXT.md` remains the source for implemented behavior and source code and tests remain authoritative.

## 1. Problem

Mirai can help users create focused icons and logo marks, but users also need to create complete images for common practical uses such as Instagram posts, stories, reels, and YouTube thumbnails.

Exposing only numeric resolutions makes users translate pixels into use cases. Exposing image transformation as a separate top-level mode also makes a simple creative choice feel like a different workflow.

The creation popup should instead answer three understandable questions:

1. What are you creating: a Logo Mark, an Icon, or an Image?
2. If it is an image, what should it depict and what visual treatment should it use?
3. Where will the image be used?

## 2. Product decision

The popup has exactly three primary creation choices:

```text
Logo Mark | Icon | Create Image
```

“Logo Mark” is one option. There is no separate top-level Transform mode.

Transformation is represented by visual-treatment templates inside Create Image. For example:

```text
Subject: Mount Everest at sunrise
Treatment: Sketch
Result: A newly generated sketch of Mount Everest at sunrise
```

This version does not transform an uploaded image. Whole-image reference uploads and image-to-image editing are outside this feature’s scope.

## 3. Goals

- Preserve the existing Logo Mark and Icon experience.
- Add one clear Create Image workflow inside the same popup.
- Let users describe an image in natural language.
- Let users select a recognizable visual treatment without writing style-specific prompt language.
- Present resolutions as familiar destinations and use cases.
- Generate exactly one low-quality result per request.
- Open the selected result as an immutable Mirai project original.
- Keep provider credentials, SDK types, prompt construction, and model calls server-side.
- Keep the feature inexpensive and easy to understand.

## 4. Non-goals

The first version does not include:

- a separate Transform tab
- uploaded reference images
- image-to-image editing inside the popup
- localized transformation; the existing Lasso workflow owns localized edits
- multiple generated candidates
- medium- or high-quality generation
- model or provider selection
- multiple reference images
- reference-strength controls
- prompt enhancement by an additional LLM call
- persistent generation galleries
- reusable saved style references
- custom pixel dimensions
- batch generation
- upscaling
- wordmarks or typography-focused logo generation
- SVG or vector output

## 5. Entry points

The popup remains available from:

- the persistent Create with AI button in the tool rail
- the Create with AI action in the empty-canvas state

The compact shortcut must not return to the global header.

## 6. Popup information architecture

### 6.1 Header

Recommended title:

```text
Create with AI
```

Recommended supporting copy:

```text
Create a logo mark, icon, or complete image. One low-quality result per request.
```

### 6.2 Primary selector

The selector appears directly below the popup header:

```text
Logo Mark | Icon | Create Image
```

Only the controls for the active choice are shown.

The selector changes the type of asset being created; it does not represent steps in a wizard.

## 7. Logo Mark and Icon behavior

Logo Mark and Icon retain the existing controls:

- description
- visual style
- detail level
- Auto or Custom palette
- square output

### 7.1 Palette

- Auto remains the default.
- Auto lets the image model choose a concept-appropriate foreground palette.
- Custom exposes the existing color controls.
- Auto must not send fallback UI swatches as provider constraints.

### 7.2 Output

- Resolution is fixed at 1024 × 1024.
- The request produces one low-quality result.
- The server uses the existing constrained matte and local transparency workflow.
- A low-confidence cutout remains visible with a cleanup warning.

## 8. Create Image behavior

Create Image contains three input groups:

1. Image description
2. Visual treatment
3. Intended format

### 8.1 Image description

The description is a multiline text field.

Recommended label:

```text
Describe the image
```

Recommended helper text:

```text
Include the subject, setting, composition, lighting, and mood you want.
```

Requirements:

- trim leading and trailing whitespace
- require at least 3 characters
- allow at most 2,000 characters
- preserve the user’s original text for display, provenance, and diagnostics
- do not rewrite the text inside the visible field when a treatment is selected

### 8.2 Visual treatment

Recommended label:

```text
Visual treatment
```

Initial treatments:

| ID | UI label | Intent |
|---|---|---|
| `auto` | Auto | Let the image model choose an appropriate visual treatment from the prompt. |
| `photograph` | Photograph | Produce a photographic image with natural camera, lighting, and material behavior. |
| `sketch` | Sketch | Produce a hand-drawn graphite or pencil-style sketch with visible line and tonal work. |
| `watercolor` | Watercolor | Produce a watercolor illustration with pigment variation and paper character. |
| `digital-art` | Digital Art | Produce a polished digital illustration with deliberate shapes, lighting, and color. |
| `three-dimensional` | 3D | Produce a dimensional rendered scene with coherent materials and lighting. |
| `anime` | Anime | Produce a clean anime-inspired illustration without imitating a named artist or protected franchise. |

Auto is the default.

Treatment cards may include a small visual sample later, but the first implementation should use text and a restrained icon rather than bundling stock imagery.

### 8.3 Treatment rules

- The selected treatment is stored as a stable ID.
- The UI sends the ID, not a hidden prompt fragment.
- The server maps the ID to an application-owned instruction.
- A treatment controls visual rendering only.
- A treatment must not introduce unrelated subjects, text, logos, or compositional changes.
- Treatment instructions must avoid requests to imitate living artists, existing brands, or protected franchises.
- Auto adds no style-specific constraint.

### 8.4 Intended format

The UI prioritizes recognizable use cases. Pixel dimensions and aspect ratios appear as secondary information.

Recommended initial formats:

| ID | Primary UI label | Secondary label | Generation size |
|---|---|---|---:|
| `instagram-post` | Instagram Post | Square · 1:1 | 1024 × 1024 |
| `instagram-portrait` | Instagram Portrait | Feed · 4:5 | 1024 × 1280 |
| `story-reel` | Story / Reel | Vertical · 9:16 | 720 × 1280 |
| `youtube-thumbnail` | YouTube Thumbnail | Widescreen · 16:9 | 1280 × 720 |

Instagram Post is the default.

These are low-quality generation canvases selected to preserve the intended aspect ratio and control request cost. Platform-specific final-export validation and upscaling are separate future capabilities.

### 8.5 Result

- Generate exactly one result.
- Show the actual output dimensions beneath the result.
- Identify it as a low-quality draft.
- Do not run logo matte removal on complete images.
- Do not crop, composite, or otherwise alter the provider composition during preparation.
- Allow the user to generate another result using the current settings.
- Keep only the latest temporary result in popup state.
- Discard the temporary result when the popup closes.

## 9. User flow

### 9.1 Create Image

```text
Open Create with AI
    ↓
Choose Create Image
    ↓
Describe the subject and scene
    ↓
Choose a visual treatment
    ↓
Choose an intended format
    ↓
Confirm one paid request when the real provider is enabled
    ↓
Generate one low-quality result
    ↓
Use in Mirai or generate another
```

### 9.2 Example

```text
Prompt: Mount Everest at sunrise
Treatment: Sketch
Format: Instagram Portrait
```

The server-owned instruction should communicate:

```text
Create one complete image of Mount Everest at sunrise.
Render it as a hand-drawn graphite sketch with purposeful line work,
natural tonal shading, and subtle paper texture.
Compose it for a 4:5 portrait frame.
Return only the final image.
```

The exact prompt wording is an implementation detail and must be covered by focused tests.

## 10. Shared request contract

The creation request should have two server behaviors: Mark and Image. Logo Mark and Icon are asset types within Mark.

Illustrative TypeScript contract:

```ts
type CreateRequest =
  | {
      mode: "mark";
      assetType: "logo-mark" | "icon";
      description: string;
      style: MarkStyle;
      detail: MarkDetail;
      colorMode: "auto" | "custom";
      colors: string[];
      format: "square-mark";
    }
  | {
      mode: "image";
      prompt: string;
      treatment: ImageTreatment;
      format: ImageFormat;
    };
```

The server resolves `format` to dimensions. Clients must not be trusted to provide arbitrary width and height values.

## 11. Server orchestration

### 11.1 Shared sequence

1. Resolve application project and request IDs.
2. Validate the discriminated request.
3. Resolve the selected format from a server-owned registry.
4. Construct the mode-specific provider instruction.
5. Record sanitized request diagnostics.
6. Require one provider call for one result.
7. Validate the returned PNG.
8. Apply local matte removal only for Mark.
9. Return the temporary browser-owned result.

### 11.2 Mark path

```text
Structured mark brief
    ↓
Symbol-only prompt and matte selection
    ↓
One low-quality generation
    ↓
Edge-connected matte removal
    ↓
Transparent PNG result
```

### 11.3 Image path

```text
User prompt + treatment ID + format ID
    ↓
Server treatment and composition instruction
    ↓
One low-quality generation
    ↓
Validate complete provider PNG
    ↓
Unmodified complete-image result
```

## 12. Provider boundary

The application-owned provider request should contain:

- final provider instruction
- one output count
- resolved width and height
- low quality
- optional mark matte information

The UI must not call OpenAI or another image provider directly.

The provider adapter must:

- request `n=1`
- request low quality
- request PNG output
- pass only server-approved dimensions
- surface provider request IDs and retryability
- keep credentials and SDK response types server-side

The Image path uses text-to-image generation. It does not use the image-edit endpoint because this specification includes no reference upload.

## 13. Project creation and provenance

Choosing **Use in Mirai** creates a new project whose generated result is its immutable original.

It creates:

- one original image version
- zero edit operations
- zero masks
- a new project ID owned by the creation request
- a correlated diagnostic request ID

Recommended generated-origin data:

```ts
interface GeneratedProjectOrigin {
  kind: "asset-generation";
  requestId: string;
  creationMode: "mark" | "image";
  assetType?: "logo-mark" | "icon";
  description: string;
  treatment?: ImageTreatment;
  format: "square-mark" | ImageFormat;
  width: number;
  height: number;
  colorMode?: "auto" | "custom";
  colors: string[];
  provider: "fake" | "openai";
  model: string;
  quality: "low";
}
```

The accepted result must enter the editor through the existing project-original initialization path. UI components must not write history directly.

## 14. Cost controls

- Low quality is mandatory in this version.
- Every request returns one result.
- Every real request requires explicit browser confirmation.
- The existing per-session paid-request limit remains enforced.
- Retrying after a confirmed provider attempt counts as another request.
- Validation failures before the provider call do not consume the browser request allowance.
- No additional LLM call is used to enhance prompts.
- No background-removal API is used.

## 15. Failure behavior

| Failure | Required behavior |
|---|---|
| Empty or too-short description | Disable generation and show a local validation message. |
| Unknown treatment ID | Reject before the provider call. |
| Unknown format ID | Reject before the provider call. |
| Provider configuration unavailable | Keep inputs intact and explain that creation is unavailable. |
| Retryable provider failure | Preserve inputs and allow an explicit retry. |
| Non-retryable provider failure | Preserve inputs and provide a clear failure message. |
| Provider returns no image | Treat as a retryable provider error. |
| Provider returns an unreadable image | Do not create a project; report the invalid result. |
| Mark matte cleanup has low confidence | Show the result with a cleanup warning. |
| Project save fails after Use in Mirai | Keep the result open in the editor and report the save failure. |

Failed requests and discarded results must not advance editor history.

## 16. Diagnostics

Each creation request should record:

- project ID
- application request ID
- provider request ID, when available
- creation mode
- asset type, when applicable
- original user description
- selected treatment ID
- selected format ID
- resolved provider dimensions
- quality
- model and provider
- final provider instruction
- provider timing and usage, when available
- raw provider result
- editor-ready result
- matte color and cleanup confidence for Mark
- retryable or non-retryable failure details

Diagnostics may analyze or copy the candidate but must not modify the result shown to the user.

## 17. Fake-provider behavior

The deterministic fake provider must support both request paths:

- Mark produces one matte-backed mark for local transparency verification.
- Image produces one complete raster composition at the selected format dimensions.

The fake result should make aspect-ratio changes visually obvious so browser tests can detect incorrect format routing.

## 18. Accessibility and responsive behavior

- Primary creation choices use accessible selected-state semantics.
- Treatment and format options expose their selected state with `aria-pressed` or equivalent controls.
- Every icon-only control has an accessible name.
- Keyboard focus remains visible.
- The popup supports keyboard dismissal while idle.
- Generation and close actions are disabled while a request is processing.
- The left controls and result preview become vertically scrollable on smaller screens.
- Use-case labels remain visible on narrow screens; dimensions may use smaller secondary text.

## 19. Build order

Implementation should proceed in this order after explicit authorization:

1. Reconcile the existing popup implementation with this specification without altering the accepted mark-generation behavior.
2. Replace the creation contract with Mark and Image branches.
3. Add server-owned treatment and format registries.
4. Add focused prompt-builder and validation tests.
5. Add the one-result low-quality Image provider path.
6. Update fake-provider output for every supported format.
7. Restore the primary popup selector to Logo Mark, Icon, and Create Image.
8. Add treatment and intended-format controls to Create Image.
9. Update generated-project provenance and diagnostics.
10. Add route, store, and browser workflow tests.
11. Update `FEATURE_CONTEXT.md`, `PROJECT.md`, `LOCAL_DEVELOPMENT_PLAN.md`, and `README.md` to describe final implemented behavior.

## 20. Acceptance criteria

The feature is complete only when all of the following are true:

- The popup has exactly Logo Mark, Icon, and Create Image as primary choices.
- There is no separate Transform tab.
- There is no reference-image upload in Create Image.
- Logo Mark and Icon retain their existing description, style, detail, and palette controls.
- Auto palette remains the Mark default.
- Create Image exposes a prompt, visual treatments, and recognizable use-case formats.
- Selecting Sketch does not overwrite the visible user prompt.
- The server instruction combines the original prompt with the selected treatment.
- Instagram Post, Instagram Portrait, Story / Reel, and YouTube Thumbnail resolve to their documented dimensions.
- Arbitrary client-supplied dimensions are rejected or ignored in favor of the format registry.
- Every request uses low quality and asks for exactly one result.
- Complete images do not receive mark transparency processing.
- Using a result creates one immutable original and zero edit operations.
- Generated provenance records the selected treatment, format, and resolved dimensions.
- Invalid requests fail before a provider call.
- Full unit, route, store, and browser tests pass.
- `FEATURE_CONTEXT.md` matches the final behavior before delivery.

## 21. Deferred follow-ups

Potential follow-ups, in recommended order:

1. Create Similar using the current generated result as a reference.
2. Use Current Canvas Image as a whole-image reference.
3. Creative-to-Faithful reference-strength control.
4. Separate Style Reference and Composition Reference inputs.
5. Prompt suggestions without automatically replacing user text.
6. Multiple references with explicit subject/style roles.
7. Temporary or saved generation history.
8. Approved-draft upscaling or higher-quality final rendering.
9. Final-export presets that normalize generated drafts to exact platform delivery dimensions.

Each follow-up requires separate product approval before implementation.

## 22. Resolved implementation decisions

- The primary UI label is `Create Image`.
- Treatment options use a compact two-column grid.
- Instagram Post is the default format.
- Anime remains in the first treatment set.
- Generating another result retains the previous temporary result until the replacement succeeds.
