alter table public.categories
  add column if not exists purpose text not null default 'spend';

alter table public.categories
  drop constraint if exists categories_purpose_check;

alter table public.categories
  add constraint categories_purpose_check
  check (purpose in ('spend', 'save_grow', 'move', 'give'));

create index if not exists categories_user_type_idx
  on public.categories(user_id, category_type);
