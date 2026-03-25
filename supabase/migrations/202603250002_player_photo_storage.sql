insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'account-player-photos',
  'account-player-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view player photos" on storage.objects;
create policy "Public can view player photos"
on storage.objects
for select
to public
using (bucket_id = 'account-player-photos');

drop policy if exists "Authenticated can upload player photos" on storage.objects;
create policy "Authenticated can upload player photos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'account-player-photos');

drop policy if exists "Authenticated can update player photos" on storage.objects;
create policy "Authenticated can update player photos"
on storage.objects
for update
to authenticated
using (bucket_id = 'account-player-photos')
with check (bucket_id = 'account-player-photos');

drop policy if exists "Authenticated can delete player photos" on storage.objects;
create policy "Authenticated can delete player photos"
on storage.objects
for delete
to authenticated
using (bucket_id = 'account-player-photos');
