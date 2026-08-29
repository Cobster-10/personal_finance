# Project overview

Sketch Finance is a web-based personal finance app. Its initial product scope is to track income across accounts and time periods, track expenses across time periods, and categorize expenses.

The app uses Next.js, React, TypeScript, and custom CSS, with Rough.js for the hand-drawn SVG details and Gloria Hallelujah for the handwritten typography. The visual direction is an Excalidraw-like scratch-paper interface with imperfect outlines, hachure fills, and restrained coral, green, and ink colors. The product is transitioning from a frontend prototype to a Supabase-backed application.

The first dashboard screen from the Figma design is implemented. It currently includes:

- A responsive navigation bar and month selector.
- An embedded Sketchfab jellyfish-in-a-bottle model for the income visualization.
- An interactive receipt-stack spending meter. Budget and spending values are editable frontend state; changing them updates the percentage, stack height, and generated receipt count.
- Percentage-driven expense category meters built as real React/CSS components rather than pasted Figma images.

The Supabase integration foundation is now prepared locally: `@supabase/ssr` and `@supabase/supabase-js` are installed, browser/server clients live in `lib/supabase/`, and `.env.example` documents the required project URL and publishable key. The Supabase MCP is authenticated in Codex, but no Supabase project has been created or selected yet. The initial schema/RLS migration is in `supabase/migrations/20260828000000_initial_schema.sql`, but it has not been applied. Values are still mock frontend data. Keep UI components data-driven so real financial data can replace the mock state later without redesigning the presentation layer.

## Product roadmap

1. Select or create a Supabase development project, populate `.env.local`, and apply the initial migration.
2. Generate database types and replace hardcoded dashboard values with authenticated Supabase data.
3. Add transaction, account, category, and monthly budget management screens.
4. Add CSV transaction importing and duplicate protection.
5. Add bank syncing only after the manual-data flow is reliable; never connect MCP or test integrations to production financial data.

Before handing off frontend changes, run `npm run typecheck`, `npm run lint`, and `npm run build`. For interaction or layout changes, also verify the page in a browser.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
