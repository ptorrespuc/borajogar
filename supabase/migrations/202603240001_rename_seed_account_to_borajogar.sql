update public.sports_accounts
set
  name = 'BoraJogar',
  slug = 'borajogar',
  updated_at = timezone('utc', now())
where slug = 'futebol-de-quarta'
  and not exists (
    select 1
    from public.sports_accounts as existing
    where existing.slug = 'borajogar'
  );

update public.sports_accounts
set
  name = 'BoraJogar',
  updated_at = timezone('utc', now())
where slug = 'borajogar';
