-- Ignore is a special purpose for transactions that should remain visible in
-- the ledger without contributing to income, spending, or budget totals.
alter table public.categories
  drop constraint if exists categories_purpose_check;

alter table public.categories
  add constraint categories_purpose_check
  check (purpose in ('spend', 'save_grow', 'move', 'give', 'ignore'));

-- Keep the existing sign-specific category model, but allow either Ignore row
-- to be used for either side of the ledger. The UI presents both rows as one
-- Ignore option in the appropriate signed transaction dropdown.
create or replace function public.validate_transaction_category_type()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  category_owner uuid;
  category_type text;
  category_purpose text;
begin
  if new.category_id is null then
    return new;
  end if;

  select categories.user_id, categories.category_type, categories.purpose
  into category_owner, category_type, category_purpose
  from public.categories
  where categories.id = new.category_id;

  if not found then
    raise exception 'The selected category does not exist.' using errcode = '23503';
  end if;

  if category_owner is distinct from new.user_id then
    raise exception 'A transaction can only use one of the user''s categories.' using errcode = '42501';
  end if;

  if category_purpose = 'ignore' then
    return new;
  end if;

  if new.amount_cents < 0 and category_type <> 'expense' then
    raise exception 'Withdrawals and expenses must use an expense category.' using errcode = '23514';
  end if;

  if new.amount_cents > 0 and category_type <> 'income' then
    raise exception 'Deposits and income must use an income category.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_transaction_category_type() from public;

-- Ensure existing users get both sign-compatible Ignore options. If a user
-- already created a category with this canonical name, make it the special
-- ignored category instead of creating a duplicate.
insert into public.categories (user_id, name, category_type, purpose, color, icon)
select profiles.id, defaults.name, defaults.category_type, 'ignore', '#d8dce5', '⊘'
from public.profiles as profiles
cross join (
  values
    ('Ignore'::text, 'expense'::text),
    ('Ignore'::text, 'income'::text)
) as defaults(name, category_type)
on conflict (user_id, name, category_type) do update
set purpose = 'ignore', color = excluded.color, icon = excluded.icon;

-- Seed future users at account creation time alongside their profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, category_type, purpose, color, icon)
  values
    (new.id, 'Ignore', 'expense', 'ignore', '#d8dce5', '⊘'),
    (new.id, 'Ignore', 'income', 'ignore', '#d8dce5', '⊘')
  on conflict (user_id, name, category_type) do update
  set purpose = 'ignore', color = excluded.color, icon = excluded.icon;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
