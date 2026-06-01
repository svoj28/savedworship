alter table public.lineup_items
  add column if not exists user_id text default '',
  add column if not exists song_id text not null default '',
  add column if not exists artist text,
  add column if not exists song_title text,
  add column if not exists song_key text,
  add column if not exists version_url text,
  add column if not exists category text not null default 'any',
  add column if not exists created_at bigint,
  add column if not exists updated_at bigint,
  add column if not exists created_at_iso text,
  add column if not exists updated_at_iso text;

create index if not exists idx_lineup_items_lineup_id on public.lineup_items (lineup_id);
create index if not exists idx_lineup_items_user_id on public.lineup_items (user_id);

alter table public.lineup_items enable row level security;

drop policy if exists "lineup_items_select" on public.lineup_items;
drop policy if exists "lineup_items_insert" on public.lineup_items;
drop policy if exists "lineup_items_update" on public.lineup_items;
drop policy if exists "lineup_items_delete" on public.lineup_items;

create policy "lineup_items_select"
on public.lineup_items
for select
using (
  auth.uid() is not null
);

create policy "lineup_items_insert"
on public.lineup_items
for insert
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.user_id::text = auth.uid()::text
      and up.role in ('manager', 'superadmin')
  )
);

create policy "lineup_items_update"
on public.lineup_items
for update
using (
  exists (
    select 1
    from public.user_profiles up
    where up.user_id::text = auth.uid()::text
      and up.role in ('manager', 'superadmin')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.user_id::text = auth.uid()::text
      and up.role in ('manager', 'superadmin')
  )
);

create policy "lineup_items_delete"
on public.lineup_items
for delete
using (
  exists (
    select 1
    from public.user_profiles up
    where up.user_id::text = auth.uid()::text
      and up.role in ('manager', 'superadmin')
  )
);