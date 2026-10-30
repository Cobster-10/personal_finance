alter table public.plaid_link_attempts
  add column if not exists plaid_item_id uuid references public.plaid_items(id) on delete cascade;

create index if not exists plaid_link_attempts_item_id_idx
  on public.plaid_link_attempts(plaid_item_id)
  where plaid_item_id is not null;

-- A reconnect token must be bound to the existing Item. This keeps a normal
-- Link session from being used to repair another institution.
create or replace function public.reserve_plaid_link_update_attempt(
  p_user_id uuid,
  p_item_id uuid,
  p_plaid_environment text,
  p_expires_at timestamptz,
  p_max_attempts integer default 3
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_id uuid;
begin
  if p_max_attempts < 1 or p_max_attempts > 20 then
    raise exception 'Invalid Plaid connection limits.' using errcode = '22023';
  end if;
  if p_plaid_environment not in ('sandbox', 'production') then
    raise exception 'Invalid Plaid environment.' using errcode = '22023';
  end if;
  if p_expires_at <= timezone('utc', now()) or p_expires_at > timezone('utc', now()) + interval '4 hours' then
    raise exception 'Invalid Plaid Link expiration.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 54123));

  if not exists (
    select 1
    from public.plaid_items
    where id = p_item_id
      and user_id = p_user_id
      and plaid_environment = p_plaid_environment
      and status = 'login_required'
  ) then
    raise exception 'This institution no longer needs reconnection or is unavailable.' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.plaid_link_attempts
    where user_id = p_user_id
      and created_at >= timezone('utc', now()) - interval '1 hour'
  ) >= p_max_attempts then
    raise exception 'Plaid Link attempt quota exceeded.' using errcode = 'P0001';
  end if;

  insert into public.plaid_link_attempts (user_id, plaid_item_id, encrypted_link_token, expires_at)
  values (p_user_id, p_item_id, 'pending', p_expires_at)
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

revoke all on function public.reserve_plaid_link_update_attempt(uuid, uuid, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_plaid_link_update_attempt(uuid, uuid, text, timestamptz, integer) to service_role;
