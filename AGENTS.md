# Project context

Sketch Finance is a Next.js 16 App Router personal-finance app using React, TypeScript, custom CSS, Rough.js, Gloria Hallelujah, and an Excalidraw-like scratch-paper visual style. It has:

- An authenticated Snapshot dashboard with a month selector, income jar, receipt spending meter, and expense-category cards.
- `/transactions`, a chronological ledger of synced/manual transactions with masked account identifiers and category assignment.
- A Categories planner at `/?tab=categories`.
- A Settings tab that is present but not implemented.

## Data and Supabase

The app uses Supabase project `mjzzkicesrokapzgnxjs` through SSR browser/server clients in `lib/supabase/`. Configuration is documented in `.env.example`. Public tables use RLS and user-ownership checks. Never expose Supabase secret/service-role keys, Plaid secrets, encrypted access tokens, or other server-only values to the browser.

Migrations in `supabase/migrations/` cover profiles, accounts, categories, transactions, budgets, Plaid connections, environment isolation, category-type enforcement, and monthly planning overrides. `transactions.category_id` links transactions to `categories`; a database trigger enforces negative transactions → expense categories and positive transactions → income categories. The monthly budget defaults to the sum of expense-category budgets, while nullable overrides persist manually edited expected income and overall budget values.

## Plaid integration

Plaid Link tokens are created server-side for US checking and credit-card accounts with the Transactions product. After Link returns a public token, `/api/plaid/exchange` exchanges it server-side, filters eligible accounts, encrypts and stores the access token in `plaid_items`, stores only masked account metadata, and runs an initial `/transactions/sync`.

`lib/plaid/sync.ts` stores selected fields: account mapping, signed amount in cents, date, merchant, original description, pending/cleared status, Plaid transaction IDs, source, and currency. It preserves the cursor, upserts added/modified rows, and deletes removed rows. `/api/plaid/webhook` verifies Plaid webhook signatures and triggers incremental syncs; item reauthentication/error statuses are recorded. Access tokens are long-lived, but a bank may require reauthentication. Plaid updates are asynchronous rather than real-time, so the page must reload to show newly stored data. Sandbox and Production items must remain separate; `PLAID_ENV` is enforced.

## Development rules

Keep financial data server-side and rely on RLS for user isolation. Keep UI components data-driven and use `next/link` for navigation. Before handoff run:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Also browser-verify UI and interaction changes.

Known follow-ups: add Plaid Link update-mode “Reconnect account” UI for `login_required` items, enable Supabase leaked-password protection, and decide whether to add manual/on-demand transaction refresh.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
