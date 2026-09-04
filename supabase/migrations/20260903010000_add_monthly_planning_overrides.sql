alter table public.budgets
  add column if not exists expected_income_cents bigint
    check (expected_income_cents is null or expected_income_cents >= 0),
  add column if not exists total_budget_override_cents bigint
    check (total_budget_override_cents is null or total_budget_override_cents >= 0);
