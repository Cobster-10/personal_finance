# Sketch Finance agent API

All paths require `Authorization: Bearer <OPENCLAW_AGENT_API_KEY>`. Responses
set `Cache-Control: no-store`; never cache or publish them. The API is scoped
to the one user configured by `OPENCLAW_AGENT_USER_ID`, so it does not accept
user IDs in requests.

## Endpoints

- `GET /api/agent/overview?month=YYYY-MM-01`
  - Returns `totals`, current-month `categories`, `give_commitment`, and
    `alerts`.
  - `alerts` may be `near_budget` (80% used), `over_budget`,
    `overall_near_budget`, `overall_over_budget`, or
    `give_commitment_outstanding`.
- `GET /api/agent/categories?month=YYYY-MM-01`
  - Returns the category IDs needed for assignments and each category's
    current-month budget and spending.
- `GET /api/agent/transactions?state=all|uncategorized&month=YYYY-MM-01&limit=1..500`
  - `month` is optional. `state` defaults to `all`; `limit` defaults to 100.
  - Returns a minimal transaction record and its assigned category, if any.
- `PATCH /api/agent/transactions/:transactionId`
  - JSON body: `{ "category_id": "UUID" }` or `{ "category_id": null }`.
  - This is the only write operation.

## OpenClaw setup

Set the API URL and token as OpenClaw environment secrets, not in this skill
file. The exact secret-management UI/configuration depends on the OpenClaw
installation, but the skill requires these names:

```text
SKETCH_FINANCE_API_URL=https://your-app.example.com
SKETCH_FINANCE_API_KEY=<the same value as OPENCLAW_AGENT_API_KEY>
```

Install this folder from the application repository root:

```bash
openclaw skills install ./openclaw-skills/sketch-finance --as sketch-finance
openclaw skills check
```

For a production deployment, set `OPENCLAW_AGENT_API_KEY` and
`OPENCLAW_AGENT_USER_ID` in the app's server environment and redeploy before
using the skill. Rotate the API key if the agent host, logs, or token may have
been exposed.
