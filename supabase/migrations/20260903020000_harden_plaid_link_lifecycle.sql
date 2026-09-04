create table if not exists public.plaid_link_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_link_token text not null,
  is_ready boolean not null default false,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (expires_at > created_at)
);

create index if not exists plaid_link_attempts_user_created_at_idx
  on public.plaid_link_attempts(user_id, created_at desc);

alter table public.plaid_link_attempts enable row level security;

-- Link tokens are credentials. Only server routes using the Supabase secret key
-- may read or mutate this table.
revoke all on table public.plaid_link_attempts from anon, authenticated;

-- Serialize per-user reservations so concurrent Link-token requests cannot
-- exceed either the hourly Link quota or the connected-Item cap.
create or replace function public.reserve_plaid_link_attempt(
  p_user_id uuid,
  p_expires_at timestamptz,
  p_plaid_environment text,
  p_max_attempts integer default 3,
  p_max_items integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_id uuid;
begin
  if p_max_attempts < 1 or p_max_attempts > 20 or p_max_items < 1 or p_max_items > 20 then
    raise exception 'Invalid Plaid connection limits.' using errcode = '22023';
  end if;
  if p_plaid_environment not in ('sandbox', 'production') then
    raise exception 'Invalid Plaid environment.' using errcode = '22023';
  end if;
  if p_expires_at <= timezone('utc', now()) or p_expires_at > timezone('utc', now()) + interval '4 hours' then
    raise exception 'Invalid Plaid Link expiration.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 54123));

  if (
    select count(*)
    from public.plaid_link_attempts
    where user_id = p_user_id
      and created_at >= timezone('utc', now()) - interval '1 hour'
  ) >= p_max_attempts then
    raise exception 'Plaid Link attempt quota exceeded.' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.plaid_items
    where user_id = p_user_id
      and plaid_environment = p_plaid_environment
  ) >= p_max_items then
    raise exception 'Plaid connected institution maximum reached.' using errcode = 'P0001';
  end if;

  insert into public.plaid_link_attempts (user_id, encrypted_link_token, expires_at)
  values (p_user_id, 'pending', p_expires_at)
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

revoke all on function public.reserve_plaid_link_attempt(uuid, timestamptz, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_plaid_link_attempt(uuid, timestamptz, text, integer, integer) to service_role;
