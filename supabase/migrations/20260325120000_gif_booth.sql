-- FrameFlash GIF Booth schema
-- Run in Supabase SQL editor or via: supabase db push

create extension if not exists "pgcrypto";

create table if not exists public.booth_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  gif_path text,
  gif_url text,
  frame_count integer not null default 5,
  status text not null default 'premiere_pending'
);

alter table public.booth_sessions enable row level security;

create policy "Anyone can insert booth sessions"
  on public.booth_sessions
  for insert
  to anon, authenticated
  with check (true);

create policy "Anyone can read booth sessions"
  on public.booth_sessions
  for select
  to anon, authenticated
  using (true);

create policy "Anyone can update booth sessions"
  on public.booth_sessions
  for update
  to anon, authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('gif-booth', 'gif-booth', true)
on conflict (id) do update set public = excluded.public;

create policy "Public read gif-booth"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'gif-booth');

create policy "Anyone can upload gif-booth"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'gif-booth');

-- Needed if clients retry / replace objects
create policy "Anyone can update gif-booth"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'gif-booth')
  with check (bucket_id = 'gif-booth');

grant select, insert, update on public.booth_sessions to anon, authenticated;
grant usage on schema public to anon, authenticated;
