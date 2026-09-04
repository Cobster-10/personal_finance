-- A durable lease works across independent Vercel function instances and regions.
-- It is intentionally stored on the Item rather than relying on a connection-scoped
-- advisory lock, which Supavisor transaction pooling can release between requests.
alter table public.plaid_items
  add column if not exists sync_lock_token uuid,
  add column if not exists sync_lock_expires_at timestamptz;

create or replace function public.claim_plaid_item_sync(
  p_item_id uuid,
  p_user_id uuid,
  p_lock_token uuid,
  p_lease_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_seconds < 60 or p_lease_seconds > 900 then
    raise exception 'Plaid sync lease duration must be between 60 and 900 seconds.' using errcode = '22023';
  end if;

  update public.plaid_items
  set sync_lock_token = p_lock_token,
      sync_lock_expires_at = timezone('utc', now()) + make_interval(secs => p_lease_seconds)
  where id = p_item_id
    and user_id = p_user_id
    and (sync_lock_expires_at is null or sync_lock_expires_at < timezone('utc', now()));

  return found;
end;
$$;

create or replace function public.apply_plaid_item_sync(
  p_item_id uuid,
  p_user_id uuid,
  p_lock_token uuid,
  p_next_cursor text,
  p_transactions jsonb,
  p_removed_transaction_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reject stale workers before any write. All statements in this function share
  -- the caller's transaction, so data and the cursor commit or roll back together.
  if not exists (
    select 1 from public.plaid_items
    where id = p_item_id
      and user_id = p_user_id
      and sync_lock_token = p_lock_token
      and sync_lock_expires_at > timezone('utc', now())
  ) then
    raise exception 'Plaid sync lease is no longer held.' using errcode = '55P03';
  end if;

  insert into public.transactions (
    user_id, account_id, amount_cents, transaction_date, merchant_name,
    description, status, source, plaid_transaction_id,
    plaid_pending_transaction_id, currency_code
  )
  select
    transaction_row.user_id,
    transaction_row.account_id,
    transaction_row.amount_cents,
    transaction_row.transaction_date,
    transaction_row.merchant_name,
    transaction_row.description,
    transaction_row.status,
    transaction_row.source,
    transaction_row.plaid_transaction_id,
    transaction_row.plaid_pending_transaction_id,
    transaction_row.currency_code
  from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as transaction_row(
    user_id uuid,
    account_id uuid,
    amount_cents bigint,
    transaction_date date,
    merchant_name text,
    description text,
    status text,
    source text,
    plaid_transaction_id text,
    plaid_pending_transaction_id text,
    currency_code text
  )
  join public.accounts on public.accounts.id = transaction_row.account_id
    and public.accounts.user_id = p_user_id
    and public.accounts.plaid_item_id = p_item_id
  where transaction_row.user_id = p_user_id
  on conflict (user_id, plaid_transaction_id) do update
  set account_id = excluded.account_id,
      amount_cents = excluded.amount_cents,
      transaction_date = excluded.transaction_date,
      merchant_name = excluded.merchant_name,
      description = excluded.description,
      status = excluded.status,
      plaid_pending_transaction_id = excluded.plaid_pending_transaction_id,
      currency_code = excluded.currency_code;

  delete from public.transactions as transaction_row
  using public.accounts
  where public.accounts.id = transaction_row.account_id
    and public.accounts.user_id = p_user_id
    and public.accounts.plaid_item_id = p_item_id
    and transaction_row.user_id = p_user_id
    and transaction_row.plaid_transaction_id = any(coalesce(p_removed_transaction_ids, array[]::text[]));

  update public.plaid_items
  set sync_cursor = p_next_cursor,
      status = 'healthy'
  where id = p_item_id
    and user_id = p_user_id
    and sync_lock_token = p_lock_token
    and sync_lock_expires_at > timezone('utc', now());

  if not found then
    raise exception 'Plaid sync lease is no longer held.' using errcode = '55P03';
  end if;
end;
$$;

create or replace function public.release_plaid_item_sync(
  p_item_id uuid,
  p_user_id uuid,
  p_lock_token uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.plaid_items
  set sync_lock_token = null,
      sync_lock_expires_at = null
  where id = p_item_id
    and user_id = p_user_id
    and sync_lock_token = p_lock_token;
$$;

revoke all on function public.claim_plaid_item_sync(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.apply_plaid_item_sync(uuid, uuid, uuid, text, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.release_plaid_item_sync(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_plaid_item_sync(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.apply_plaid_item_sync(uuid, uuid, uuid, text, jsonb, text[]) to service_role;
grant execute on function public.release_plaid_item_sync(uuid, uuid, uuid) to service_role;

-- The browser only receives the specific operations its current UI uses.
revoke all on table public.profiles, public.accounts, public.categories,
  public.transactions, public.budgets, public.budget_categories, public.plaid_items
  from anon, authenticated;

grant select on table public.profiles, public.accounts to authenticated;
grant select, insert, update on table public.categories to authenticated;
grant select, update on table public.transactions to authenticated;
grant select, insert, update on table public.budgets, public.budget_categories to authenticated;
