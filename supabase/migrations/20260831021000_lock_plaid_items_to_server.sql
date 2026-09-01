create policy "Plaid Items are server-only"
on public.plaid_items
for all
to anon, authenticated
using (false)
with check (false);
