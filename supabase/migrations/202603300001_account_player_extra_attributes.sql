alter table public.account_players
  add column if not exists age integer,
  add column if not exists rating numeric(4,2),
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_players_age_range_check'
      and conrelid = 'public.account_players'::regclass
  ) then
    alter table public.account_players
      add constraint account_players_age_range_check
      check (age is null or (age >= 0 and age <= 120));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_players_rating_range_check'
      and conrelid = 'public.account_players'::regclass
  ) then
    alter table public.account_players
      add constraint account_players_rating_range_check
      check (rating is null or (rating >= 0 and rating <= 10));
  end if;
end $$;
