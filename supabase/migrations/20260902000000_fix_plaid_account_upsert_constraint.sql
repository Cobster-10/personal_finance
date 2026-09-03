drop index if exists public.accounts_user_plaid_account_id_idx;

alter table public.accounts
  drop constraint if exists accounts_user_plaid_account_id_key;

alter table public.accounts
  add constraint accounts_user_plaid_account_id_key
  unique (user_id, plaid_account_id);
