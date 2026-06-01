create table if not exists public.team_calendar_events (
  id text primary key,
  event_date text not null,
  title text not null,
  assignments text,
  notes text,
  user_id text not null,
  created_at bigint,
  updated_at bigint,
  created_at_iso text,
  updated_at_iso text
);

create index if not exists idx_team_calendar_events_date on public.team_calendar_events (event_date);
create index if not exists idx_team_calendar_events_user_id on public.team_calendar_events (user_id);

alter table public.team_calendar_events enable row level security;

drop policy if exists "team_calendar_events_select" on public.team_calendar_events;
drop policy if exists "team_calendar_events_insert" on public.team_calendar_events;
drop policy if exists "team_calendar_events_update" on public.team_calendar_events;
drop policy if exists "team_calendar_events_delete" on public.team_calendar_events;

create policy "team_calendar_events_select"
on public.team_calendar_events
for select
using (
  auth.uid() is not null
);

create policy "team_calendar_events_insert"
on public.team_calendar_events
for insert
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.user_id::text = auth.uid()::text
      and up.role in ('manager', 'superadmin')
  )
);

create policy "team_calendar_events_update"
on public.team_calendar_events
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

create policy "team_calendar_events_delete"
on public.team_calendar_events
for delete
using (
  exists (
    select 1
    from public.user_profiles up
    where up.user_id::text = auth.uid()::text
      and up.role in ('manager', 'superadmin')
  )
);