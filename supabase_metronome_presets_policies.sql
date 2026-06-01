alter table public.metronome_presets
  add column if not exists use_time_signatures boolean not null default false,
  add column if not exists time_signature_label text;

alter table public.metronome_presets enable row level security;

drop policy if exists "metronome_presets_select" on public.metronome_presets;
drop policy if exists "metronome_presets_insert" on public.metronome_presets;
drop policy if exists "metronome_presets_update" on public.metronome_presets;
drop policy if exists "metronome_presets_delete" on public.metronome_presets;

create policy "metronome_presets_select"
on public.metronome_presets
for select
using (
  user_id::text = auth.uid()::text
  or (scope = 'overall' and is_public = true)
);

create policy "metronome_presets_insert"
on public.metronome_presets
for insert
with check (
  user_id::text = auth.uid()::text
);

create policy "metronome_presets_update"
on public.metronome_presets
for update
using (
  user_id::text = auth.uid()::text
)
with check (
  user_id::text = auth.uid()::text
);

create policy "metronome_presets_delete"
on public.metronome_presets
for delete
using (
  user_id::text = auth.uid()::text
);