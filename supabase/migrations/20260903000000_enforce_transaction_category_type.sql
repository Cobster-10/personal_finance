create or replace function public.validate_transaction_category_type()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  category_owner uuid;
  category_type text;
begin
  if new.category_id is null then
    return new;
  end if;

  select categories.user_id, categories.category_type
  into category_owner, category_type
  from public.categories
  where categories.id = new.category_id;

  if not found then
    raise exception 'The selected category does not exist.' using errcode = '23503';
  end if;

  if category_owner is distinct from new.user_id then
    raise exception 'A transaction can only use one of the user''s categories.' using errcode = '42501';
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

drop trigger if exists validate_transaction_category_type on public.transactions;
create trigger validate_transaction_category_type
before insert or update of user_id, category_id, amount_cents
on public.transactions
for each row execute function public.validate_transaction_category_type();
