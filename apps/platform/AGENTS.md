<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository engineering standards

[`ENGINEERING_STANDARDS.md`](../../ENGINEERING_STANDARDS.md) is the canonical engineering standard for this repository.

When recommending or writing prompts for another model/agent, follow its
**Prompt Model Selection** policy and the current model guide at [`MODEL_SELECTION.md`](../../MODEL_SELECTION.md).

Use the header format `Model:` / `Strength:`. Pick the best model for the task at
the lowest Strength that is still fully capable.
