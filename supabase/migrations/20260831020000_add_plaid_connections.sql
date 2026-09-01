create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_id text not null,
  plaid_institution_id text,
  institution_name text,
  access_token_ciphertext text not null,
  access_token_key_version text not null default 'v1',
  sync_cursor text,
  status text not null default 'healthy'
    check (status in ('healthy', 'login_required', 'revoked', 'error')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, plaid_item_id)
);

create index if not exists plaid_items_user_id_idx on public.plaid_items(user_id);
alter table public.plaid_items enable row level security;

drop trigger if exists set_plaid_items_updated_at on public.plaid_items;
create trigger set_plaid_items_updated_at
before update on public.plaid_items
for each row execute function public.set_updated_at();

alter table public.accounts
  add column if not exists plaid_item_id uuid references public.plaid_items(id) on delete set null,
  add column if not exists plaid_account_id text,
  add column if not exists account_mask text;

create unique index if not exists accounts_user_plaid_account_id_idx
  on public.accounts(user_id, plaid_account_id)
  where plaid_account_id is not null;

create index if not exists accounts_plaid_item_id_idx
  on public.accounts(plaid_item_id)
  where plaid_item_id is not null;

alter table public.transactions
  add column if not exists plaid_transaction_id text,
  add column if not exists plaid_pending_transaction_id text,
  add column if not exists currency_code text;

alter table public.transactions
  drop constraint if exists transactions_user_plaid_transaction_id_key;

alter table public.transactions
  add constraint transactions_user_plaid_transaction_id_key
  unique (user_id, plaid_transaction_id);

create index if not exists transactions_plaid_account_lookup_idx
  on public.transactions(user_id, account_id, transaction_date desc);
