-- Premiere-first flow: frames can exist before the GIF is exported

alter table public.booth_sessions
  alter column gif_path drop not null;

create policy "Anyone can update booth sessions"
  on public.booth_sessions
  for update
  to anon, authenticated
  using (true)
  with check (true);

grant update on public.booth_sessions to anon, authenticated;
