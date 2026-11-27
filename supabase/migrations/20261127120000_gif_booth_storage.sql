-- Public GIF storage for Field Trip booth exports

insert into storage.buckets (id, name, public)
values ('gif-booth', 'gif-booth', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read gif-booth" on storage.objects;
create policy "Public read gif-booth"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'gif-booth');

drop policy if exists "Anyone can upload gif-booth" on storage.objects;
create policy "Anyone can upload gif-booth"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'gif-booth');

drop policy if exists "Anyone can update gif-booth" on storage.objects;
create policy "Anyone can update gif-booth"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'gif-booth')
  with check (bucket_id = 'gif-booth');

drop policy if exists "Anyone can delete gif-booth" on storage.objects;
create policy "Anyone can delete gif-booth"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'gif-booth');
