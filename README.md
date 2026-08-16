# Mirai — Reversible AI Image Editor

A local-first AI image editor with selection-aware generation, semantic-fidelity validation, reversible history, and reproducible diagnostics.

Edit an image, compare the result, accept or discard it, and undo any accepted change.

<!-- Add a hero image or short Upload → Select → Generate → Compare → Accept GIF here. -->

## Features

- **AI editing** — Remove, replace, restyle, transform, and extend images.
- **Precise control** — Use selections as flexible focus hints or protected edit boundaries.
- **Safe review** — Compare generated results before accepting them.
- **Reversible history** — Undo and redo immutable image versions without changing the original.
- **Local projects** — Save projects, inspect request diagnostics, and export PNG or JPEG.

<!-- Add three examples here: selection-aware editing, before/after comparison, and history or diagnostics. -->

## Quick start

```bash
git clone https://github.com/nothing331/Mirai.git
cd Mirai && npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No API key is required for the default demo workflow.

## How it fits together

```mermaid
flowchart LR
    UI["Editor"] --> P["Edit pipeline"]
    P --> L["Local processing"]
    P --> AI["AI provider"]
    L --> R["Review"]
    AI --> R
    R --> H["Reversible history"]
    P -.-> D["Diagnostics"]
```

Built as a Next.js and TypeScript modular monolith, with provider integrations kept behind server-side interfaces.

## What I designed and implemented

- The canvas editing workflow and selection-aware AI experience
- A shared pipeline for deterministic and generative edits
- Immutable image versions with undo, redo, comparison, persistence, and export
- Provider-neutral generation, semantic checks, and reproducible request diagnostics

## Engineering decisions

Mirai preserves the original image, treats AI output as a reviewable proposal, and records every accepted edit as an immutable version.

See [PROJECT.md](./PROJECT.md) for the architecture, tradeoffs, and design decisions.

## Testing

Run the standard verification suite:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Install Playwright Chromium once, then run the browser workflow:

```bash
npx playwright install chromium
npm run test:e2e
```

Tests cover coordinate conversion, masks, protected pixels, edit acceptance, history, persistence, and export.

## Using OpenAI

The deterministic fake provider is enabled by default. To test real generation, copy `.env.example` to `.env.local`, set `IMAGE_EDIT_PROVIDER=openai`, and add `OPENAI_API_KEY`. Credentials remain server-side and must not be committed.

## Current limitations

- Local single-user application; no authentication or collaboration
- Linear history; no independent layers or history branches
- Real AI edits require an OpenAI API key and may incur usage costs
- Semantic checks reduce unintended changes but cannot guarantee perfect results

## Privacy

Local diagnostics may contain uploaded images, generated images, masks, and exact prompts. They are excluded from Git but should still be treated as sensitive.

When OpenAI is enabled, relevant images, masks, and prompts are sent to the configured provider.

## Documentation

- [Project architecture and decisions](./PROJECT.md)
- [Implemented feature behavior](./FEATURE_CONTEXT.md)
- [Frontend design system](./FRONTEND_DESIGN.md)
- [Development plan](./LOCAL_DEVELOPMENT_PLAN.md)

## License

Portfolio project. The source is publicly viewable for evaluation, but reuse or redistribution is not permitted.
