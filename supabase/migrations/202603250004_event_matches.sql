do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'match_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.match_status as enum ('draft', 'completed');
  end if;
end
$$;

create table if not exists public.event_matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  status public.match_status not null default 'draft',
  sort_order integer not null default 0,
  starts_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, sort_order)
);

create table if not exists public.event_match_teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.event_matches(id) on delete cascade,
  side text not null check (side in ('home', 'away')),
  name text not null,
  score integer not null default 0 check (score >= 0),
  source_team_id uuid references public.event_match_teams(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (match_id, side)
);

create table if not exists public.event_match_team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.event_match_teams(id) on delete cascade,
  account_player_id uuid not null references public.account_players(id),
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (team_id, account_player_id),
  unique (team_id, sort_order)
);

create index if not exists idx_event_matches_event on public.event_matches(event_id, sort_order);
create index if not exists idx_event_match_teams_match on public.event_match_teams(match_id);
create index if not exists idx_event_match_team_players_team on public.event_match_team_players(team_id, sort_order);
create index if not exists idx_event_match_team_players_player on public.event_match_team_players(account_player_id);

drop trigger if exists set_event_matches_updated_at on public.event_matches;
create trigger set_event_matches_updated_at
before update on public.event_matches
for each row execute function public.set_updated_at();

drop trigger if exists set_event_match_teams_updated_at on public.event_match_teams;
create trigger set_event_match_teams_updated_at
before update on public.event_match_teams
for each row execute function public.set_updated_at();
