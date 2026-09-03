alter table public.plaid_items
  add column if not exists plaid_environment text not null default 'sandbox';

alter table public.plaid_items
  drop constraint if exists plaid_items_plaid_environment_check;

alter table public.plaid_items
  add constraint plaid_items_plaid_environment_check
  check (plaid_environment in ('sandbox', 'production'));

create index if not exists plaid_items_environment_idx
  on public.plaid_items(user_id, plaid_environment);
